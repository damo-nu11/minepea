/**
 * Mock game engine (the project docs Data Layer) — the only data source until
 * Phase 9 swaps in the real API/SSE client behind the same Store<T> seam.
 *
 * Hard properties (audit-mandated):
 * - EVENT-SOURCED: the deploy event is the sole primitive; tiles, totals,
 *   winners, vaulted/winnings, and history rows are pure derivations via
 *   one settleRound(). Pre-seeded history is produced by fast-forwarding
 *   the same simulation — never hand-rolled fixtures.
 * - Injectable { seed, now() } — deterministic and testable with fake timers.
 * - NO module-scope side effects. Ticking lazy-starts on first subscribe()
 *   and stops on last unsubscribe. Constructing builds data only.
 * - getServerSnapshot() returns a fixed deterministic empty world
 *   (bootstrapped: false) so SSR and the hydration render match.
 * - Absolute time is the single clock: rounds settle when now() >= endsAt —
 *   the same field the UI countdown derives from (Convention 3).
 * - Snapshot sub-objects keep referential identity unless their domain
 *   changed, so hooks can select slices without a with-selector shim.
 * - Settlement invariant: deployedWei = vaultedWei + winningsWei,
 *   vaulted = 10% of deployed (flat protocol fee), or 100% of deployed when
 *   the drawn tile had no coverers.
 */

import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import { createRng, type Rng } from "@/lib/mock/rng";
import type {
  Address,
  DeployEventWire,
  DeployParams,
  EngineSnapshot,
  GameActions,
  PricesWire,
  ProtocolStatsWire,
  RoundSummaryWire,
  RoundWire,
  Store,
  TileId,
  TileWire,
  UserGameState,
} from "@/lib/types";

// Re-exported for existing consumers/tests; canonical homes are lib/types.ts
// and lib/gameSnapshot.ts (shared with the Phase 9 API client).
export { SERVER_SNAPSHOT };
export type { DeployParams, EngineSnapshot, UserGameState };

// ─── Tunables ────────────────────────────────────────────────────────────────

/** 60s active rounds (ui-spec); settling adds SETTLING_MS for the reveal.
 *
 * Local testing can shorten the round via NEXT_PUBLIC_ROUND_MS so the
 * settle reveal can be watched on a loop instead of once a minute. It is
 * deliberately an ENV override rather than an edited constant: .env* is
 * gitignored, so a short round cannot be committed or shipped by
 * accident (the 20s value used during the wheel tuning had to be
 * remembered and restored by hand). Out-of-range values fall back. */
const ROUND_MS_ENV = Number(process.env.NEXT_PUBLIC_ROUND_MS);
export const ROUND_DURATION_MS =
  Number.isFinite(ROUND_MS_ENV) &&
  ROUND_MS_ENV >= 5_000 &&
  ROUND_MS_ENV <= 600_000
    ? ROUND_MS_ENV
    : 60_000;
/** Sized for the round-end reveal: ~5.2s tile elimination + ~3s winner hold. */
export const SETTLING_MS = 8_200;
const TICK_MS = 300;
const SEED_ROUNDS = 60;
/** Must hold the PREVIOUS round's full deploy set (~250) while the current
 * round streams ~250 more — the MINERS panel shows last round's miners. */
export const FEED_LIMIT = 600;
const HISTORY_LIMIT = 120;
const DEPLOYS_PER_ROUND_MIN = 230;
const DEPLOYS_PER_ROUND_MAX = 270;
const MINER_POOL_SIZE = 400;
const MOTHERLODE_HIT_CHANCE = 1 / 40;
const USER_DEPLOY_LATENCY_MS = 500;

const WEI_PER_GWEI = 1_000_000_000n;

export interface EngineDeps {
  seed: number;
  now(): number;
}

// ─── Small helpers ───────────────────────────────────────────────────────────

/** ETH (display-scale number) → wei string, exact to 1 gwei. */
export function ethToWei(eth: number): string {
  return (BigInt(Math.round(eth * 1e9)) * WEI_PER_GWEI).toString();
}

function sum(values: bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}

