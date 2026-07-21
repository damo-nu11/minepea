/**
 * ApiGameStore — the live-backend implementation of the SAME
 * Store<EngineSnapshot> seam the mock engine fills. Selected in
 * lib/engineContext.tsx when NEXT_PUBLIC_API_URL is set; the seam test in
 * lib/hooks/useGame.test.tsx is the proof components can't tell the
 * difference. Field-level dialect translation lives in lib/api/translate.ts;
 * the endpoint/SSE contract is FRONTEND_INTEGRATION_MAP.md + backend/API.md.
 *
 * Protocol (live backend, api.minepea.com):
 *   Bootstrap (parallel, per-leg partial apply — only round/current flips
 *   `bootstrapped`):
 *     GET /api/round/current?user=<addr>   → round + user slice
 *     GET /api/round/:id/deploys (×2)      → feed hydration (current + prev)
 *     GET /api/rounds?settled&limit=60     → history
 *     GET /api/price                       → peaUsd (30s poll thereafter)
 *   SSE GET /api/events/rounds:
 *     deployed        → grid replace + feed append + own-deploy lock
 *     roundTransition → winner reveal (held SETTLING_MS) → next round
 *     heartbeat / yieldDistributed → ignored here
 *
 * NO write surface: deploys/claims/staking are on-chain txs (lib/tx/) — this
 * store no longer implements GameActions, so useEngineActions() returns null
 * in API mode.
 *
 * Timing model: settlement is VRF-driven and can lag endTime by MINUTES.
 * A 500ms local timer flips active→settling at endsAt (grid locks, CTA
 * "Settling..."); the winner reveal + rollover happen only when the
 * roundTransition event arrives. The reveal re-anchors endsAt to now()
 * (see translate.withSettlement) and holds the new round for SETTLING_MS so
 * the MineGrid animation plays exactly as in the mock.
 *
 * Lifecycle hardening carried over from the previous protocol (audit-pinned):
 * - epoch counter: unsubscribe/resubscribe while async work is in flight
 *   (React StrictMode) can never leak an EventSource or apply stale data.
 * - bootstrapSeq: only the latest-issued bootstrap may apply.
 * - merge-not-replace: SSE data that raced ahead of a fetch survives it
 *   (round monotonic guard, feed txHash-dedupe union, history roundId union,
 *   sseTouchedUser shields a raced own-deploy lock from a stale fetch).
 * - Feed ids are client-assigned + monotonic, deduped by txHash BEFORE id
 *   assignment so reconnect re-hydrations can't duplicate React keys.
 * - On SSE 'open' (incl. auto-reconnects) the bootstrap re-runs — events
 *   missed while disconnected are gone from the stream but recoverable via
 *   the deploys/rounds refetch; 'error' before any bootstrap surfaces as
 *   EngineSnapshot.error so hooks can render the error state.
 *
 * Deliberately dependency-injected (fetch + EventSource + now) for tests.
 */

import { report } from "@/lib/report";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
// FEED_LIMIT/SETTLING_MS shared with the mock engine so the two Store
// implementations can't drift (feed must hold the previous round's full
// deploy set — the MINERS panel shows the PREVIOUS round).
import { FEED_LIMIT, SETTLING_MS } from "@/lib/mock/engine";
import type {
  Address,
  DeployEventWire,
  EngineSnapshot,
  RoundSummaryWire,
  RoundWire,
  Store,
  TileWire,
  UserGameState,
} from "@/lib/types";
import {
  type BackendDeploy,
  type BackendRound,
  type CurrentRoundResponse,
  type DeployedEventPayload,
  type PriceResponse,
  type RoundDeploysResponse,
  type RoundsResponse,
  type RoundTransitionPayload,
  toDeployEventWire,
  toNewRoundWire,
  toPeaUsd,
  toRoundSummaryWire,
  toRoundWire,
  toTiles,
  withSettlement,
} from "./translate";

