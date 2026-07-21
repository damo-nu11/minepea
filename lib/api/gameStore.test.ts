import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiGameStore } from "@/lib/api/gameStore";
import { SERVER_SNAPSHOT } from "@/lib/gameSnapshot";
import type { Address } from "@/lib/types";
import {
  blocksWith,
  CURRENT_ROUND,
  DEPLOY_A,
  DEPLOY_B,
  deployedEvent,
  deploysResponse,
  PRICE_LIVE,
  PRICE_NULL,
  ROUND_5,
  ROUND_7,
  roundsResponse,
  transitionEvent,
} from "./fixtures";
import type { BackendRound } from "./translate";

/**
 * All tests run on fake timers pinned inside round #10's active window
 * (fixtures capture unix-seconds 1_784_222_283..343). Date.now(), the phase
 * timer, the price poll, and the reveal hold all advance together via
 * vi.advanceTimersByTimeAsync.
 */
const T0 = 1_784_222_300_000;
const flush = () => vi.advanceTimersByTimeAsync(0);

class FakeEventSource {
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  closed = false;
  constructor(public url: string) {}
  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, payload: unknown) {
    for (const cb of this.listeners.get(type) ?? [])
      cb({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

interface Overrides {
  current?: (url: string) => Response | Promise<Response>;
  deploys?: (id: number) => Response | Promise<Response>;
  rounds?: () => Response | Promise<Response>;
  price?: () => Response | Promise<Response>;
  detail?: (id: number) => Response | Promise<Response>;
}

/** Routed fetch fake over the real endpoint shapes. */
function makeStore(overrides: Overrides = {}) {
  const created: FakeEventSource[] = [];
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/api/round/current"))
      return overrides.current ? overrides.current(u) : json(CURRENT_ROUND);
    const deploysMatch = u.match(/\/api\/round\/(\d+)\/deploys$/);
    if (deploysMatch) {
      const id = Number(deploysMatch[1]);
      return overrides.deploys
        ? overrides.deploys(id)
        : json(deploysResponse(id, id === 10 ? [DEPLOY_A] : []));
    }
    if (u.includes("/api/rounds?"))
      return overrides.rounds
        ? overrides.rounds()
        : json(roundsResponse([ROUND_7, ROUND_5]));
    if (u.includes("/api/price"))
      return overrides.price ? overrides.price() : json(PRICE_NULL);
    const detailMatch = u.match(/\/api\/round\/(\d+)$/);
    if (detailMatch)
      return overrides.detail
        ? overrides.detail(Number(detailMatch[1]))
        : json({ ...ROUND_7, roundId: Number(detailMatch[1]) });
    return json({});
  }) as unknown as typeof fetch;

  const store = new ApiGameStore("http://api.test", {
    fetchFn,
    createEventSource: (url) => {
      const es = new FakeEventSource(url);
      created.push(es);
      return es;
    },
  });
  return {
    store,
    created,
    getEs: () => created[created.length - 1],
    fetchFn,
    calls,
    currentCalls: () =>
      calls.filter((u) => u.includes("/api/round/current")).length,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ApiGameStore bootstrap", () => {
  it("serves SERVER_SNAPSHOT until subscribed, then bootstraps from /api/round/current", async () => {
    const { store, getEs } = makeStore();
    expect(store.getSnapshot()).toBe(SERVER_SNAPSHOT);
    const cb = vi.fn();
    const unsub = store.subscribe(cb);
    await flush();
    expect(cb).toHaveBeenCalled();
    const snap = store.getSnapshot();
    expect(snap.bootstrapped).toBe(true);
    expect(snap.round.roundId).toBe(10);
    expect(snap.round.endsAt).toBe(1_784_222_343_000);
    expect(snap.round.phase).toBe("active");
    expect(snap.round.motherlodePea).toBe("900000000000000000");
    unsub();
    expect(getEs().closed).toBe(true);
  });

  it("a quiet stream stops reporting live, and a real event restores it", async () => {
    // `bootstrapped` is a one-way latch, so without an explicit staleness
    // signal a dead backend looks exactly like a healthy one and users can
    // commit funds against data the app knows is old.
    let backendUp = true;
    const { store, getEs } = makeStore({
      current: () =>
        backendUp
          ? json(CURRENT_ROUND)
          : Promise.reject(new Error("backend down")),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    expect(store.getSnapshot().bootstrapped).toBe(true);
    expect(store.getSnapshot().stale ?? false).toBe(false);

    // The backend dies and the stream goes quiet. Recycling the stream
    // cannot recover it, so the app must stop calling this data live.
    backendUp = false;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.getSnapshot().stale).toBe(true);
    // ...and it STAYS stale: a reconnect attempt is not fresh data.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.getSnapshot().stale).toBe(true);

    // A genuine event proves the stream is alive again. A heartbeat is
    // exactly that: liveness and nothing else.
    backendUp = true;
    getEs().emit("heartbeat", {});
    await flush();
    expect(store.getSnapshot().stale ?? false).toBe(false);
    unsub();
  });

  it("a reconnect keeps the larger tile totals instead of discarding the fetch", async () => {
    // On a roundId tie the live copy used to win outright, which is right
    // for a race but wrong for the reconnect this path actually runs on:
    // the fetch is the fresher read and the stream may have missed
    // deploys while it was down. Deploys only accumulate within a round,
    // so the larger total is the truth.
    const { store, getEs } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    const before = store.getSnapshot().round.tiles[0].deployedWei;
    // Force a re-bootstrap (what a reconnect does) and check we did not
    // regress the grid we already hold.
    getEs().emit("open", {});
    await flush();
    const after = store.getSnapshot().round.tiles[0].deployedWei;
    expect(BigInt(after)).toBeGreaterThanOrEqual(BigInt(before));
    unsub();
  });

  it("an unsettled round never becomes a permanent history row", async () => {
    // fetchSummary wrote whatever it received, and the union let the
    // existing copy win a tie, so a row written before settlement could
    // never be corrected and would show no winner forever.
    const { store } = makeStore({
      detail: (id) => json({ ...ROUND_7, roundId: id, settled: false }),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    const history = store.getSnapshot().history;
    // Nothing unsettled may be in history at all.
    expect(history.every((h) => h.winningTile !== null || h.isSplit)).toBe(true);
    unsub();
  });

  it("corrects a skewed device clock from the response Date header", async () => {
    // endsAt is server truth. A device a minute fast would watch the
    // board lock while the round was still live.
    const skewed = new ApiGameStore("http://api.test", {
      fetchFn: (async (url: RequestInfo | URL) => {
        const u = String(url);
        const body = u.includes("/api/round/current")
          ? CURRENT_ROUND
          : u.includes("/api/rounds?")
            ? roundsResponse([ROUND_7])
            : u.includes("/api/price")
              ? PRICE_NULL
              : {};
        // Server says it is 90s EARLIER than this device believes.
        return {
          ok: true,
          headers: { get: () => new Date(T0 - 90_000).toUTCString() },
          json: async () => body,
        };
      }) as unknown as typeof fetch,
      createEventSource: (url) => new FakeEventSource(url) as never,
    });
    const unsub = skewed.subscribe(() => {});
    await flush();
    // The corrected clock trails the device clock by roughly the skew.
    const drift = Date.now() - (skewed.serverNow?.() ?? Date.now());
    expect(drift).toBeGreaterThan(80_000);
    expect(drift).toBeLessThan(100_000);
    unsub();
  });

  it("hydrates the feed from current+previous round deploys with monotonic ids", async () => {
    const { store, calls } = makeStore({
      deploys: (id) =>
        json(
          deploysResponse(
            id,
            id === 10 ? [DEPLOY_A] : id === 9 ? [DEPLOY_B] : [],
          ),
        ),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    const feed = store.getSnapshot().feed;
    expect(feed).toHaveLength(2);
    expect(feed.map((f) => f.roundId).sort((a, b) => a - b)).toEqual([9, 10]);
    expect(feed[1].id).toBeGreaterThan(feed[0].id);
    const hydrated = feed.find((f) => f.roundId === 10)!;
    expect(hydrated.tiles).toEqual([0, 1, 2]);
    expect(hydrated.amountWei).toBe("7500000000000");
    expect(
      calls.filter((u) => /\/api\/round\/\d+\/deploys$/.test(u)),
    ).toHaveLength(2);
    unsub();
  });

  it("bootstraps history with translation (split → null winner, '0' peapot → null)", async () => {
    const { store } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    const history = store.getSnapshot().history;
    expect(history.map((h) => h.roundId)).toEqual([7, 5]); // newest first
    expect(history[1].winner).toBeNull();
    expect(history[1].motherlodePea).toBeNull();
    expect(history[0].motherlodePea).toBe("1500000000000000000");
    unsub();
  });

  it("bounds history at 120 rounds", async () => {
    const many: BackendRound[] = Array.from({ length: 130 }, (_, i) => ({
      ...ROUND_5,
      roundId: i + 1,
    }));
    const { store } = makeStore({ rounds: () => json(roundsResponse(many)) });
    const unsub = store.subscribe(() => {});
    await flush();
    const history = store.getSnapshot().history;
    expect(history).toHaveLength(120);
    expect(history[0].roundId).toBe(130);
    unsub();
  });

  it("null pea price → peaUsd 0; the 30s poll picks up a live price later", async () => {
    let live = false;
    const { store } = makeStore({
      price: () => json(live ? PRICE_LIVE : PRICE_NULL),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    expect(store.getSnapshot().prices.peaUsd).toBe(0);
    live = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getSnapshot().prices.peaUsd).toBe(12.4);
    unsub();
  });

  it("stays pre-bootstrap when round/current fails; SSE error surfaces; a roundTransition still bootstraps", async () => {
    const { store, getEs } = makeStore({
      current: () => json({ error: "down" }, 500),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    expect(store.getSnapshot().bootstrapped).toBe(false);
    getEs().emit("error", {});
    expect(store.getSnapshot().error).toBe(true);
    getEs().emit("roundTransition", transitionEvent({ settled: null }));
    await flush();
    const snap = store.getSnapshot();
    expect(snap.bootstrapped).toBe(true);
    expect(snap.error).toBe(false);
    expect(snap.round.roundId).toBe(11);
    unsub();
  });
});

describe("ApiGameStore lifecycle races", () => {
  it("StrictMode: unsubscribe mid-bootstrap then resubscribe — stale fetch dropped, one live ES", async () => {
    const held: { resolve?: (r: Response) => void } = {};
    let call = 0;
    const { store, created } = makeStore({
      current: () => {
        call++;
        if (call === 1)
          return new Promise<Response>((r) => {
            held.resolve = r;
          });
        return json(CURRENT_ROUND);
      },
    });
    const unsub1 = store.subscribe(() => {});
    unsub1(); // fetch #1 still in flight
    const unsub2 = store.subscribe(() => {});
    await flush();
    expect(created).toHaveLength(2);
    expect(created[0].closed).toBe(true);
    expect(created[1].closed).toBe(false);
    expect(store.getSnapshot().round.roundId).toBe(10);
    // The stale epoch-1 fetch resolving cannot regress anything.
    held.resolve!(json({ ...CURRENT_ROUND, roundId: "999" }));
    await flush();
    expect(store.getSnapshot().round.roundId).toBe(10);
    unsub2();
  });

  it("only the latest-issued bootstrap applies (open-resync supersedes the initial fetch)", async () => {
    const held: Array<(r: Response) => void> = [];
    const { store, getEs } = makeStore({
      current: () =>
        new Promise<Response>((r) => {
          held.push(r);
        }),
    });
    const unsub = store.subscribe(() => {});
    getEs().emit("open", {}); // issues bootstrap #2
    await flush();
    expect(held).toHaveLength(2);
    held[1](json({ ...CURRENT_ROUND, roundId: "900" }));
    await flush();
    expect(store.getSnapshot().round.roundId).toBe(900);
    // Stale bootstrap #1 resolving with a HIGHER roundId must still lose.
    held[0](json({ ...CURRENT_ROUND, roundId: "901" }));
    await flush();
    expect(store.getSnapshot().round.roundId).toBe(900);
    unsub();
  });

  it("SSE 'open' re-runs the bootstrap (reconnect resync)", async () => {
    const { store, getEs, currentCalls } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    const before = currentCalls();
    getEs().emit("open", {});
    await flush();
    expect(currentCalls()).toBe(before + 1);
    unsub();
  });

  it("a raced own-deploy lock survives a stale bootstrap (grid must not unlock)", async () => {
    const held: { resolve?: (r: Response) => void } = {};
    const { store, getEs } = makeStore({
      current: () =>
        new Promise<Response>((r) => {
          held.resolve = r;
        }),
    });
    store.setAddress(DEPLOY_A.user as Address);
    const unsub = store.subscribe(() => {});
    // Own deploy arrives while the bootstrap fetch is in flight.
    getEs().emit("deployed", deployedEvent());
    expect(store.getSnapshot().user.deployedRound).toBe(10);
    // The stale body (userDeployed "0") must not clear the lock.
    held.resolve!(json(CURRENT_ROUND));
    await flush();
    expect(store.getSnapshot().user.deployedRound).toBe(10);
    expect(store.getSnapshot().user.deployedTiles).toEqual([0, 1, 2]);
    unsub();
  });
});

describe("ApiGameStore deployed events", () => {
  it("replaces the grid wholesale and appends the feed item", async () => {
    const { store, getEs } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    const feedBefore = store.getSnapshot().feed.length;
    getEs().emit(
      "deployed",
      deployedEvent({ deploy: DEPLOY_B }),
    );
    const snap = store.getSnapshot();
    expect(snap.round.totalDeployedWei).toBe("70000000000000");
    expect(snap.round.tiles[0].deployedWei).toBe("5000000000000");
    expect(snap.round.endsAt).toBe(1_784_222_343_000); // untouched
    expect(snap.feed).toHaveLength(feedBefore + 1);
    unsub();
  });

  it("keeps EVERY miner of an executeBatch tx (shared txHash, distinct users — live 2026-07-17)", async () => {
    const BATCH_TX =
      "0xf133e4751b472058043fdd82ea5208db168a2bb19787775e38ac802e74ea7695";
    const batch = [
      { ...DEPLOY_A, txHash: BATCH_TX, isAutoMine: true },
      { ...DEPLOY_B, txHash: BATCH_TX, isAutoMine: true },
    ];
    const { store, getEs } = makeStore({
      deploys: (id) => json(deploysResponse(id, id === 10 ? batch : [])),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    // Hydration must keep BOTH rows despite the shared txHash.
    const rows = store.getSnapshot().feed.filter((f) => f.roundId === 10);
    expect(rows.map((r) => r.miner)).toEqual([
      DEPLOY_A.user,
      DEPLOY_B.user,
    ]);
    // Re-delivered SSE events for the SAME (tx, miner) pairs still dedupe.
    getEs().emit("deployed", deployedEvent({ deploy: batch[0] }));
    getEs().emit("deployed", deployedEvent({ user: DEPLOY_B.user, deploy: batch[1] }));
    expect(
      store.getSnapshot().feed.filter((f) => f.roundId === 10),
    ).toHaveLength(2);
    unsub();
  });

  it("dedupes by txHash across hydration and SSE (stable ids, no duplicate keys)", async () => {
    const { store, getEs } = makeStore(); // hydration already contains DEPLOY_A
    const unsub = store.subscribe(() => {});
    await flush();
    const before = store.getSnapshot().feed;
    getEs().emit("deployed", deployedEvent({ deploy: DEPLOY_A }));
    getEs().emit("deployed", deployedEvent({ deploy: DEPLOY_A }));
    const after = store.getSnapshot().feed;
    expect(after.filter((f) => f.roundId === 10)).toHaveLength(1);
    expect(after.find((f) => f.roundId === 10)!.id).toBe(
      before.find((f) => f.roundId === 10)!.id,
    );
    unsub();
  });

  it("handles the LIVE payload shape — no deploy.user — grid applies, miner from top-level (regression)", async () => {
    const { store, getEs } = makeStore({
      deploys: (id) => json(deploysResponse(id, [])),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    getEs().emit("deployed", deployedEvent()); // default = real SSE shape
    const snap = store.getSnapshot();
    expect(snap.round.totalDeployedWei).toBe("70000000000000"); // grid applied
    const item = snap.feed.find((f) => f.roundId === 10);
    expect(item).toBeDefined();
    expect(item!.miner).toBe(DEPLOY_A.user); // from the event's top-level user
    expect(item!.tiles).toEqual([0, 1, 2]);
    unsub();
  });

  it("applies the grid but no feed item when deploy is null (webhook outage)", async () => {
    const { store, getEs } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    const feedBefore = store.getSnapshot().feed.length;
    getEs().emit("deployed", deployedEvent({ deploy: null, user: null }));
    expect(store.getSnapshot().round.totalDeployedWei).toBe("70000000000000");
    expect(store.getSnapshot().feed).toHaveLength(feedBefore);
    unsub();
  });

  it("bounds the feed at FEED_LIMIT (600) with monotonic ids", async () => {
    const { store, getEs } = makeStore({
      deploys: (id) => json(deploysResponse(id, [])),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    for (let i = 0; i < 610; i++) {
      getEs().emit(
        "deployed",
        deployedEvent({
          deploy: { ...DEPLOY_A, txHash: `0xfeed${i.toString(16)}` },
        }),
      );
    }
    const feed = store.getSnapshot().feed;
    expect(feed).toHaveLength(600);
    expect(feed[0].id).toBe(11); // oldest 10 trimmed
    expect(feed[599].id).toBe(610);
    unsub();
  });

  it("locks the user slice on an own deploy (manual or AutoMiner deployFor)", async () => {
    const { store, getEs } = makeStore();
    store.setAddress(DEPLOY_A.user!.toUpperCase() as Address); // case-insensitive
    const unsub = store.subscribe(() => {});
    await flush();
    getEs().emit("deployed", deployedEvent());
    const user = store.getSnapshot().user;
    expect(user.deployedRound).toBe(10);
    expect(user.deployedTiles).toEqual([0, 1, 2]);
    unsub();
  });
});

describe("ApiGameStore round transitions", () => {
  it("synthesizes settling at endsAt before any transition arrives (VRF lag)", async () => {
    const { store } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    expect(store.getSnapshot().round.phase).toBe("active");
    await vi.advanceTimersByTimeAsync(45_000); // past endTime (T0+43s)
    expect(store.getSnapshot().round.phase).toBe("settling");
    expect(store.getSnapshot().round.winningTile).toBeNull(); // no winner yet
    unsub();
  });

  it("reveal sequence: winner + endsAt anchor → history from /api/round/:id → newRound after the hold", async () => {
    const { store, getEs } = makeStore({
      detail: (id) => json({ ...ROUND_7, roundId: id, winningBlock: 14 }),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    getEs().emit("roundTransition", transitionEvent());
    const revealed = store.getSnapshot().round;
    expect(revealed.roundId).toBe(10); // still the settled round
    expect(revealed.phase).toBe("settling");
    expect(revealed.winningTile).toBe(14);
    expect(revealed.endsAt).toBe(Date.now()); // reveal anchor
    await flush(); // summary fetch lands
    expect(store.getSnapshot().history[0].roundId).toBe(10);
    // Grid activity for round 11 during the hold is buffered, not applied.
    getEs().emit(
      "deployed",
      deployedEvent({
        roundId: "11",
        blocks: blocksWith({ 3: { deployed: "42", minerCount: 1 } }),
        totalDeployed: "42",
        deploy: { ...DEPLOY_B, blocks: [3] },
      }),
    );
    expect(store.getSnapshot().round.roundId).toBe(10);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(store.getSnapshot().round.roundId).toBe(10); // still held
    await vi.advanceTimersByTimeAsync(250);
    const next = store.getSnapshot().round;
    expect(next.roundId).toBe(11);
    expect(next.phase).toBe("active");
    expect(next.tiles[3].deployedWei).toBe("42"); // buffered grid applied
    expect(next.totalDeployedWei).toBe("42");
    // The buffered deploy's feed item arrived immediately.
    expect(
      store.getSnapshot().feed.some((f) => f.roundId === 11),
    ).toBe(true);
    unsub();
  });

  it("settled: null (empty round) rolls immediately, no reveal", async () => {
    const { store, getEs } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    getEs().emit("roundTransition", transitionEvent({ settled: null }));
    const snap = store.getSnapshot();
    expect(snap.round.roundId).toBe(11);
    expect(snap.round.phase).toBe("active");
    unsub();
  });

  it("clears the user lock at rollover unless the lock is for the new round", async () => {
    const { store, getEs } = makeStore();
    store.setAddress(DEPLOY_A.user as Address);
    const unsub = store.subscribe(() => {});
    await flush();
    getEs().emit("deployed", deployedEvent()); // lock round 10
    expect(store.getSnapshot().user.deployedRound).toBe(10);
    getEs().emit("roundTransition", transitionEvent({ settled: null }));
    expect(store.getSnapshot().user.deployedRound).toBeNull();
    // AutoMiner deploys for round 12 during round 11 → lock survives the roll.
    getEs().emit(
      "deployed",
      deployedEvent({
        roundId: "12",
        deploy: { ...DEPLOY_A, txHash: "0xnext" },
      }),
    );
    getEs().emit(
      "roundTransition",
      transitionEvent({
        settled: null,
        newRound: {
          roundId: "12",
          startTime: 1_784_222_500,
          endTime: 1_784_222_560,
          peapotPool: "1",
        },
      }),
    );
    expect(store.getSnapshot().round.roundId).toBe(12);
    expect(store.getSnapshot().user.deployedRound).toBe(12);
    unsub();
  });

  it("treats an enriched zeros-object settle (winnerCount: null) as an empty round", async () => {
    const { store, getEs, calls } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    const detailCallsBefore = calls.filter((u) =>
      /\/api\/round\/\d+$/.test(u),
    ).length;
    // New backend payload: empty rounds settle as a zeros OBJECT, not null.
    getEs().emit(
      "roundTransition",
      transitionEvent({
        settled: {
          roundId: "10",
          winningBlock: 0,
          topMiner: "0x0000000000000000000000000000000000000000",
          totalWinnings: "0",
          topMinerReward: "0",
          peapotAmount: "0",
          isSplit: null,
          peaWinner: null,
          winnerCount: null,
        },
      }),
    );
    await flush();
    const snap = store.getSnapshot();
    expect(snap.round.roundId).toBe(11); // immediate roll — no reveal hold
    expect(snap.round.phase).toBe("active");
    // No bogus history row / summary fetch for a round nobody played.
    expect(snap.history.some((h) => h.roundId === 10)).toBe(false);
    expect(
      calls.filter((u) => /\/api\/round\/\d+$/.test(u)).length,
    ).toBe(detailCallsBefore);
    unsub();
  });

  it("recycles a silently-dead stream after 90s without events (heartbeat watchdog)", async () => {
    const { store, created } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    expect(created).toHaveLength(1);
    // Heartbeats keep it alive…
    await vi.advanceTimersByTimeAsync(60_000);
    created[0].emit("heartbeat", { timestamp: "t" });
    await vi.advanceTimersByTimeAsync(60_000);
    created[0].emit("heartbeat", { timestamp: "t" });
    expect(created).toHaveLength(1);
    // …then the stream goes silent: no events for >90s ⇒ recycled.
    await vi.advanceTimersByTimeAsync(91_000);
    expect(created).toHaveLength(2);
    expect(created[0].closed).toBe(true);
    expect(created[1].closed).toBe(false);
    unsub();
  });

  it("drops stale/re-delivered transitions (monotonic newRound guard)", async () => {
    const { store, getEs } = makeStore();
    const unsub = store.subscribe(() => {});
    await flush();
    getEs().emit("roundTransition", transitionEvent({ settled: null }));
    expect(store.getSnapshot().round.roundId).toBe(11);
    getEs().emit("roundTransition", transitionEvent({ settled: null })); // newRound 11 again
    expect(store.getSnapshot().round.roundId).toBe(11);
    unsub();
  });
});

describe("ApiGameStore stale-round recovery", () => {
  const FRESH_13 = {
    ...CURRENT_ROUND,
    roundId: "13",
    startTime: 1_784_222_340,
    endTime: 1_784_222_460,
    totalDeployed: "42",
    blocks: blocksWith({ 3: { deployed: "42", minerCount: 1 } }),
  };

  it("recovers while stuck settling: reveals OUR settled round, THEN adopts the newer one", async () => {
    let current = CURRENT_ROUND; // round 10, has deploys
    const { store } = makeStore({
      current: () => json(current),
      deploys: (id) =>
        json(deploysResponse(id, id === 13 ? [DEPLOY_B] : [])),
      detail: (id) => json({ ...ROUND_7, roundId: id, winningBlock: 12 }),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    expect(store.getSnapshot().round.roundId).toBe(10);
    // Round 10 ends; the backend cache keeps serving it (observed live).
    await vi.advanceTimersByTimeAsync(45_000);
    expect(store.getSnapshot().round.phase).toBe("settling");
    // The cache catches up to the chain's round 13 — but round 10 had
    // deploys and settled, so the reveal MUST play before the roll
    // (live miss 2026-07-17: instant adoption ate the winner animation).
    current = FRESH_13;
    await vi.advanceTimersByTimeAsync(10_500); // next recovery poll
    let snap = store.getSnapshot();
    expect(snap.round.roundId).toBe(10); // still revealing
    expect(snap.round.phase).toBe("settling");
    expect(snap.round.winningTile).toBe(12); // from the round detail
    expect(snap.round.endsAt).toBeGreaterThan(1_784_222_343_000); // re-anchored
    expect(snap.history[0].roundId).toBe(10);
    await vi.advanceTimersByTimeAsync(8_300); // hold elapses
    snap = store.getSnapshot();
    expect(snap.round.roundId).toBe(13);
    expect(snap.round.phase).toBe("active");
    expect(snap.round.tiles[3].deployedWei).toBe("42");
    expect(snap.feed.some((f) => f.roundId === 13)).toBe(true);
    unsub();
  });

  it("an SSE transition during a recovery-started reveal never restarts the animation", async () => {
    let current = CURRENT_ROUND;
    const { store, getEs } = makeStore({
      current: () => json(current),
      deploys: (id) => json(deploysResponse(id, [])),
      detail: (id) => json({ ...ROUND_7, roundId: id, winningBlock: 12 }),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    await vi.advanceTimersByTimeAsync(45_000); // settling
    current = FRESH_13;
    await vi.advanceTimersByTimeAsync(10_500); // recovery starts the reveal
    const revealed = store.getSnapshot().round;
    expect(revealed.winningTile).toBe(12);
    const anchor = revealed.endsAt;
    // The late transition for the same settlement arrives mid-reveal.
    getEs().emit(
      "roundTransition",
      transitionEvent({
        newRound: {
          roundId: "11",
          startTime: 1_784_222_404,
          endTime: 1_784_222_464,
          peapotPool: "1",
        },
      }),
    );
    await flush();
    const during = store.getSnapshot().round;
    expect(during.roundId).toBe(10);
    expect(during.endsAt).toBe(anchor); // NOT re-anchored — no restart
    expect(during.winningTile).toBe(12); // transition's block 14 ignored
    await vi.advanceTimersByTimeAsync(8_300);
    // Rollover keeps the FURTHEST known round (13 from recovery, not 11).
    expect(store.getSnapshot().round.roundId).toBe(13);
    unsub();
  });

  it("adopts same-round grid changes while settling (missed deployed events)", async () => {
    let current = CURRENT_ROUND; // round 10, zero grid
    const { store } = makeStore({ current: () => json(current) });
    const unsub = store.subscribe(() => {});
    await flush();
    await vi.advanceTimersByTimeAsync(45_000); // settling
    // A deploy landed but its SSE event never reached us — the backend's
    // round/current eventually reflects it.
    current = {
      ...CURRENT_ROUND,
      totalDeployed: "42",
      blocks: blocksWith({ 5: { deployed: "42", minerCount: 1 } }),
    };
    await vi.advanceTimersByTimeAsync(10_500);
    const snap = store.getSnapshot();
    expect(snap.round.roundId).toBe(10);
    expect(snap.round.phase).toBe("settling"); // phase/endsAt untouched
    expect(snap.round.totalDeployedWei).toBe("42");
    expect(snap.round.tiles[5].deployedWei).toBe("42");
    unsub();
  });

  it("a deployed event for a round ahead of ours triggers immediate recovery", async () => {
    let current = CURRENT_ROUND;
    const { store, getEs } = makeStore({
      current: () => json(current),
      deploys: (id) => json(deploysResponse(id, [])),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    expect(store.getSnapshot().round.roundId).toBe(10);
    current = FRESH_13;
    getEs().emit(
      "deployed",
      deployedEvent({
        roundId: "13",
        totalDeployed: "42",
        blocks: FRESH_13.blocks,
        deploy: { ...DEPLOY_B, txHash: "0xahead" },
      }),
    );
    await flush();
    expect(store.getSnapshot().round.roundId).toBe(13);
    unsub();
  });

  it("backfills the settled round's deploys on a transition (missed live events)", async () => {
    let extra = false;
    const { store, getEs } = makeStore({
      deploys: (id) =>
        json(
          deploysResponse(
            id,
            id === 10 ? (extra ? [DEPLOY_A, DEPLOY_B] : [DEPLOY_A]) : [],
          ),
        ),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    expect(
      store.getSnapshot().feed.filter((f) => f.roundId === 10),
    ).toHaveLength(1);
    // DEPLOY_B's live `deployed` event was missed; the transition backfills.
    extra = true;
    getEs().emit("roundTransition", transitionEvent());
    await flush();
    expect(
      store.getSnapshot().feed.filter((f) => f.roundId === 10),
    ).toHaveLength(2);
    unsub();
  });
});

describe("ApiGameStore setAddress", () => {
  it("re-bootstraps with ?user= and derives the lock from userDeployed + own deploys", async () => {
    const { store, calls } = makeStore({
      current: (u) =>
        json({
          ...CURRENT_ROUND,
          userDeployed: u.includes("?user=") ? "7500000000000" : "0",
        }),
    });
    const unsub = store.subscribe(() => {});
    await flush();
    expect(store.getSnapshot().user.deployedRound).toBeNull();
    store.setAddress(DEPLOY_A.user!.toUpperCase() as Address);
    await flush();
    expect(
      calls.some((u) => u.includes(`?user=${DEPLOY_A.user}`)), // lowercased
    ).toBe(true);
    const user = store.getSnapshot().user;
    expect(user.deployedRound).toBe(10);
    expect(user.deployedTiles).toEqual([0, 1, 2]); // from hydrated own deploy
    unsub();
  });
});
