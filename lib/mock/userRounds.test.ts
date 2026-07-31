/**
 * Profile history math pins (plan reference/profile-plan.md P1): the
 * user-round derivation must mirror settlement exactly — pro-rata ETH by
 * winning-tile stake, the solo/split 1-PEA emission, peapot always
 * splitting pro-rata — and the totals fold must read streaks forward.
 * All money paths mutation-verified (see the plan's audit log).
 */

import { describe, expect, it } from "vitest";
import {
  deriveUserRound,
  ethToWei,
} from "@/lib/mock/engine";
import {
  bestRoundFromRows,
  deriveUserTotals,
  toUserRoundVM,
  toUserTotalsVM,
} from "@/lib/mappers";
import type {
  Address,
  DeployEventWire,
  RoundSummaryWire,
  UserRoundWire,
} from "@/lib/types";

const USER = "0xAAAA000000000000000000000000000000000001" as Address;
const RIVAL = "0xBBBB000000000000000000000000000000000002" as Address;
/** PEA priced in ETH. 1 PEA = 0.02 ETH keeps the arithmetic checkable by
 * eye; the live backend quotes ~0.0258. */
const PRICE = 0.02;

/** User: 0.3 ETH across tiles 0,1,2 (0.1/tile). Rival: 0.2 on tile 0.
 * Winning tile 0 total = 0.3; round deployed 0.5; winnings 0.45. */
function fixture(): {
  events: DeployEventWire[];
  summary: RoundSummaryWire;
} {
  const events: DeployEventWire[] = [
    {
      id: 1,
      roundId: 42,
      miner: USER,
      tiles: [0, 1, 2],
      amountWei: ethToWei(0.3),
      at: 1_000,
    },
    {
      id: 2,
      roundId: 42,
      miner: RIVAL,
      tiles: [0],
      amountWei: ethToWei(0.2),
      at: 2_000,
    },
  ];
  const summary: RoundSummaryWire = {
    roundId: 42,
    winningTile: 0,
    winner: null,
    isSplit: true,
    winnerCount: 2,
    deployedWei: ethToWei(0.5),
    vaultedWei: ethToWei(0.05),
    winningsWei: ethToWei(0.45),
    motherlodePea: null,
    settledAt: 9_000,
  };
  return { events, summary };
}

describe("deriveUserRound", () => {
  it("split win: ETH pro-rata by winning-tile stake, PEA split the same way", () => {
    const { events, summary } = fixture();
    const row = deriveUserRound(summary, events, USER, "manual")!;
    // User stake on tile 0 = 0.1 of 0.3 → one third of 0.45 ETH winnings.
    expect(row.outcome).toBe("won");
    expect(row.isSplit).toBe(true);
    expect(row.wonEthWei).toBe(ethToWei(0.15));
    // One third of the 1-PEA emission, integer division.
    expect(row.wonPeaWei).toBe("333333333333333333");
    expect(row.peapotPeaWei).toBe("0");
    expect(row.deployedWei).toBe(ethToWei(0.3));
    expect(row.tiles).toEqual([0, 1, 2]);
  });

  it("solo win: the whole 1 PEA to the named winner, none otherwise", () => {
    const { events, summary } = fixture();
    const solo = { ...summary, isSplit: false, winner: USER };
    expect(deriveUserRound(solo, events, USER, "manual")!.wonPeaWei).toBe(
      (10n ** 18n).toString(),
    );
    const rivalWon = { ...summary, isSplit: false, winner: RIVAL };
    const row = deriveUserRound(rivalWon, events, USER, "manual")!;
    expect(row.wonPeaWei).toBe("0");
    // Still pro-rata on the ETH: covering the tile pays regardless of
    // who the emission coin flip names.
    expect(row.wonEthWei).toBe(ethToWei(0.15));
  });

  it("a peapot always splits pro-rata and flags the row", () => {
    const { events, summary } = fixture();
    const pot = { ...summary, motherlodePea: (6n * 10n ** 18n).toString() };
    const row = deriveUserRound(pot, events, USER, "automine")!;
    expect(row.peapotHit).toBe(true);
    // One third of 6 PEA.
    expect(row.peapotPeaWei).toBe((2n * 10n ** 18n).toString());
    expect(row.source).toBe("automine");
  });

  it("a miss is a loss with zeroed rewards; an uncovered draw is no_winner", () => {
    const { events, summary } = fixture();
    const missed = { ...summary, winningTile: 5 as const, winnerCount: 1 };
    const loss = deriveUserRound(missed, events, USER, "manual")!;
    expect(loss.outcome).toBe("lost");
    expect(loss.wonEthWei).toBe("0");
    expect(loss.wonPeaWei).toBe("0");
    expect(loss.isSplit).toBe(false);
    const nobody = { ...summary, winningTile: 7 as const, winnerCount: 0 };
    expect(deriveUserRound(nobody, events, USER, "manual")!.outcome).toBe(
      "no_winner",
    );
  });

  it("returns null when the user did not deploy that round", () => {
    const { events, summary } = fixture();
    expect(
      deriveUserRound(summary, events.slice(1), USER, "manual"),
    ).toBeNull();
  });
});