const HISTORY_LIMIT = 120;
const HISTORY_PAGE_SIZE = 60;
const PRICE_POLL_MS = 30_000;
const PHASE_TICK_MS = 500;
/** Stale-round recovery cadence (round/current is poll-safe/cached). */
const RECOVERY_POLL_MS = 10_000;
/** The stream heartbeats every 30s — 90s of silence means it is dead even
 * when readyState claims otherwise (observed live 2026-07-17: a tab stopped
 * receiving events for a full round with no error fired). */
const STREAM_STALE_MS = 90_000;

const EMPTY_USER: UserGameState = {
  deployedRound: null,
  deployedTiles: [],
  autoRemaining: 0,
};

interface EventSourceLike {
  addEventListener(type: string, cb: (e: MessageEvent) => void): void;
  close(): void;
}

export interface ApiGameStoreDeps {
  fetchFn?: typeof fetch;
  createEventSource?: (url: string) => EventSourceLike;
  now?: () => number;
}

export class ApiGameStore implements Store<EngineSnapshot> {
  private listeners = new Set<() => void>();
  private snapshot: EngineSnapshot = SERVER_SNAPSHOT;
  private es: EventSourceLike | null = null;
  /** Bumped on every lifecycle boundary; async work from stale epochs bails. */
  private epoch = 0;
  /** Bumped per bootstrap issue; only the latest-issued fetch may apply. */
  private bootstrapSeq = 0;
  /** An own-deploy SSE lock since the latest bootstrap was ISSUED must not
   *  be clobbered by that (older) fetch body. */
  private sseTouchedUser = false;

  /** Connected wallet (lowercase) — `?user=` + own-deploy matching. */
  private address: Address | null = null;

  /** `txHash:miner` → assigned feed id: dedupe BEFORE id assignment.
   *  Keyed by tx AND miner — AutoMiner's executeBatch lands MULTIPLE
   *  miners' deploys in ONE transaction (live 2026-07-17: a txHash-only
   *  key silently ate every batch member after the first, in the SSE,
   *  hydration, and backfill paths alike). The contract allows one deploy
   *  per miner per round, so the composite key still kills re-deliveries. */
  private txToId = new Map<string, number>();

  private deployKey(txHash: string, miner: string | null | undefined): string {
    return `${txHash}:${(miner ?? "").toLowerCase()}`;
  }
  private nextFeedId = 1;

  /** newRound held back while the winner reveal plays. */
  private pendingRound: RoundWire | null = null;
  /** Latest grid from a `deployed` event for a not-yet-applied round. */
  private pendingGrid: {
    roundId: number;
    tiles: TileWire[];
    totalDeployedWei: string;
  } | null = null;

  private rollTimer: ReturnType<typeof setTimeout> | null = null;
  private phaseTimer: ReturnType<typeof setInterval> | null = null;
  private priceTimer: ReturnType<typeof setInterval> | null = null;
  /** Last stale-round recovery attempt (throttles the recovery poll). */
  private lastRecoveryAt = 0;
  /** Last time ANYTHING (incl. heartbeats) arrived on the stream. */
  private lastEventAt = 0;

  private fetchFn: typeof fetch;
  private createEventSource: (url: string) => EventSourceLike;
  private now: () => number;
  /** Measured server-minus-client offset in ms; 0 until a response lands. */
  private clockOffset = 0;

  /** Bounded log of received SSE events — live-debugging aid (see window
   *  handle below); ring-buffered so it can never grow unbounded. */
  readonly eventLog: { type: string; at: number; note?: string }[] = [];

  constructor(
    private baseUrl: string,
    deps: ApiGameStoreDeps = {},
  ) {
    this.fetchFn = deps.fetchFn ?? fetch.bind(globalThis);
    this.createEventSource =
      deps.createEventSource ??
      ((url) => new EventSource(url) as EventSourceLike);
    // Server-corrected clock: injected now() wins (tests), otherwise the
    // device clock adjusted by the measured offset.
    this.now = deps.now ?? (() => Date.now() + this.clockOffset);
  }

