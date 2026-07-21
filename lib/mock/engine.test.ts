import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEngine,
  deriveTiles,
  ethToWei,
  FEED_LIMIT,
  ROUND_DURATION_MS,
  SERVER_SNAPSHOT,
  settleRound,
  SETTLING_MS,
} from "@/lib/mock/engine";
import { createRng } from "@/lib/mock/rng";
import type { Address, DeployEventWire } from "@/lib/types";

const USER: Address = "0x1111111111111111111111111111111111111111";

function makeEngine(seed = 7) {
  return createEngine({ seed, now: () => Date.now() });
}

describe("MockEngine construction (fast-forwarded seeding)", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_900_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  it("is deterministic: same seed + same clock ⇒ identical history", () => {
    const a = makeEngine(11).getSnapshot();
    const b = makeEngine(11).getSnapshot();
    expect(a.history).toEqual(b.history);
    expect(a.round.tiles).toEqual(b.round.tiles);
  });

  it("different seeds diverge", () => {
    const a = makeEngine(1).getSnapshot();
    const b = makeEngine(2).getSnapshot();
    expect(a.history).not.toEqual(b.history);
  });

  it("seeds ≥50 settled rounds, newest first, with consecutive ids", () => {
    const { history } = makeEngine().getSnapshot();
    expect(history.length).toBeGreaterThanOrEqual(50);
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1].roundId).toBe(history[i].roundId + 1);
      expect(history[i - 1].settledAt).toBeGreaterThan(history[i].settledAt);
    }
  });

  it("holds the settlement invariant on every seeded round: deployed = vaulted + winnings, vaulted = 10%", () => {
    const { history } = makeEngine().getSnapshot();
    for (const h of history) {
      const deployed = BigInt(h.deployedWei);
      const vaulted = BigInt(h.vaultedWei);
      const winnings = BigInt(h.winningsWei);
      expect(vaulted + winnings).toBe(deployed);
      const pct = Number((vaulted * 10_000n) / deployed) / 100;
      if (h.winnerCount === 0) {
        // Nobody covered the drawn tile: the whole round vaults.
        expect(pct).toBe(100);
        expect(winnings).toBe(0n);
      } else {
        expect(pct).toBeGreaterThanOrEqual(9.9); // flat 10% fee, integer division shaves a hundredth
        expect(pct).toBeLessThanOrEqual(10.0);
      }
    }
  });

  it("a round whose drawn tile nobody covered vaults 100% and pays no winnings", () => {
    // Cover a single tile, then settle repeatedly until the uniform draw
    // lands somewhere else. That round must vault everything.
    const rng = createRng(5);
    const events: DeployEventWire[] = [
      {
        id: 1,
        roundId: 4,
        miner: USER,
        tiles: [12],
        amountWei: ethToWei(2),
        at: 0,
      },
    ];
    let sawUncovered = false;
    for (let i = 0; i < 200 && !sawUncovered; i++) {
      const s = settleRound(4, events, rng, 1000, null);
      if (s.winningTile === 12) continue;
      sawUncovered = true;
      expect(s.winnerCount).toBe(0);
      expect(s.winner).toBeNull();
      expect(s.isSplit).toBe(false);
      expect(s.winningsWei).toBe("0");
      expect(s.vaultedWei).toBe(s.deployedWei);
    }
    expect(sawUncovered).toBe(true);
  });

  it("produces reference-scale rounds (winner counts ~130-180, deployed ~8-16 ETH)", () => {
    const { history } = makeEngine().getSnapshot();
    for (const h of history.slice(0, 10)) {
      expect(h.winnerCount).toBeGreaterThan(100);
      expect(h.winnerCount).toBeLessThan(220);
      const eth = Number(BigInt(h.deployedWei) / 1_000_000_000_000n) / 1e6;
      expect(eth).toBeGreaterThan(6);
      expect(eth).toBeLessThan(20);
    }
  });

  it("live round starts active with dense 25 tiles and endsAt = now + duration", () => {
    const snap = makeEngine().getSnapshot();
    expect(snap.round.phase).toBe("active");
    expect(snap.round.tiles).toHaveLength(25);
    expect(snap.round.endsAt).toBe(Date.now() + ROUND_DURATION_MS);
  });

  it("server snapshot is deterministic, empty, and referentially stable", () => {
    const e = makeEngine();
    expect(e.getServerSnapshot()).toBe(SERVER_SNAPSHOT);
    expect(SERVER_SNAPSHOT.bootstrapped).toBe(false);
    expect(SERVER_SNAPSHOT.round.tiles).toHaveLength(25);
    expect(SERVER_SNAPSHOT.round.totalDeployedWei).toBe("0");
  });
});