function round(
  roundId: number,
  outcome: UserRoundWire["outcome"],
  deployedEth: number,
  wonEth: number,
): UserRoundWire {
  return {
    roundId,
    settledAt: roundId * 60_000,
    outcome,
    isSplit: false,
    peapotHit: false,
    winningTile: 0,
    tiles: [0],
    deployedWei: ethToWei(deployedEth),
    wonEthWei: ethToWei(wonEth),
    wonPeaWei: outcome === "won" ? (10n ** 18n).toString() : "0",
    peapotPeaWei: "0",
    source: "manual",
  };
}

describe("deriveUserTotals", () => {
  it("folds chronologically: streaks, best round, sums", () => {
    // Wire is newest-first; chronological = 10 win, 11 win, 12 loss, 13 win.
    const rounds = [
      round(13, "won", 0.1, 0.2),
      round(12, "lost", 0.1, 0),
      round(11, "won", 0.1, 0.5),
      round(10, "won", 0.1, 0.15),
    ];
    const t = deriveUserTotals(rounds, PRICE)!;
    expect(t.roundsPlayed).toBe(4);
    expect(t.roundsWon).toBe(3);
    expect(t.bestWinStreak).toBe(2);
    expect(t.currentWinStreak).toBe(1);
    expect(t.totalDeployedWei).toBe(ethToWei(0.4));
    expect(t.totalWonEthWei).toBe(ethToWei(0.85));
    expect(t.bestRound).toEqual({
      roundId: 11,
      netEthWei: ethToWei(0.4),
    });
    expect(t.firstPlayedAt).toBe(10 * 60_000);
    expect(t.asOfRoundId).toBe(13);
    expect(deriveUserTotals([], PRICE)).toBeNull();
  });
});