/** Build a random miner pool: hex addresses, a few with display names. */
function buildMiners(rng: Rng): { address: Address; name?: string }[] {
  const NAMES = ["Atlas", "Juno", "Wren", "Otis", "Cleo", "Mabel"];
  const hex = "0123456789abcdef";
  const miners: { address: Address; name?: string }[] = [];
  for (let i = 0; i < MINER_POOL_SIZE; i++) {
    let a = "0x";
    for (let c = 0; c < 40; c++) a += hex[rng.int(16)];
    miners.push({
      address: a as Address,
      name: i < NAMES.length ? NAMES[i] : undefined,
    });
  }
  return miners;
}

// ─── Pure derivations (exported for tests) ───────────────────────────────────

/** Derive the dense 25-tile state from a round's deploy events. */
export function deriveTiles(events: DeployEventWire[]): TileWire[] {
  const deployed = Array.from({ length: 25 }, () => 0n);
  const miners = Array.from({ length: 25 }, () => 0);
  for (const e of events) {
    const per = BigInt(e.amountWei) / BigInt(e.tiles.length);
    for (const t of e.tiles) {
      deployed[t] += per;
      miners[t] += 1;
    }
  }
  return deployed.map((wei, id) => ({
    id,
    deployedWei: wei.toString(),
    minerCount: miners[id],
  }));
}

/**
 * Settle a round from its event log. Winner = a uniformly random tile (1-in-25,
 * NOT deploy-weighted); winners = miners who covered that tile; vaulted = 10%
 * of deployed, or all of it when nobody covered the drawn tile, and
 * deployed = vaulted + winnings EXACTLY (invariant).
 */
export function settleRound(
  roundId: number,
  events: DeployEventWire[],
  rng: Rng,
  settledAt: number,
  motherlodePea: string | null,
): RoundSummaryWire {
  const tiles = deriveTiles(events);
  const totals = tiles.map((t) => BigInt(t.deployedWei));
  const deployedWei = sum(totals);

  // The winning tile is drawn UNIFORMLY at random, 1-in-25, by the protocol's
  // VRF (user 2026-07-21). ETH on a tile does NOT change its chance of being
  // drawn, and a tile nobody covered can win, in which case the round has no
  // coverers. This engine was deploy-weighted until that correction; the copy
  // it contradicted (docs, Explore, /terms, /privacy) was fixed in the same
  // pass, per the copy-and-engine-must-agree rule.
  const winningTile: TileId = rng.int(25);

  const coverers = new Map<Address, string | undefined>();
  for (const e of events) {
    if (e.tiles.includes(winningTile)) coverers.set(e.miner, e.minerName);
  }
  const winnerCount = coverers.size;

  // The 1 PEA to the winning tile is a 50/50 coin flip: split pro-rata across
  // everyone on the tile, or awarded to a single miner (user 2026-07-14, the
  // economics correction). Was 0.12 from the original build until the
  // 2026-07-17 claim audit found the engine contradicting every piece of copy
  // (docs, Explore mechanics, /terms) that states 50/50.
  const isSplit = winnerCount > 1 && rng.chance(0.5);
  let winner: Address | null = null;
  let winnerName: string | undefined;
  if (!isSplit && winnerCount > 0) {
    const entry = rng.pick([...coverers.entries()]);
    winner = entry[0];
    winnerName = entry[1];
  }

  // Invariant: deployed = vaulted + winnings; the protocol fee is a flat 10%
  // of deployed ETH (user 2026-07-14), 100% of which funds buybacks.
  //
  // The uniform 1-in-25 draw can land on a tile nobody covered, leaving the
  // round with no winners. There is then no one to pay the 90% to, so the
  // WHOLE round vaults and funds buybacks (user 2026-07-21). Rare while the
  // board is well covered, routine when it is not, so it must be modelled
  // rather than left to divide by a winner set of zero.
  const noWinners = winnerCount === 0;
  const vaultedWei = noWinners ? deployedWei : deployedWei / 10n;
  const winningsWei = deployedWei - vaultedWei;

  return {
    roundId,
    winningTile,
    winner,
    winnerName,
    isSplit,
    winnerCount,
    deployedWei: deployedWei.toString(),
    vaultedWei: vaultedWei.toString(),
    winningsWei: winningsWei.toString(),
    motherlodePea,
    settledAt,
  };
}

// ─── The engine ──────────────────────────────────────────────────────────────