  private logEvent(type: string, note?: string) {
    this.eventLog.push({ type, at: this.now(), ...(note ? { note } : {}) });
    if (this.eventLog.length > 80) this.eventLog.shift();
  }

  subscribe = (cb: () => void): (() => void) => {
    const wasEmpty = this.listeners.size === 0;
    this.listeners.add(cb);
    if (wasEmpty) {
      // Read-only debugging handle for the LIVE instance (StrictMode's
      // double-invoked useState initializer constructs a discarded twin, so
      // the constructor is the wrong place). Harmless in prod.
      if (typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).__apiGameStore = this;
      }
      const gen = ++this.epoch;
      // The EventSource opens SYNCHRONOUSLY so cleanup always has something
      // to close; the bootstrap fetch runs behind the epoch guard.
      this.openEventSource(gen);
      void this.bootstrap(gen);
      this.startTimers(gen);
    }
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) {
        this.epoch++; // invalidates any in-flight async work
        this.es?.close();
        this.es = null;
        if (this.rollTimer) clearTimeout(this.rollTimer);
        if (this.phaseTimer) clearInterval(this.phaseTimer);
        if (this.priceTimer) clearInterval(this.priceTimer);
        this.rollTimer = this.phaseTimer = this.priceTimer = null;
        this.pendingRound = null;
        this.pendingGrid = null;
      }
    };
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;
  getServerSnapshot = (): EngineSnapshot => SERVER_SNAPSHOT;

  /**
   * Wallet identity bridge (called by UserDataProvider). Changing identity
   * resets the lock slice and re-bootstraps so `?user=` data reflects the
   * new address.
   */
  setAddress = (address: Address | null): void => {
    const norm = (address ? address.toLowerCase() : null) as Address | null;
    if (norm === this.address) return;
    this.address = norm;
    if (this.snapshot !== SERVER_SNAPSHOT) this.patch({ user: EMPTY_USER });
    if (this.listeners.size > 0) void this.bootstrap(this.epoch);
  };

  private emit() {
    for (const cb of this.listeners) cb();
  }

  /** bootstrapped only flips true via `bootstraps: true` patches. */
  private patch(partial: Partial<EngineSnapshot>, bootstraps = false) {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      bootstrapped: this.snapshot.bootstrapped || bootstraps,
      // A completed bootstrap is fresh data by definition; otherwise an
      // explicit value in the patch wins, and failing that we carry the
      // current one forward. (This key sits after the spread, so it must
      // read `partial` or it would silently clobber the caller.)
      stale: bootstraps ? false : (partial.stale ?? this.snapshot.stale),
    };
    this.emit();
  }

  /** Server-corrected wall clock. Consumers MUST use this rather than
   * Date.now() for anything compared against endsAt. */
  serverNow(): number {
    return this.now();
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    this.captureSkew(res);
    return (await res.json()) as T;
  }

  /**
   * Round phase and the countdown both compare endsAt (server truth) to a
   * clock. Using the device clock means a user whose machine is a minute
   * fast watches the board lock while the round is still live, and one
   * that is slow can start a deploy that cannot land. Every response
   * carries a Date header, so the offset is free to measure.
   */
  private captureSkew(res: { headers?: { get(name: string): string | null } }) {
    try {
      const header = res.headers?.get("date");
      if (!header) return;
      const serverMs = Date.parse(header);
      if (!Number.isFinite(serverMs)) return;
      // Date has one-second resolution and the response spent time in
      // flight, so only correct for skew big enough to matter.
      const offset = serverMs - Date.now();
      this.clockOffset = Math.abs(offset) > 2_000 ? offset : 0;
    } catch {
      // A fetch fake without headers, or an unparseable value: keep 0.
    }
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  private async bootstrap(gen: number) {
    const seq = ++this.bootstrapSeq;
    this.sseTouchedUser = false;
    const stale = () => gen !== this.epoch || seq !== this.bootstrapSeq;

    // Independent legs: each applies on arrival; none can fail the others.
    void this.fetchJson<RoundsResponse>(
      `/api/rounds?settled=true&page=1&limit=${HISTORY_PAGE_SIZE}`,
    )
      .then((body) => {
        if (!stale()) this.applyHistory(body.rounds.map(toRoundSummaryWire));
      })
      .catch(() => {});
    void this.fetchJson<PriceResponse>(`/api/price`)
      .then((body) => {
        if (!stale()) this.applyPeaUsd(toPeaUsd(body));
      })
      .catch(() => {});

    try {
      const userQ = this.address ? `?user=${this.address}` : "";
      const body = await this.fetchJson<CurrentRoundResponse>(
        `/api/round/current${userQ}`,
      );
      if (stale()) return;
      const round = toRoundWire(body, this.now());
      this.applyBootstrapRound(round, body);
      // Feed hydration: current + previous round — the MINERS panel shows
      // the PREVIOUS round's deploys, so it must be populated on load.
      await this.hydrateDeploys([round.roundId, round.roundId - 1], stale);
    } catch (err) {
      report("store", err);
      // Stay pre-bootstrap; a roundTransition can still bootstrap, and each
      // SSE 'open' retries this fetch.
    }
  }

  /** Backfill feed items for the given rounds (txHash-deduped, idempotent). */
  private async hydrateDeploys(
    roundIds: number[],
    isStale: () => boolean,
  ): Promise<void> {
    await Promise.all(
      roundIds
        .filter((id) => id > 0)
        .map((id) =>
          this.fetchJson<RoundDeploysResponse>(`/api/round/${id}/deploys`)
            .then((res) => {
              if (!isStale())
                this.applyDeploys(res.deploys, Number(res.roundId));
            })
            .catch(() => {}),
        ),
    );
  }

  /**
   * Stale-round defense. The backend's /api/round/current in-memory cache has
   * been OBSERVED (2026-07-16) serving an old round while the chain moved on
   * — leaving the UI locked in "settling" with deploys/transitions arriving
   * for rounds it never displays. While we look stuck (long settling, or SSE
   * evidence of a newer round), re-poll and adopt anything newer.
   */
  private maybeRecover(gen: number) {
    const now = this.now();
    if (now - this.lastRecoveryAt < RECOVERY_POLL_MS) return;
    this.lastRecoveryAt = now;
    void this.recoverRound(gen);
  }

  /** Winner reveal + held rollover — shared by the SSE transition path and
   *  the recovery path (recovery adopting the next round must NOT eat the
   *  elimination animation; live miss 2026-07-17). */
  private startRevealHold(revealed: RoundWire, next: RoundWire, gen: number) {
    this.patch({ round: revealed });
    this.pendingRound = next;
    if (this.rollTimer) clearTimeout(this.rollTimer);
    this.rollTimer = setTimeout(() => {
      if (gen !== this.epoch) return;
      this.rollTimer = null;
      const pending = this.pendingRound;
      this.pendingRound = null;
      if (pending) this.applyNewRound(pending);
    }, SETTLING_MS);
  }

  private async recoverRound(gen: number) {
    try {
      const userQ = this.address ? `?user=${this.address}` : "";
      const body = await this.fetchJson<CurrentRoundResponse>(
        `/api/round/current${userQ}`,
      );
      if (gen !== this.epoch) return;
      const round = toRoundWire(body, this.now());
      const cur = this.snapshot.round;
      if (round.roundId > cur.roundId && !this.pendingRound) {
        // The chain moved past our round without a transition reaching us.
        // If OUR round had deploys and settled, recover the winner reveal
        // from the round detail before rolling — otherwise adopt directly.
        if (
          this.snapshot.bootstrapped &&
          cur.phase === "settling" &&
          cur.winningTile === null &&
          cur.totalDeployedWei !== "0"
        ) {
          try {
            const detail = await this.fetchJson<BackendRound>(
              `/api/round/${cur.roundId}`,
            );
            if (gen !== this.epoch) return;
            if (detail.settled) {
              const summary = toRoundSummaryWire(detail);
              this.applyHistory([summary]);
              this.startRevealHold(
                {
                  ...cur,
                  phase: "settling",
                  winningTile: summary.winningTile,
                  winner: summary.winner,
                  isSplit: summary.isSplit,
                  endsAt: this.now(), // reveal anchor
                },
                round,
                gen,
              );
              void this.hydrateDeploys(
                [round.roundId, cur.roundId],
                () => gen !== this.epoch,
              );
              return;
            }
          } catch (err) {
            report("store", err);
            // Detail unavailable — fall through to plain adoption.
          }
          if (gen !== this.epoch) return;
        }
        this.applyBootstrapRound(round, body);
        void this.fetchSummary(round.roundId - 1, gen);
        void this.hydrateDeploys(
          [round.roundId, round.roundId - 1],
          () => gen !== this.epoch,
        );
      } else if (round.roundId === cur.roundId) {
        if (cur.winningTile === null && round.winningTile !== null) {
          // Same round, winner now attached — run the reveal (endsAt anchor).
          this.patch({
            round: { ...round, phase: "settling", endsAt: this.now() },
          });
        } else if (round.totalDeployedWei !== cur.totalDeployedWei) {
          // Missed `deployed` events — adopt the fresh grid (keep our
          // phase/endsAt: the reveal anchor must not move).
          this.patch({
            round: {
              ...cur,
              tiles: round.tiles,
              totalDeployedWei: round.totalDeployedWei,
            },
          });
        }
      }
    } catch (err) {
      report("store", err);
      // Next poll retries.
    }
  }

  private applyBootstrapRound(round: RoundWire, body: CurrentRoundResponse) {
    const cur = this.snapshot.round;
    // Strictly-greater: on a roundId tie the LIVE copy wins — an SSE update
    // for the current round is at least as new as the fetch body.
    const adopt = round.roundId > cur.roundId;
    // But this path runs on RECONNECT, where the fetch is the fresher
    // read and the live copy may have missed deploys while the stream was
    // down. On a tie, take whichever total is larger per tile: deploys
    // only ever accumulate within a round, so the maximum is the truth.
    const merged =
      !adopt && round.roundId === cur.roundId
        ? {
            ...cur,
            tiles: cur.tiles.map((t, i) => {
              const inc = round.tiles[i];
              if (!inc) return t;
              return BigInt(inc.deployedWei) > BigInt(t.deployedWei) ? inc : t;
            }),
            totalDeployedWei:
              BigInt(round.totalDeployedWei) > BigInt(cur.totalDeployedWei)
                ? round.totalDeployedWei
                : cur.totalDeployedWei,
          }
        : cur;

    let user = this.snapshot.user;
    if (!this.sseTouchedUser) {
      const deployed =
        this.address !== null &&
        body.userDeployed !== undefined &&
        body.userDeployed !== "0";
      user = deployed
        ? {
            deployedRound: round.roundId,
            // Tiles arrive with the deploys hydration (applyDeploys), but
            // only carry them forward if they belong to THIS round —
            // applyDeploys refuses to overwrite a non-empty set, so a
            // stale set would light tiles the user does not hold.
            deployedTiles:
              user.deployedRound === round.roundId ? user.deployedTiles : [],
            autoRemaining: 0,
          }
        : EMPTY_USER;
    }

    this.patch({ round: adopt ? round : merged, user, error: false }, true);
  }

  private applyDeploys(deploys: BackendDeploy[], roundId: number) {
    const fresh = deploys.filter(
      (d) => !this.txToId.has(this.deployKey(d.txHash, d.user)),
    );
    const items = fresh.map((d) => {
      const id = this.nextFeedId++;
      this.txToId.set(this.deployKey(d.txHash, d.user), id);
      return toDeployEventWire(d, roundId, id);
    });

    const partial: Partial<EngineSnapshot> = {};
    if (items.length > 0) {
      const feed = [...this.snapshot.feed, ...items].slice(-FEED_LIMIT);
      this.pruneTxMap(feed);
      partial.feed = feed;
    }

    // Fill the lock's tile set from the user's own deploy in this round.
    const user = this.snapshot.user;
    if (
      this.address &&
      user.deployedRound === roundId &&
      user.deployedTiles.length === 0
    ) {
      const mine = deploys.filter(
        (d) => d.user?.toLowerCase() === this.address,
      );
      if (mine.length > 0) {
        const tiles = [...new Set(mine.flatMap((d) => d.blocks))];
        partial.user = { ...user, deployedTiles: tiles };
      }
    }

    if (Object.keys(partial).length > 0) this.patch(partial);
  }

  /** Union by roundId, newest first. The live copy wins a tie, EXCEPT
   * that a settled row always beats an unsettled one: otherwise a row
   * that arrived before settlement could never be corrected. */
  private applyHistory(incoming: RoundSummaryWire[]) {
    const byId = new Map<number, RoundSummaryWire>();
    for (const h of [...incoming, ...this.snapshot.history]) {
      const seen = byId.get(h.roundId);
      if (!seen || (seen.winningTile === null && h.winningTile !== null)) {
        byId.set(h.roundId, h);
      }
    }
    const history = [...byId.values()]
      .sort((a, b) => b.roundId - a.roundId)
      .slice(0, HISTORY_LIMIT);
    this.patch({ history });
  }

  private applyPeaUsd(peaUsd: number) {
    if (peaUsd === this.snapshot.prices.peaUsd) return;
    // ethUsd stays 0 here — usePrices overlays the live Coinbase spot feed.
    this.patch({ prices: { peaUsd, ethUsd: this.snapshot.prices.ethUsd } });
  }

  /** Prune txHash entries that fell out of the bounded feed window. */
  private pruneTxMap(feed: DeployEventWire[]) {
    const minId = feed.length > 0 ? feed[0].id : this.nextFeedId;
    for (const [hash, id] of this.txToId) {
      if (id < minId) this.txToId.delete(hash);
    }
  }

  // ─── Timers ────────────────────────────────────────────────────────────────

  private startTimers(gen: number) {
    // Phase synthesis: settlement is VRF-driven and the backend sends no
    // event at endTime — flip active→settling locally so the grid locks and
    // the CTA reads "Settling..." while the chain draws a winner.
    this.phaseTimer = setInterval(() => {
      if (gen !== this.epoch) return;
      // Silent-stream watchdog: heartbeats arrive every 30s, so a quiet
      // stream is a dead one — recycle it (its 'open' re-runs the bootstrap).
      const quiet = this.now() - this.lastEventAt > STREAM_STALE_MS;
      // Surface staleness as well as recovering from it: the recycle below
      // may not succeed, and until it does the UI must stop presenting
      // this data as live. Only ever SET it here — the recycle resets
      // lastEventAt, so clearing it here too would flicker the flag off
      // on the very next tick without any real data having arrived. It
      // lifts when a genuine event lands, or on a fresh bootstrap.
      if (this.snapshot.bootstrapped && quiet && !this.snapshot.stale) {
        this.patch({ stale: true });
      }
      if (this.es && quiet) {
        this.lastEventAt = this.now();
        this.es.close();
        this.openEventSource(gen);
      }
      if (!this.snapshot.bootstrapped) return;
      const r = this.snapshot.round;
      if (r.phase === "active" && r.endsAt > 0 && this.now() >= r.endsAt) {
        this.patch({ round: { ...r, phase: "settling" } });
      } else if (r.phase === "settling" && !this.pendingRound) {
        // Long settles are normal (VRF lag), but the backend's current-round
        // cache also goes stale — keep polling for recovery while stuck.
        this.maybeRecover(gen);
      }
    }, PHASE_TICK_MS);

    this.priceTimer = setInterval(() => {
      if (gen !== this.epoch) return;
      void this.fetchJson<PriceResponse>(`/api/price`)
        .then((body) => {
          if (gen === this.epoch) this.applyPeaUsd(toPeaUsd(body));
        })
        .catch(() => {});
    }, PRICE_POLL_MS);
  }

  // ─── SSE ───────────────────────────────────────────────────────────────────

  private openEventSource(gen: number) {
    const es = this.createEventSource(`${this.baseUrl}/api/events/rounds`);
    this.es = es;
    this.lastEventAt = this.now();
    const on = <T>(type: string, apply: (payload: T) => void) =>
      es.addEventListener(type, (e) => {
        if (gen !== this.epoch) return;
        this.lastEventAt = this.now();
        if (this.snapshot.stale) this.patch({ stale: false });
        this.logEvent(type);
        try {
          apply(JSON.parse(e.data) as T);
        } catch (err) {
          // Parse OR handler failure — record the reason (the flat
          // "malformed" label hid a handler TypeError for a full day).
          this.logEvent(
            type,
            err instanceof Error ? err.message : "parse failed",
          );
        }
      });

    // Auto-reconnect resync: every open (incl. the first) re-runs the
    // bootstrap — deploys/rounds refetches recover anything missed while
    // disconnected (SSE events are not replayed by the server).
    es.addEventListener("open", () => {
      if (gen !== this.epoch) return;
      this.lastEventAt = this.now();
      this.logEvent("open");
      void this.bootstrap(gen);
    });
    es.addEventListener("error", () => {
      if (gen !== this.epoch) return;
      this.logEvent("error");
      if (!this.snapshot.bootstrapped) this.patch({ error: true });
    });

    on<DeployedEventPayload>("deployed", (p) => this.handleDeployed(p, gen));
    on<RoundTransitionPayload>("roundTransition", (p) =>
      this.handleTransition(p, gen),
    );
    // Liveness only — feeds the silent-stream watchdog via the `on` wrapper.
    on<unknown>("heartbeat", () => {});
  }

  private handleDeployed(p: DeployedEventPayload, gen: number) {
    const rid = Number(p.roundId);
    const cur = this.snapshot.round;
    const partial: Partial<EngineSnapshot> = {};

    if (this.snapshot.bootstrapped && rid === cur.roundId) {
      // Full-grid snapshot in the payload — replace wholesale, no math.
      partial.round = {
        ...cur,
        tiles: toTiles(p.blocks),
        totalDeployedWei: p.totalDeployed,
      };
    } else if (rid > cur.roundId) {
      // Grid for a round we haven't rolled to yet — buffer the latest;
      // applied at rollover.
      this.pendingGrid = {
        roundId: rid,
        tiles: toTiles(p.blocks),
        totalDeployedWei: p.totalDeployed,
      };
      // Outside a reveal hold this is evidence our round is STALE (missed
      // transition / stale backend cache) — recover.
      if (!this.pendingRound) this.maybeRecover(gen);
    }

    // Feed item (deploy is null during webhook outages — grid still applies,
    // the missed items come back via the next bootstrap's deploys refetch).
    // Isolated try: a malformed feed item must NEVER cost us the grid patch
    // (live root cause 2026-07-17 — deploy{} had no `user`, the throw here
    // aborted the handler and the already-built grid update was discarded).
    const dedupeKey = p.deploy
      ? this.deployKey(p.deploy.txHash, p.deploy.user ?? p.user)
      : null;
    if (p.deploy && dedupeKey !== null && !this.txToId.has(dedupeKey)) {
      try {
        const item = toDeployEventWire(p.deploy, rid, this.nextFeedId, p.user);
        this.txToId.set(dedupeKey, this.nextFeedId++);
        const feed = [...this.snapshot.feed, item].slice(-FEED_LIMIT);
        this.pruneTxMap(feed);
        partial.feed = feed;
      } catch (err) {
        this.logEvent(
          "deployed",
          `feed-item failed: ${err instanceof Error ? err.message : "?"}`,
        );
      }
    }

    // Own deploy (manual or AutoMiner deployFor) → lock the grid. rid can be
    // ahead of the visible round during the reveal hold; the lock only bites
    // once that round is applied (MinePage compares round ids).
    if (
      this.address &&
      p.user &&
      p.user.toLowerCase() === this.address &&
      rid >= cur.roundId
    ) {
      this.sseTouchedUser = true;
      partial.user = {
        deployedRound: rid,
        deployedTiles: p.deploy?.blocks ?? this.snapshot.user.deployedTiles,
        autoRemaining: 0,
      };
    }

    if (Object.keys(partial).length > 0) this.patch(partial);
  }

  private handleTransition(p: RoundTransitionPayload, gen: number) {
    const newRound = toNewRoundWire(p.newRound);
    const cur = this.snapshot.round;
    // Monotonic guard — a re-delivered/older transition never regresses UI.
    if (newRound.roundId <= cur.roundId) return;

    // Truly-empty rounds arrive as settled: null (old payload) OR a zeros
    // object with winnerCount: null (enriched payload 2026-07-17) — nothing
    // to reveal or record either way. winnerCount 0 with real deploys (all
    // miners lost) still reveals the winning tile.
    const settled =
      p.settled && p.settled.winnerCount !== null ? p.settled : null;

    if (settled) {
      const settledRid = Number(settled.roundId);
      // Authoritative summary (winnerCount/vaulted/peaWinner are not in the
      // transition payload) — fetched async, lands in history when ready.
      void this.fetchSummary(settledRid, gen);
      // Backfill the settled round's deploys: the MINERS panel shows it as
      // the PREVIOUS round after rollover, and live `deployed` events for it
      // may have been missed (stale bootstrap / webhook outage).
      void this.hydrateDeploys([settledRid], () => gen !== this.epoch);

      if (this.snapshot.bootstrapped && settledRid === cur.roundId) {
        if (cur.winningTile === null) {
          // Winner reveal on the visible round, then hold the rollover so
          // the MineGrid elimination animation plays (mock-equal window).
          this.startRevealHold(
            withSettlement(cur, settled, this.now()),
            newRound,
            gen,
          );
        } else if (
          !this.pendingRound ||
          newRound.roundId > this.pendingRound.roundId
        ) {
          // A reveal is already running (the recovery poll won the race) —
          // don't restart the animation; just advance the rollover target.
          this.pendingRound = newRound;
        }
        return;
      }
    }

    // Empty round (settled: null) or a settlement for a round we aren't
    // displaying — no reveal, roll immediately.
    this.applyNewRound(newRound);
  }

  private applyNewRound(round: RoundWire) {
    if (round.roundId <= this.snapshot.round.roundId) return;
    let next = round;
    if (this.pendingGrid) {
      if (this.pendingGrid.roundId === round.roundId) {
        next = {
          ...round,
          tiles: this.pendingGrid.tiles,
          totalDeployedWei: this.pendingGrid.totalDeployedWei,
        };
        this.pendingGrid = null;
      } else if (this.pendingGrid.roundId < round.roundId) {
        this.pendingGrid = null; // stale
      }
      // else: grid for a round still AHEAD of this one — keep it buffered.
    }
    // Keep the lock only if it was latched for THIS round (an own deploy —
    // e.g. AutoMiner — raced ahead during the reveal hold).
    const u = this.snapshot.user;
    const user = u.deployedRound === next.roundId ? u : EMPTY_USER;
    this.patch({ round: next, user, error: false }, true);
  }

  private async fetchSummary(roundId: number, gen: number) {
    try {
      const body = await this.fetchJson<BackendRound>(`/api/round/${roundId}`);
      if (gen !== this.epoch) return;
      // Only settled rounds belong in history. An unsettled row written
      // here could never be corrected: applyHistory lets the existing
      // copy win a tie, so the round would show no winner permanently.
      // (recoverRound already guards this way.)
      if (!body.settled) return;
      this.applyHistory([toRoundSummaryWire(body)]);
    } catch (err) {
      report("store", err);
      // The next bootstrap's /api/rounds merge recovers it.
    }
  }
}