describe("user round/totals VMs", () => {
  it("labels results and signs net figures", () => {
    const { events, summary } = fixture();
    const vm = toUserRoundVM(
      deriveUserRound(summary, events, USER, "manual")!,
      PRICE,
    );
    expect(vm.resultLabel).toBe("Won split");
    // The ETH leg alone: 0.15 won − 0.3 deployed = −0.15.
    expect(vm.netEth).toBeCloseTo(-0.15, 9);
    expect(vm.netEthFormatted).toBe("-0.15");
    // Emission share rides into the display PEA figure.
    expect(vm.wonPea).toBeCloseTo(1 / 3, 9);
  });

  it("counts the PEA emission in the round's return, not just the ETH", () => {
    // The shape this fixes: a round that returned LESS ETH than it cost is
    // still profitable once its emission is priced, and used to render as
    // a coral loss. 0.05 won − 0.06 deployed = −0.01 ETH, plus 1 PEA at
    // 0.02 = +0.01 total on a 0.06 stake.
    const r = toUserRoundVM(round(60, "won", 0.06, 0.05), PRICE);
    expect(r.netEth).toBeCloseTo(-0.01, 9); // the ETH leg is still negative
    expect(r.peaValueEth).toBeCloseTo(0.02, 9);
    expect(r.netTotalEth).toBeCloseTo(0.01, 9); // the round is up
    expect(r.netTotalEthFormatted).toBe("+0.01");
    expect(r.netTotalPct).toBeCloseTo(100 / 6, 6);
    expect(r.netTotalPctFormatted).toBe("+16.67%");
  });

  it("net percentage is the return on the round's own stake", () => {
    // Deployed 0.1, won 0.4 ETH + 1 PEA (0.02) → +0.32 on 0.1 = +320%.
    const win = toUserRoundVM(round(50, "won", 0.1, 0.4), PRICE);
    expect(win.netTotalPct).toBeCloseTo(320, 6);
    expect(win.netTotalPctFormatted).toBe("+320.00%");
    // A loss returns nothing at all, so the stake is gone: exactly -100%.
    const loss = toUserRoundVM(round(49, "lost", 0.2, 0), PRICE);
    expect(loss.netTotalPct).toBeCloseTo(-100, 6);
    expect(loss.netTotalPctFormatted).toBe("-100.00%");
  });

  it("dashes an unpriced emission rather than valuing it at zero", () => {
    // No price + PEA won = the return is genuinely unknown. Falling back
    // to the ETH leg would quietly report this winning round as -16.67%.
    const unpriced = toUserRoundVM(round(60, "won", 0.06, 0.05), null);
    expect(unpriced.netTotalEth).toBeNull();
    expect(unpriced.netTotalEthFormatted).toBe("—");
    expect(unpriced.netTotalPctFormatted).toBe("—");
    // A round that won NO PEA needs no price: its return is exact.
    const noPea = toUserRoundVM(round(59, "lost", 0.2, 0), null);
    expect(noPea.peaValueEth).toBe(0);
    expect(noPea.netTotalEth).toBeCloseTo(-0.2, 9);
    expect(noPea.netTotalPctFormatted).toBe("-100.00%");
  });

  it("a zero-stake round dashes rather than dividing by zero", () => {
    const none = toUserRoundVM(round(48, "lost", 0, 0), PRICE);
    expect(none.netTotalPct).toBeNull();
    expect(none.netTotalPctFormatted).toBe("—");
  });

  it("best round is the best TOTAL return, not the best ETH leg", () => {
    // Round 71 returns more ETH; round 70 is worth more once its emission
    // is counted. The backend's own bestRound picks 71 (it is ETH-only).
    const rows = [
      toUserRoundVM(round(71, "lost", 0.1, 0.09), PRICE), // −0.01, no PEA
      toUserRoundVM(round(70, "won", 0.1, 0.095), PRICE), // −0.005 + 0.02
    ];
    expect(bestRoundFromRows(rows)).toEqual({
      roundId: 70,
      netEth: expect.closeTo(0.015, 9),
      netEthFormatted: "+0.015",
    });
    expect(bestRoundFromRows([])).toBeNull();
  });

  it("totals VM: win rate and PEA-inclusive lifetime net", () => {
    const t = toUserTotalsVM(
      deriveUserTotals(
        [round(13, "won", 0.1, 0.2), round(12, "lost", 0.1, 0)],
        PRICE,
      )!,
    );
    expect(t.winRateFormatted).toBe("50.00%");
    // 0.2 ETH won on 0.2 deployed breaks even; the 1 PEA emission is the
    // whole profit, and an ETH-only lifetime net reported it as zero.
    expect(t.netEth).toBeCloseTo(0.02, 9);
    expect(t.netEthFormatted).toBe("+0.02");
  });
});
