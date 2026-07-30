/**
 * Live-history dialect pins (plan reference/profile-plan.md P2). The
 * backend's shape is close to ours but not identical, and three of the
 * differences are the kind that ship silent wrongness:
 * - tiles arrive as a decimal bitmask STRING, not an array
 * - a genuine win can carry zeroed rewards until its on-chain checkpoint
 *   lands, which must never render as a loss
 * - the PEA emission and peapot legs are independent, so one can be zero
 *   while the other pays
 */

import { describe, expect, it } from "vitest";
import {
  type BackendHistoryEntry,
  type BackendHistoryTotals,
  tilesFromMask,
  toUserRoundWire,
  toUserTotalsWire,
} from "@/lib/api/translate";
import { toUserRoundVM } from "@/lib/mappers";
import { fetchUserHistory } from "@/lib/hooks/useUserHistory";

function entry(over: Partial<BackendHistoryEntry> = {}): BackendHistoryEntry {
  return {
    roundId: 7,
    user: "0xabc",
    amountPerBlock: "2500000000000",
    blockMask: "7", // tiles 0,1,2
    totalAmount: "7500000000000",
    txHash: "0xtx",
    isAutoMine: false,
    timestamp: "2026-07-14T19:34:29.000Z",
    roundResult: {
      settled: true,
      outcome: "won",
      isSplit: false,
      wonWinningBlock: true,
      peapotHit: false,
      winningBlock: 1,
      settledAt: "2026-07-14T19:35:29.000Z",
      ethWon: "5000000000000",
      peaWon: "1000000000000000000",
      peaWonMining: "1000000000000000000",
      peaWonPeapot: "0",
      pnl: "-0.0000025",
    },
    ...over,
  };
}

describe("tilesFromMask", () => {
  it("decodes the decimal bitmask string to ascending tile ids", () => {
    expect(tilesFromMask("7")).toEqual([0, 1, 2]);
    expect(tilesFromMask("33554431")).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
    expect(tilesFromMask("16384")).toEqual([14]);
    expect(tilesFromMask("0")).toEqual([]);
    // Garbage in must not throw and take the page with it.
    expect(tilesFromMask("not-a-number")).toEqual([]);
  });
});

describe("toUserRoundWire", () => {
  it("translates a settled win, ISO times to epoch ms", () => {
    const w = toUserRoundWire(entry())!;
    expect(w.roundId).toBe(7);
    expect(w.settledAt).toBe(Date.parse("2026-07-14T19:35:29.000Z"));
    expect(w.outcome).toBe("won");
    expect(w.tiles).toEqual([0, 1, 2]);
    expect(w.winningTile).toBe(1);
    expect(w.deployedWei).toBe("7500000000000");
    expect(w.wonEthWei).toBe("5000000000000");
    expect(w.source).toBe("manual");
    expect(w.rewardPending).toBe(false);
  });

  it("a win awaiting its checkpoint is flagged pending, NEVER a loss", () => {
    // The backend's own documented nuance: rewards populate only after the
    // on-chain checkpoint, so a real win arrives zeroed.
    const w = toUserRoundWire(
      entry({
        roundResult: {
          ...entry().roundResult!,
          ethWon: "0",
          peaWon: "0",
          peaWonMining: "0",
          peaWonPeapot: "0",
        },
      }),
    )!;
    expect(w.outcome).toBe("won");
    expect(w.rewardPending).toBe(true);
    expect(toUserRoundVM(w).resultLabel).toBe("Won, pending");
  });

  it("keeps the emission and peapot legs independent", () => {
    // The legs must come from their OWN fields. peaWon is the backend's
    // COMBINED value, so all three differ here on purpose: reading either
    // leg off peaWon would double-count (the dev's explicit warning, and
    // the reason the API splits them back out at all).
    const w = toUserRoundWire(
      entry({
        roundResult: {
          ...entry().roundResult!,
          peapotHit: true,
          peaWonMining: "1000000000000000000", // 1 PEA emission
          peaWonPeapot: "4000000000000000000", // 4 PEA jackpot
          peaWon: "5000000000000000000", // combined
        },
      }),
    )!;
    expect(w.wonPeaWei).toBe("1000000000000000000");
    expect(w.peapotPeaWei).toBe("4000000000000000000");
    expect(w.peapotHit).toBe(true);
    // Display folds them back to 5, and must not reach 9 by double-count.
    expect(toUserRoundVM(w).wonPea).toBeCloseTo(5, 9);
  });

  it("a wallet can win ETH with zero mining PEA (non-split emission)", () => {
    // A non-split round sends the whole 1 PEA to the single drawn winner,
    // so everyone else on the tile takes ETH pro-rata and no emission.
    const w = toUserRoundWire(
      entry({
        roundResult: {
          ...entry().roundResult!,
          isSplit: false,
          peaWonMining: "0",
          peaWonPeapot: "0",
          peaWon: "0",
          ethWon: "5000000000000",
        },
      }),
    )!;
    expect(w.wonEthWei).toBe("5000000000000");
    expect(w.wonPeaWei).toBe("0");
    // Rewards are not all zero, so this is not a pending checkpoint.
    expect(w.rewardPending).toBe(false);
    expect(toUserRoundVM(w).resultLabel).toBe("Won");
  });

  it("drops unsettled rows and marks automine", () => {
    expect(toUserRoundWire(entry({ roundResult: null }))).toBeNull();
    expect(
      toUserRoundWire(
        entry({ roundResult: { ...entry().roundResult!, settled: false } }),
      ),
    ).toBeNull();
    expect(toUserRoundWire(entry({ isAutoMine: true }))!.source).toBe(
      "automine",
    );
  });

  it("carries no_winner through as its own outcome", () => {
    const w = toUserRoundWire(
      entry({
        roundResult: {
          ...entry().roundResult!,
          outcome: "no_winner",
          wonWinningBlock: false,
          ethWon: "0",
          peaWon: "0",
          peaWonMining: "0",
          peaWonPeapot: "0",
        },
      }),
    )!;
    expect(w.outcome).toBe("no_winner");
    expect(w.rewardPending).toBe(false);
    expect(toUserRoundVM(w).resultLabel).toBe("No winner");
  });
});