describe("live ticking", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_900_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  it("does nothing until subscribed (no module/constructor side effects)", () => {
    const e = makeEngine();
    const before = e.getSnapshot();
    vi.advanceTimersByTime(10_000);
    expect(e.getSnapshot()).toBe(before); // same identity — no mutations
  });

  it("emits paced deploys while active; feed ids are strictly monotonic", () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    vi.advanceTimersByTime(15_000);
    const snap = e.getSnapshot();
    expect(snap.round.tiles.some((t) => t.minerCount > 0)).toBe(true);
    const ids = snap.feed.map((f) => f.id);
    for (let i = 1; i < ids.length; i++)
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    unsub();
  });

  it("settles at endsAt, then rolls a new active round after SETTLING_MS", () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    const startRound = e.getSnapshot().round.roundId;

    vi.advanceTimersByTime(ROUND_DURATION_MS + 500);
    const settling = e.getSnapshot();
    expect(settling.round.phase).toBe("settling");
    expect(settling.round.winningTile).not.toBeNull();
    expect(settling.history[0].roundId).toBe(startRound);

    vi.advanceTimersByTime(SETTLING_MS + 500);
    const next = e.getSnapshot();
    expect(next.round.phase).toBe("active");
    expect(next.round.roundId).toBe(startRound + 1);
    unsub();
  });

  it("a round that got zero live ticks (throttled background tab) still settles with a winner", () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    const { roundId, endsAt } = e.getSnapshot().round;

    // Jump the clock straight past endsAt WITHOUT running the intervening
    // interval callbacks — exactly what browser background-tab throttling
    // does — then let a single tick fire.
    vi.setSystemTime(endsAt + 500);
    vi.advanceTimersByTime(1_000);

    const settled = e.getSnapshot().history[0];
    expect(settled.roundId).toBe(roundId);
    expect(BigInt(settled.deployedWei)).toBeGreaterThan(0n);
    expect(settled.isSplit || settled.winner !== null).toBe(true);
    expect(settled.winnerCount).toBeGreaterThan(0);
    unsub();
  });

  it("stops ticking after the last unsubscribe", () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    vi.advanceTimersByTime(2_000);
    unsub();
    const frozen = e.getSnapshot();
    vi.advanceTimersByTime(30_000);
    expect(e.getSnapshot()).toBe(frozen);
  });
});

describe("deploy()", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_900_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  const PARAMS = {
    miner: USER,
    amountPerTileWei: ethToWei(0.01),
    tiles: [0, 1, 2],
    rounds: 1,
  };

  it("resolves after latency, merges into tiles + feed, and locks the round", async () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    const p = e.deploy(PARAMS);
    await vi.advanceTimersByTimeAsync(600);
    await p;

    const snap = e.getSnapshot();
    expect(snap.user.deployedRound).toBe(snap.round.roundId);
    expect(snap.user.deployedTiles).toEqual([0, 1, 2]);
    expect(snap.feed.some((f) => f.miner === USER)).toBe(true);
    // 0.01 ETH per tile lands on each of the three tiles.
    const t0 = BigInt(snap.round.tiles[0].deployedWei);
    expect(t0 >= BigInt(ethToWei(0.01))).toBe(true);
    unsub();
  });

  it("rejects a second deploy in the same round", async () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    const p1 = e.deploy(PARAMS);
    await vi.advanceTimersByTimeAsync(600);
    await p1;
    const p2 = e.deploy(PARAMS);
    p2.catch(() => {}); // observed below
    await vi.advanceTimersByTimeAsync(600);
    await expect(p2).rejects.toThrow(/already deployed/i);
    unsub();
  });

  it("auto-redeploys for N rounds and decrements the counter", async () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    const p = e.deploy({ ...PARAMS, rounds: 3 });
    await vi.advanceTimersByTimeAsync(600);
    await p;
    expect(e.getSnapshot().user.autoRemaining).toBe(2);

    // Roll into round 2 — auto-redeploy fires.
    await vi.advanceTimersByTimeAsync(ROUND_DURATION_MS + SETTLING_MS + 1000);
    const r2 = e.getSnapshot();
    expect(r2.user.deployedRound).toBe(r2.round.roundId);
    expect(r2.user.autoRemaining).toBe(1);

    // Roll into round 3 — last auto round.
    await vi.advanceTimersByTimeAsync(ROUND_DURATION_MS + SETTLING_MS + 1000);
    const r3 = e.getSnapshot();
    expect(r3.user.deployedRound).toBe(r3.round.roundId);
    expect(r3.user.autoRemaining).toBe(0);

    // Round 4 — no more auto; unlocked.
    await vi.advanceTimersByTimeAsync(ROUND_DURATION_MS + SETTLING_MS + 1000);
    expect(e.getSnapshot().user.deployedRound).toBeNull();
    unsub();
  });
});

