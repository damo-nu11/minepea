import { describe, expect, it } from "vitest";
import {
  CURRENT_ROUND,
  DEPLOY_A,
  PRICE_LIVE,
  PRICE_NULL,
  ROUND_5,
  ROUND_7,
  transitionEvent,
} from "./fixtures";
import {
  toDeployEventWire,
  toNewRoundWire,
  toPeaUsd,
  toRoundSummaryWire,
  toRoundWire,
  toTiles,
  withSettlement,
} from "./translate";

const T_ACTIVE = 1_784_222_300_000; // between startTime and endTime (ms)

describe("toRoundWire", () => {
  it("translates the /api/round/current dialect", () => {
    const round = toRoundWire(CURRENT_ROUND, T_ACTIVE);
    expect(round.roundId).toBe(10); // string → number
    expect(round.startedAt).toBe(1_784_222_283_000); // s → ms
    expect(round.endsAt).toBe(1_784_222_343_000);
    expect(round.phase).toBe("active");
    expect(round.tiles).toHaveLength(25);
    expect(round.tiles[0]).toEqual({
      id: 0,
      deployedWei: "2500000000000",
      minerCount: 1,
    });
    expect(round.tiles[24].deployedWei).toBe("0");
    expect(round.motherlodePea).toBe("900000000000000000"); // peapotPool
    expect(round.totalDeployedWei).toBe("62500000000000");
    expect(round.winningTile).toBeNull();
  });

  it("synthesizes 'settling' past endsAt (VRF settlement lag)", () => {
    const past = toRoundWire(CURRENT_ROUND, 1_784_222_343_000);
    expect(past.phase).toBe("settling");
    const settled = toRoundWire(
      { ...CURRENT_ROUND, settled: true },
      T_ACTIVE,
    );
    expect(settled.phase).toBe("settling");
  });

  it("maps the attached post-settle winner, zero-address → null", () => {
    const round = toRoundWire(
      {
        ...CURRENT_ROUND,
        settled: true,
        winner: {
          winningBlock: 14,
          topMiner: "0x0000000000000000000000000000000000000000",
          totalWinnings: "1",
          topMinerReward: "1",
          peapotAmount: "0",
          isSplit: true,
        },
      },
      T_ACTIVE,
    );
    expect(round.winningTile).toBe(14);
    expect(round.winner).toBeNull();
    expect(round.isSplit).toBe(true);
  });
});

describe("toRoundSummaryWire", () => {
  it("maps a split round: peaWinner null, peapot '0' → null, ISO settledAt", () => {
    const s = toRoundSummaryWire(ROUND_5);
    expect(s.roundId).toBe(5);
    expect(s.winningTile).toBe(17);
    expect(s.winner).toBeNull();
    expect(s.isSplit).toBe(true);
    expect(s.motherlodePea).toBeNull();
    expect(s.deployedWei).toBe("62500000000000");
    expect(s.vaultedWei).toBe("5940000000000");
    expect(s.winningsWei).toBe("53460000000000");
    expect(s.settledAt).toBe(Date.parse("2026-07-14T18:10:38.000Z"));
  });

  it("maps a solo win with a peapot hit", () => {
    const s = toRoundSummaryWire(ROUND_7);
    expect(s.winner).toBe("0x3fe1000000000000000000000000000000002bf5");
    expect(s.motherlodePea).toBe("1500000000000000000");
    expect(s.winnerCount).toBe(3);
  });
});

describe("toDeployEventWire", () => {
  it("maps a deploy with decoded blocks and parsed timestamp", () => {
    const e = toDeployEventWire(DEPLOY_A, 10, 42);
    expect(e).toEqual({
      id: 42,
      roundId: 10,
      miner: DEPLOY_A.user,
      tiles: [0, 1, 2],
      amountWei: "7500000000000",
      at: Date.parse("2026-07-14T17:53:46.000Z"),
    });
  });

  it("derives amountWei when totalAmount is absent (live SSE payload gap)", () => {
    const sseShape = { ...DEPLOY_A };
    delete sseShape.totalAmount;
    const e = toDeployEventWire(sseShape, 16, 1);
    expect(e.amountWei).toBe("7500000000000"); // amountPerBlock × 3 blocks
  });
});

describe("toNewRoundWire / withSettlement", () => {
  it("builds a fresh zeroed round from a transition's newRound", () => {
    const r = toNewRoundWire(transitionEvent().newRound);
    expect(r.roundId).toBe(11);
    expect(r.phase).toBe("active");
    expect(r.endsAt).toBe(1_784_222_464_000);
    expect(r.totalDeployedWei).toBe("0");
    expect(r.tiles.every((t) => t.deployedWei === "0")).toBe(true);
  });

  it("applies settlement to the current round and re-anchors endsAt", () => {
    const cur = toRoundWire(CURRENT_ROUND, T_ACTIVE);
    const settled = transitionEvent().settled!;
    const revealed = withSettlement(cur, settled, 999_000);
    expect(revealed.phase).toBe("settling");
    expect(revealed.winningTile).toBe(14);
    expect(revealed.winner).toBe(settled.topMiner);
    expect(revealed.endsAt).toBe(999_000); // reveal anchor, not the old endTime
    expect(revealed.tiles).toBe(cur.tiles); // grid untouched for the animation
  });
});

describe("hex-amount normalization (rpc-poller fallback dialect)", () => {
  it("normalizes hex wei strings and never fabricates a peapot hit from hex zero", () => {
    const s = toRoundSummaryWire({
      ...ROUND_5,
      peapotAmount: "0x00",
      totalDeployed: "0x38d7ea4c68000",
    });
    expect(s.motherlodePea).toBeNull(); // "0x00" is still zero — no hit
    expect(s.deployedWei).toBe("1000000000000000");

    const r = toNewRoundWire({
      roundId: "14",
      startTime: 1_784_222_404,
      endTime: 1_784_222_464,
      peapotPool: "0x14d1120d7b160000",
    });
    expect(r.motherlodePea).toBe("1500000000000000000");
  });
});

describe("toPeaUsd / toTiles", () => {
  it("peaUsd: null pea → 0; string prices parse; garbage → 0", () => {
    expect(toPeaUsd(PRICE_NULL)).toBe(0);
    expect(toPeaUsd(PRICE_LIVE)).toBe(12.4);
    expect(toPeaUsd({ pea: { priceUsd: "not-a-number" } })).toBe(0);
    expect(toPeaUsd({ pea: { priceUsd: -1 } })).toBe(0);
  });

  it("toTiles is dense and defensive against sparse/out-of-range blocks", () => {
    const tiles = toTiles([
      { id: 3, deployed: "7", minerCount: 2 },
      { id: 99, deployed: "9", minerCount: 1 },
    ]);
    expect(tiles).toHaveLength(25);
    expect(tiles[3]).toEqual({ id: 3, deployedWei: "7", minerCount: 2 });
    expect(tiles[0].deployedWei).toBe("0");
  });
});