describe("toUserTotalsWire", () => {
  const totals: BackendHistoryTotals = {
    totalETHWon: "5000000000000",
    totalPEAWon: "1000000000000000000",
    totalETHDeployed: "7500000000000",
    totalPNL: "-0.0000025",
    peaPriceEth: null,
    roundsPlayed: 3,
    roundsWon: 2,
    peapotHits: 0,
    bestWinStreak: 2,
    currentWinStreak: 0,
    bestRound: { roundId: 7, netEthWei: "-62500000000000" },
    firstPlayedAt: "2026-07-14T19:34:29.000Z",
    asOfRoundId: 7541,
  };

  it("maps the server aggregates and keeps bestRound SIGNED", () => {
    const t = toUserTotalsWire(totals);
    expect(t.roundsPlayed).toBe(3);
    expect(t.roundsWon).toBe(2);
    expect(t.bestWinStreak).toBe(2);
    expect(t.asOfRoundId).toBe(7541);
    // A wallet that never profited still reports its least-bad round.
    expect(t.bestRound).toEqual({
      roundId: 7,
      netEthWei: "-62500000000000",
    });
    expect(t.firstPlayedAt).toBe(Date.parse("2026-07-14T19:34:29.000Z"));
  });
});

describe("fetchUserHistory", () => {
  const ok = (body: unknown) =>
    (async () =>
      ({ ok: true, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

  it("lowercases the address and asks for settled rounds only", async () => {
    let seen = "";
    const spy = (async (url: string) => {
      seen = url;
      return {
        ok: true,
        json: async () => ({ history: [], totals: null, pagination: {} }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await fetchUserHistory("0xAbCdEf0000000000000000000000000000000001", spy);
    expect(seen).toContain("0xabcdef0000000000000000000000000000000001");
    expect(seen).toContain("settled=true");
    expect(seen).toContain("type=deploy");
  });

  it("a wallet that never mined is an empty state, not an error", async () => {
    const vm = await fetchUserHistory(
      "0xabc",
      ok({ history: [], totals: null, pagination: {} }),
    );
    expect(vm.rounds).toEqual([]);
    expect(vm.totals).toBeNull();
  });

  it("translates rows and totals together", async () => {
    const vm = await fetchUserHistory(
      "0xabc",
      ok({
        history: [entry(), entry({ roundResult: null })],
        totals: {
          totalETHWon: "5000000000000",
          totalPEAWon: "1000000000000000000",
          totalETHDeployed: "7500000000000",
          totalPNL: "0",
          peaPriceEth: null,
          roundsPlayed: 2,
          roundsWon: 1,
          peapotHits: 0,
          bestWinStreak: 1,
          currentWinStreak: 1,
          bestRound: null,
          firstPlayedAt: null,
          asOfRoundId: 9,
        },
        pagination: {},
      }),
    );
    // The unsettled row drops out; only settled rounds reach the page.
    expect(vm.rounds).toHaveLength(1);
    expect(vm.totals!.roundsPlayed).toBe(2);
    expect(vm.totals!.winRateFormatted).toBe("50.00%");
    expect(vm.totals!.firstPlayedAt).toBe(0);
  });

  it("throws on a non-200 so the hook can keep the last good data", async () => {
    const bad = (async () =>
      ({ ok: false, status: 503 }) as unknown as Response) as unknown as typeof fetch;
    await expect(fetchUserHistory("0xabc", bad)).rejects.toThrow(/503/);
  });
});