describe("pure derivations", () => {
  it("deriveTiles splits a deploy evenly across its tiles", () => {
    const events: DeployEventWire[] = [
      {
        id: 1,
        roundId: 1,
        miner: USER,
        tiles: [0, 4],
        amountWei: ethToWei(0.2),
        at: 0,
      },
    ];
    const tiles = deriveTiles(events);
    expect(tiles[0].deployedWei).toBe(ethToWei(0.1));
    expect(tiles[4].deployedWei).toBe(ethToWei(0.1));
    expect(tiles[0].minerCount).toBe(1);
    expect(tiles[1].deployedWei).toBe("0");
  });

  it("settleRound counts the coverers of the drawn tile and holds the invariant", () => {
    const rng = createRng(3);
    const events: DeployEventWire[] = [
      {
        id: 1,
        roundId: 9,
        miner: USER,
        tiles: [7],
        amountWei: ethToWei(1),
        at: 0,
      },
      {
        id: 2,
        roundId: 9,
        miner: "0x2222222222222222222222222222222222222222",
        tiles: [7],
        amountWei: ethToWei(0.5),
        at: 0,
      },
    ];
    const s = settleRound(9, events, rng, 1000, null);
    // Tile 7 is the only covered tile, so coverers are counted only when the
    // uniform draw actually lands there. ETH never buys a better chance.
    expect(s.winnerCount).toBe(s.winningTile === 7 ? 2 : 0);
    expect(BigInt(s.vaultedWei) + BigInt(s.winningsWei)).toBe(
      BigInt(s.deployedWei),
    );
  });

  it("the winning tile is uniform 1-in-25: ETH on a tile does not raise its odds", () => {
    // One tile carries 1000x the ETH of another. Over many settles the draw
    // must stay flat, and the heavy tile must not dominate.
    const rng = createRng(11);
    const events: DeployEventWire[] = [
      {
        id: 1,
        roundId: 1,
        miner: USER,
        tiles: [3],
        amountWei: ethToWei(1000),
        at: 0,
      },
      {
        id: 2,
        roundId: 1,
        miner: "0x2222222222222222222222222222222222222222",
        tiles: [4],
        amountWei: ethToWei(1),
        at: 0,
      },
    ];
    const counts = new Array(25).fill(0);
    const N = 5000;
    for (let i = 0; i < N; i++)
      counts[settleRound(1, events, rng, 1000, null).winningTile]++;
    expect(counts.every((c) => c > 0)).toBe(true); // every tile reachable
    const expected = N / 25;
    for (const c of counts)
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.35);
    // The 1000x tile is not favoured over its 1x neighbour by any real margin.
    expect(Math.abs(counts[3] - counts[4]) / expected).toBeLessThan(0.35);
  });
});

describe("audit round-1 pins", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_900_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  it("the SHIPPED seed's history contains motherlode hits (Motherlodes table non-empty on fresh load)", async () => {
    const { MOCK_SEED } = await import("@/lib/engineContext");
    const { history } = createEngine({
      seed: MOCK_SEED,
      now: () => Date.now(),
    }).getSnapshot();
    const hits = history.filter((h) => h.motherlodePea !== null);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("deploy() during the settling phase rejects and does NOT arm auto-redeploy", async () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    vi.advanceTimersByTime(ROUND_DURATION_MS + 500); // now settling
    expect(e.getSnapshot().round.phase).toBe("settling");
    const p = e.deploy({
      miner: USER,
      amountPerTileWei: ethToWei(0.01),
      tiles: [0],
      rounds: 5,
    });
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(600);
    await expect(p).rejects.toThrow(/not active/i);
    // Next round must not auto-deploy from the rejected params.
    await vi.advanceTimersByTimeAsync(SETTLING_MS + 1000);
    expect(e.getSnapshot().user.deployedRound).toBeNull();
    expect(e.getSnapshot().user.autoRemaining).toBe(0);
    unsub();
  });

  it("snapshot slice identities: stats stable across ticks, new at settlement; round slice new after a user deploy", async () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    vi.advanceTimersByTime(2_000);
    const s1 = e.getSnapshot();
    vi.advanceTimersByTime(2_000);
    const s2 = e.getSnapshot();
    expect(s2.protocolStats).toBe(s1.protocolStats); // no settlement between
    expect(s2.history).toBe(s1.history);

    const p = e.deploy({
      miner: USER,
      amountPerTileWei: ethToWei(0.01),
      tiles: [3],
      rounds: 1,
    });
    await vi.advanceTimersByTimeAsync(600);
    await p;
    const s3 = e.getSnapshot();
    expect(s3.round).not.toBe(s2.round); // user deploy dirtied the round slice
    expect(
      BigInt(s3.round.tiles[3].deployedWei) >= BigInt(ethToWei(0.01)),
    ).toBe(true);

    vi.advanceTimersByTime(ROUND_DURATION_MS + 500); // settlement
    const s4 = e.getSnapshot();
    expect(s4.protocolStats).not.toBe(s2.protocolStats); // stats move at settlement
    expect(s4.history).not.toBe(s2.history);
    unsub();
  });

  it("feed stays bounded and ids stay monotonic across many rounds", () => {
    const e = makeEngine();
    const unsub = e.subscribe(() => {});
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(ROUND_DURATION_MS + SETTLING_MS + 1000);
    }
    const { feed } = e.getSnapshot();
    expect(feed.length).toBeLessThanOrEqual(FEED_LIMIT);
    for (let i = 1; i < feed.length; i++)
      expect(feed[i].id).toBeGreaterThan(feed[i - 1].id);
    unsub();
  });
});