export class MockEngine implements Store<EngineSnapshot>, GameActions {
  private rng: Rng;
  private now: () => number;

  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private miners: { address: Address; name?: string }[];
  private nextEventId = 1;
  private roundId: number;
  private roundStartedAt: number;
  private roundEndsAt: number;
  private phase: RoundWire["phase"] = "active";
  private settlingUntil = 0;
  private roundEvents: DeployEventWire[] = [];
  private plannedDeploys = 0;
  private feed: DeployEventWire[] = [];
  private history: RoundSummaryWire[] = [];
  private lastSettled: RoundSummaryWire | null = null;
  private motherlodePotPea: number;
  private prices: PricesWire;
  private priceTickAccum = 0;
  private circulatingPea: number;
  private user: UserGameState = {
    deployedRound: null,
    deployedTiles: [],
    autoRemaining: 0,
  };
  private userAutoParams: DeployParams | null = null;

  // Snapshot slice caching — identity changes only when the domain changed.
  private snapshot: EngineSnapshot | null = null;
  private roundDirty = true;
  private cachedRound: RoundWire | null = null;
  private statsDirty = true;
  private cachedStats: ProtocolStatsWire | null = null;

  constructor(deps: EngineDeps) {
    this.rng = createRng(deps.seed);
    this.now = deps.now;
    this.miners = buildMiners(this.rng);
    // Sized to the Explore peapot chart's post-1-in-333 range so the live
    // PEAPOT stat/table
    // agree with the Explore peapot chart (audit). Same rng draw count as
    // before, so which rounds hit is unchanged.
    this.motherlodePotPea = this.rng.range(0, 30);
    this.prices = { peaUsd: 12.4, ethUsd: 3845 };
    this.circulatingPea = 468_000;

    // Fast-forward SEED_ROUNDS settled rounds ending just before "now",
    // through the exact same generate → settle path as live rounds.
    const t = this.now();
    this.roundId = 320_000;
    for (let i = 0; i < SEED_ROUNDS; i++) {
      const startedAt =
        t - (SEED_ROUNDS - i) * (ROUND_DURATION_MS + SETTLING_MS);
      const events = this.generateRoundEvents(this.roundId, startedAt);
      this.pushToFeed(events);
      this.history.unshift(
        this.settleAndAdvance(events, startedAt + ROUND_DURATION_MS),
      );
      this.roundId += 1;
    }
    this.history = this.history.slice(0, HISTORY_LIMIT);
    this.lastSettled = this.history[0] ?? null;

    // Open the live round.
    this.roundStartedAt = t;
    this.roundEndsAt = t + ROUND_DURATION_MS;
    this.planRound();
  }

  // ── Store<EngineSnapshot> ──

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getSnapshot = (): EngineSnapshot => {
    if (!this.snapshot) {
      this.snapshot = {
        bootstrapped: true,
        round: this.buildRound(),
        feed: this.feed,
        history: this.history,
        prices: this.prices,
        protocolStats: this.buildProtocolStats(),
        user: this.user,
      };
    }
    return this.snapshot;
  };

  getServerSnapshot = (): EngineSnapshot => SERVER_SNAPSHOT;

  // ── User actions ──

  /**
   * Deploy for the connected user (PLAN Phase 2). Async + rejectable like a
   * real transaction; merges into the same event log as simulated miners;
   * locks the round; auto-redeploys `rounds - 1` more times.
   */
  deploy(params: DeployParams): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.phase !== "active") {
          reject(new Error("Round is not active"));
          return;
        }
        if (this.user.deployedRound === this.roundId) {
          reject(new Error("Already deployed this round"));
          return;
        }
        if (params.tiles.length === 0 || params.rounds < 1) {
          reject(new Error("Nothing to deploy"));
          return;
        }
        this.applyUserDeploy(params);
        this.user = {
          deployedRound: this.roundId,
          deployedTiles: [...params.tiles],
          autoRemaining: params.rounds - 1,
        };
        this.userAutoParams = params.rounds > 1 ? params : null;
        this.invalidate({ round: true });
        resolve();
      }, USER_DEPLOY_LATENCY_MS);
    });
  }

  // ── Internals ──

  private emit() {
    for (const cb of this.listeners) cb();
  }

  private invalidate(domains: { round?: boolean } = {}) {
    if (domains.round) this.roundDirty = true;
    this.snapshot = null;
    this.emit();
  }

  private planRound() {
    this.roundEvents = [];
    this.plannedDeploys =
      DEPLOYS_PER_ROUND_MIN +
      this.rng.int(DEPLOYS_PER_ROUND_MAX - DEPLOYS_PER_ROUND_MIN);
    this.phase = "active";
    this.roundDirty = true;
  }

  /** Random simulated deploy — shared by live ticks and history seeding. */
  private makeDeploy(roundId: number, at: number): DeployEventWire {
    const miner = this.rng.pick(this.miners);
    // Tile strategy mix: ~60% ALL, ~22% small picks, ~18% mid spreads —
    // tuned so winner counts land at reference scale (~130–180).
    const roll = this.rng.next();
    let tiles: TileId[];
    if (roll < 0.6) {
      tiles = Array.from({ length: 25 }, (_, i) => i);
    } else if (roll < 0.82) {
      const n = 1 + this.rng.int(5);
      const set = new Set<TileId>();
      while (set.size < n) set.add(this.rng.int(25));
      tiles = [...set];
    } else {
      const n = 8 + this.rng.int(8);
      const set = new Set<TileId>();
      while (set.size < n) set.add(this.rng.int(25));
      tiles = [...set];
    }
    // Total ETH for this deploy, skewed low (~0.005–0.125, mean ≈ 0.045)
    // so round totals land near the reference's ~10–12 ETH.
    const r = this.rng.next();
    const eth = 0.005 + r * r * 0.12;
    return {
      id: this.nextEventId++,
      roundId,
      miner: miner.address,
      minerName: miner.name,
      tiles,
      amountWei: ethToWei(eth),
      at,
    };
  }

  /** Generate a full round's simulated event log (used for seeding). */
  private generateRoundEvents(
    roundId: number,
    startedAt: number,
  ): DeployEventWire[] {
    const count =
      DEPLOYS_PER_ROUND_MIN +
      this.rng.int(DEPLOYS_PER_ROUND_MAX - DEPLOYS_PER_ROUND_MIN);
    const events: DeployEventWire[] = [];
    for (let i = 0; i < count; i++) {
      const at = startedAt + Math.floor((i / count) * ROUND_DURATION_MS);
      events.push(this.makeDeploy(roundId, at));
    }
    return events;
  }

  private pushToFeed(events: DeployEventWire[]) {
    this.feed = [...this.feed, ...events].slice(-FEED_LIMIT);
  }

  /** Settle helper shared by seeding and live flow; handles the motherlode pot. */
  private settleAndAdvance(
    events: DeployEventWire[],
    settledAt: number,
  ): RoundSummaryWire {
    const hit = this.rng.chance(MOTHERLODE_HIT_CHANCE);
    const motherlode = hit
      ? ethToWei(this.motherlodePotPea) // PEA also uses 18dp raw units
      : null;
    const summary = settleRound(
      this.roundId,
      events,
      this.rng,
      settledAt,
      motherlode,
    );
    if (hit) this.motherlodePotPea = this.rng.range(0, 8);
    else this.motherlodePotPea += 1 + this.rng.range(0, 2);
    this.circulatingPea += 9 + this.rng.range(0, 3);
    this.statsDirty = true; // protocol stats only move at settlement
    return summary;
  }

  private applyUserDeploy(params: DeployParams) {
    const per = BigInt(params.amountPerTileWei);
    const event: DeployEventWire = {
      id: this.nextEventId++,
      roundId: this.roundId,
      miner: params.miner,
      tiles: [...params.tiles],
      amountWei: (per * BigInt(params.tiles.length)).toString(),
      at: this.now(),
    };
    this.roundEvents.push(event);
    this.pushToFeed([event]);
  }

  private tick() {
    const t = this.now();
    let changed = false;

    if (this.phase === "active") {
      if (t < this.roundEndsAt) {
        // Emit simulated deploys paced across the round. Batch into ONE
        // feed splice per tick (pushToFeed copies the whole ~600-item feed;
        // per-event copies are O(n^2) on the catch-up path — audit).
        const elapsed = t - this.roundStartedAt;
        const due = Math.floor(
          (elapsed / ROUND_DURATION_MS) * this.plannedDeploys,
        );
        const batch: DeployEventWire[] = [];
        while (this.roundEvents.length < due) {
          const e = this.makeDeploy(this.roundId, t);
          this.roundEvents.push(e);
          batch.push(e);
          changed = true;
        }
        if (batch.length > 0) this.pushToFeed(batch);
        if (changed) this.roundDirty = true;
      } else {
        // Background tabs throttle setInterval, so a round can reach endsAt
        // with deploys still unemitted (or none at all — which would settle
        // winnerless). Top up to plan first: miners mine while you're away.
        const batch: DeployEventWire[] = [];
        while (this.roundEvents.length < this.plannedDeploys) {
          const e = this.makeDeploy(this.roundId, this.roundEndsAt);
          this.roundEvents.push(e);
          batch.push(e);
        }
        if (batch.length > 0) this.pushToFeed(batch);
        // Settle off the same absolute clock the countdown reads.
        this.lastSettled = this.settleAndAdvance(this.roundEvents, t);
        this.history = [this.lastSettled, ...this.history].slice(
          0,
          HISTORY_LIMIT,
        );
        this.phase = "settling";
        this.settlingUntil = t + SETTLING_MS;
        this.roundDirty = true;
        changed = true;
      }
    } else if (this.phase === "settling" && t >= this.settlingUntil) {
      // Roll the next round.
      this.roundId += 1;
      this.roundStartedAt = t;
      this.roundEndsAt = t + ROUND_DURATION_MS;
      this.planRound();
      // Auto-redeploy for the user, if armed.
      if (this.userAutoParams && this.user.autoRemaining > 0) {
        this.applyUserDeploy(this.userAutoParams);
        this.user = {
          deployedRound: this.roundId,
          deployedTiles: [...this.userAutoParams.tiles],
          autoRemaining: this.user.autoRemaining - 1,
        };
        if (this.user.autoRemaining === 0) this.userAutoParams = null;
      } else {
        this.user = { ...this.user, deployedRound: null, deployedTiles: [] };
      }
      changed = true;
    }

    // Slow price random walk (~every 3.9s).
    this.priceTickAccum += TICK_MS;
    if (this.priceTickAccum >= 3900) {
      this.priceTickAccum = 0;
      this.prices = {
        peaUsd: +(
          this.prices.peaUsd *
          (1 + this.rng.range(-0.004, 0.004))
        ).toFixed(4),
        ethUsd: +(
          this.prices.ethUsd *
          (1 + this.rng.range(-0.002, 0.002))
        ).toFixed(2),
      };
      changed = true;
    }

    if (changed) this.invalidate();
  }

  private buildRound(): RoundWire {
    if (!this.roundDirty && this.cachedRound) return this.cachedRound;
    const settled = this.phase !== "active" ? this.lastSettled : null;
    this.cachedRound = {
      roundId: this.roundId,
      startedAt: this.roundStartedAt,
      endsAt: this.roundEndsAt,
      phase: this.phase,
      tiles: deriveTiles(this.roundEvents),
      totalDeployedWei: sum(
        this.roundEvents.map((e) => BigInt(e.amountWei)),
      ).toString(),
      motherlodePea: ethToWei(this.motherlodePotPea),
      winningTile: settled ? settled.winningTile : null,
      winner: settled ? settled.winner : null,
      winnerName: settled?.winnerName,
      isSplit: settled ? settled.isSplit : false,
    };
    this.roundDirty = false;
    return this.cachedRound;
  }

  /** Cached per the referential-identity contract — stats change only at settlement. */
  private buildProtocolStats(): ProtocolStatsWire {
    if (!this.statsDirty && this.cachedStats) return this.cachedStats;
    const rev7d = this.history.reduce((a, h) => a + BigInt(h.vaultedWei), 0n);
    this.cachedStats = {
      maxSupplyPea: ethToWei(3_000_000),
      circulatingPea: ethToWei(this.circulatingPea),
      buried7dPea: ethToWei(7_400 + (this.circulatingPea % 500)),
      protocolRev7dWei: (rev7d * 14n).toString(), // scale sample window up to ~7d
    };
    this.statsDirty = false;
    return this.cachedStats;
  }
}

export function createEngine(deps: EngineDeps): MockEngine {
  return new MockEngine(deps);
}
