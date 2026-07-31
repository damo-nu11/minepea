/**
 * Pure wire → view-model mappers (Convention 2). The only place formatted
 * twins are produced; components consume the VMs and never do display math.
 */

import {
  fmtInt,
  fmtPct,
  fmtRoundId,

  fmtTokenSmart,
  fmtUsd,
  fromWei,
  shortAddr,
} from "@/lib/format";
import type {
  DeployEventWire,
  FeedItemVM,
  PricesVM,
  PricesWire,
  ProtocolStatsVM,
  ProtocolStatsWire,
  RoundSummaryVM,
  RoundSummaryWire,
  RoundVM,
  RoundWire,
  TileVM,
  TileWire,
  UserRoundVM,
  UserRoundWire,
  UserTotalsVM,
  UserTotalsWire,
} from "@/lib/types";

export function toTileVM(wire: TileWire): TileVM {
  const eth = fromWei(wire.deployedWei);
  return {
    id: wire.id,
    label: `#${wire.id + 1}`,
    eth,
    ethFormatted: fmtTokenSmart(eth, 3),
    minerCount: wire.minerCount,
  };
}

// Identity caches (audit perf): the engine rebuilds RoundWire only when the
// round changes and appends immutable DeployEventWire objects, so caching the
// VM by wire-object identity means the 4 useRound() consumers share ONE round
// mapping and useMinersFeed re-formats only NEW feed events per tick — instead
// of re-deriving all 25 tiles ×4 and re-mapping the whole ~600-item feed ~3/s.
const roundVmCache = new WeakMap<RoundWire, RoundVM>();
const feedVmCache = new WeakMap<DeployEventWire, FeedItemVM>();

export function toRoundVM(wire: RoundWire): RoundVM {
  const cached = roundVmCache.get(wire);
  if (cached) return cached;
  const totalEth = fromWei(wire.totalDeployedWei);
  const motherlode = fromWei(wire.motherlodePea);
  const vm: RoundVM = {
    roundId: wire.roundId,
    roundIdFormatted: fmtRoundId(wire.roundId),
    startedAt: wire.startedAt,
    endsAt: wire.endsAt,
    phase: wire.phase,
    tiles: wire.tiles.map(toTileVM),
    totalDeployedEth: totalEth,
    totalDeployedFormatted: fmtTokenSmart(totalEth, 2),
    motherlodePea: motherlode,
    motherlodeFormatted: fmtTokenSmart(motherlode, 1),
    winningTile: wire.winningTile,
    winnerDisplay: wire.isSplit
      ? "Split"
      : wire.winner
        ? (wire.winnerName ?? shortAddr(wire.winner))
        : null,
    isSplit: wire.isSplit,
  };
  roundVmCache.set(wire, vm);
  return vm;
}

export function toFeedItemVM(wire: DeployEventWire): FeedItemVM {
  const cached = feedVmCache.get(wire);
  if (cached) return cached;
  const eth = fromWei(wire.amountWei);
  const vm: FeedItemVM = {
    id: wire.id,
    roundId: wire.roundId,
    address: wire.miner,
    display: wire.minerName ?? shortAddr(wire.miner),
    tileCount: wire.tiles.length,
    tiles: [...wire.tiles],
    eth,
    ethFormatted: fmtTokenSmart(eth, 3),
  };
  feedVmCache.set(wire, vm);
  return vm;
}

export function toRoundSummaryVM(wire: RoundSummaryWire): RoundSummaryVM {
  const motherlode =
    wire.motherlodePea === null ? null : fromWei(wire.motherlodePea);
  return {
    roundId: wire.roundId,
    roundIdFormatted: fmtRoundId(wire.roundId),
    winningTile: wire.winningTile,
    tileLabel: `#${wire.winningTile + 1}`,
    tileNumber: `${wire.winningTile + 1}`,
    winnerDisplay: wire.isSplit
      ? "Split"
      : wire.winner
        ? (wire.winnerName ?? shortAddr(wire.winner))
        : "—",
    winner: wire.winner,
    isSplit: wire.isSplit,
    winnerCount: wire.winnerCount,
    deployedEth: fromWei(wire.deployedWei),
    deployedFormatted: fmtTokenSmart(fromWei(wire.deployedWei), 4),
    vaultedFormatted: fmtTokenSmart(fromWei(wire.vaultedWei), 4),
    winningsEth: fromWei(wire.winningsWei),
    winningsFormatted: fmtTokenSmart(fromWei(wire.winningsWei), 4),
    motherlodeFormatted: motherlode === null ? null : fmtTokenSmart(motherlode, 1),
    settledAt: wire.settledAt,
  };
}

export function toProtocolStatsVM(wire: ProtocolStatsWire): ProtocolStatsVM {
  return {
    maxSupplyFormatted: fmtInt(fromWei(wire.maxSupplyPea)),
    circulatingFormatted: fmtInt(fromWei(wire.circulatingPea)),
    buried7dFormatted: fmtInt(fromWei(wire.buried7dPea)),
    protocolRev7dFormatted: fmtInt(fromWei(wire.protocolRev7dWei)),
  };
}

/** Unknown renders as this, never a confident zero (the house law). */
const DASH = "—";

/**
 * Below this, an ETH figure is float residue, not money. Netting values
 * that came from wei leaves dust: a round returning exactly its stake
 * computes -8.7e-18, which is not === 0, so it took the negative branch
 * and rendered a break-even round as "-0" and "-0.00%" in coral. A
 * millionth of a gwei is economically zero and far above any real ULP at
 * these magnitudes.
 */
const ETH_DUST = 1e-12;
function snapDust(v: number): number {
  return Math.abs(v) < ETH_DUST ? 0 : v;
}

/** Signed ETH figure: "+0.0234" / "-0.0100" / "0" for exact zero. */
function signedEth(v: number): string {
  if (v === 0) return "0";
  return `${v < 0 ? "-" : "+"}${fmtTokenSmart(Math.abs(v), 4)}`;
}

/**
 * @param peaPriceEth PEA valued in ETH — the backend's own `peaPriceEth`
 * live, peaUsd/ethUsd in mock. null leaves every PEA-inclusive figure
 * dashed rather than valuing a real emission at zero.
 */
export function toUserRoundVM(
  wire: UserRoundWire,
  peaPriceEth: number | null,
): UserRoundVM {
  const deployedEth = fromWei(wire.deployedWei);
  const wonEth = fromWei(wire.wonEthWei);
  const netEth = snapDust(wonEth - deployedEth);
  const wonPea = fromWei(wire.wonPeaWei) + fromWei(wire.peapotPeaWei);
  // All-or-nothing, the house rule: a round that won no PEA contributes
  // exactly zero whatever the price is, so it stays exact. A round that
  // DID win PEA has an unknown return until the price is known — dashing
  // is right, quietly counting the emission as worthless is not.
  const peaValueEth =
    wonPea === 0 ? 0 : peaPriceEth !== null && peaPriceEth > 0 ? wonPea * peaPriceEth : null;
  const netTotalEth =
    peaValueEth === null ? null : snapDust(netEth + peaValueEth);
  // Return on the round's own stake: a total loss reads -100%, and a
  // round that doubled reads +100%. Null when nothing was deployed, so
  // it dashes instead of dividing by zero.
  const netTotalPct =
    netTotalEth !== null && deployedEth > 0
      ? (netTotalEth / deployedEth) * 100
      : null;
  return {
    ...wire,
    deployedEth,
    deployedFormatted: fmtTokenSmart(deployedEth, 4),
    wonEth,
    wonEthFormatted: fmtTokenSmart(wonEth, 4),
    netEth,
    netEthFormatted: signedEth(netEth),
    wonPea,
    // fmtTokenSmart, not fmtToken: a small miner's share of a split round
    // is routinely under 0.005 PEA, and 2dp rounding printed those real
    // wins as a flat "0" next to a "Won split" label.
    wonPeaFormatted: fmtTokenSmart(wonPea, 2),
    peaValueEth,
    peaValueFormatted:
      peaValueEth === null ? DASH : fmtTokenSmart(peaValueEth, 4),
    netTotalEth,
    netTotalEthFormatted:
      netTotalEth === null ? DASH : signedEth(netTotalEth),
    netTotalPct,
    netTotalPctFormatted:
      netTotalPct === null
        ? DASH
        : `${netTotalPct > 0 ? "+" : ""}${fmtPct(netTotalPct)}`,
    // Tested for "won" EXPLICITLY. A chain ending in the win branch would
    // congratulate the user on any enum value the backend adds later
    // (refunded, void, …) — the exact inverse of the checkpoint bug below.
    resultLabel:
      wire.outcome === "won"
        ? // A win whose on-chain checkpoint has not landed reports zeroed
          // rewards. It is still a win and must say so — rendering it as a
          // loss is the bug this project already shipped once on the
          // rewards side (the backend's own docs repeat the warning).
          wire.rewardPending
          ? "Won, pending"
          : wire.isSplit
            ? "Won split"
            : "Won"
        : wire.outcome === "lost"
          ? "Lost"
          : wire.outcome === "no_winner"
            ? "No winner"
            : "—",
  };
}

/**
 * Fold the COMPLETE round log (newest first) into lifetime totals. Mock
 * only: the slice is complete by construction there. Live mode gets
 * totals from the backend instead — client aggregation over a paginated
 * window is silently wrong (plan §3), which is why this takes the whole
 * array and the hook never calls it on partial data.
 */
export function deriveUserTotals(
  rounds: readonly UserRoundWire[],
  peaPriceEth: number | null,
): UserTotalsWire | null {
  if (rounds.length === 0) return null;
  let deployed = 0n;
  let wonEth = 0n;
  let wonPea = 0n;
  let roundsWon = 0;
  let peapotHits = 0;
  let best: { roundId: number; net: bigint } | null = null;
  let bestStreak = 0;
  let streak = 0;
  // Chronological fold (the wire is newest-first) so streaks read forward.
  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = rounds[i];
    deployed += BigInt(r.deployedWei);
    wonEth += BigInt(r.wonEthWei);
    wonPea += BigInt(r.wonPeaWei) + BigInt(r.peapotPeaWei);
    if (r.outcome === "won") {
      roundsWon += 1;
      streak += 1;
      if (streak > bestStreak) bestStreak = streak;
    } else {
      streak = 0;
    }
    if (r.peapotHit) peapotHits += 1;
    const net = BigInt(r.wonEthWei) - BigInt(r.deployedWei);
    if (best === null || net > best.net) best = { roundId: r.roundId, net };
  }
  return {
    roundsPlayed: rounds.length,
    roundsWon,
    peapotHits,
    totalDeployedWei: deployed.toString(),
    totalWonEthWei: wonEth.toString(),
    totalWonPeaWei: wonPea.toString(),
    peaPriceEth,
    bestRound: best
      ? { roundId: best.roundId, netEthWei: best.net.toString() }
      : null,
    bestWinStreak: bestStreak,
    currentWinStreak: streak,
    firstPlayedAt: rounds[rounds.length - 1].settledAt,
    asOfRoundId: rounds[0].roundId,
  };
}

/**
 * Best round by TOTAL return (PEA counted), folded from the rows.
 *
 * The backend's own bestRound is ETH-only, so a wallet whose best round was
 * carried by its 1-PEA emission gets told its best round LOST money. Only
 * valid over the COMPLETE history — callers pass the full set or nothing.
 */
export function bestRoundFromRows(
  rounds: readonly UserRoundVM[],
): UserTotalsVM["bestRound"] {
  let best: UserRoundVM | null = null;
  for (const r of rounds) {
    // An unpriced round has no comparable return; skip rather than treat
    // its unknown as a zero and let it win or lose the comparison.
    if (r.netTotalEth === null) continue;
    if (best === null || r.netTotalEth > best.netTotalEth!) best = r;
  }
  return best
    ? {
        roundId: best.roundId,
        netEth: best.netTotalEth!,
        netEthFormatted: best.netTotalEthFormatted,
      }
    : null;
}

export function toUserTotalsVM(wire: UserTotalsWire): UserTotalsVM {
  const totalDeployedEth = fromWei(wire.totalDeployedWei);
  const totalWonPea = fromWei(wire.totalWonPeaWei);
  // Lifetime net counts the emission, exactly as the per-round figures do
  // (this reproduces the backend's own totalPNL). All-or-nothing on the
  // price for the same reason.
  const peaValueEth =
    totalWonPea === 0
      ? 0
      : wire.peaPriceEth !== null && wire.peaPriceEth > 0
        ? totalWonPea * wire.peaPriceEth
        : null;
  const netEth =
    peaValueEth === null
      ? null
      : snapDust(fromWei(wire.totalWonEthWei) + peaValueEth - totalDeployedEth);
  const winRatePct =
    wire.roundsPlayed > 0 ? (wire.roundsWon / wire.roundsPlayed) * 100 : 0;
  return {
    roundsPlayed: wire.roundsPlayed,
    roundsWon: wire.roundsWon,
    peapotHits: wire.peapotHits,
    peapotHitsFormatted:
      wire.peapotHits === null ? DASH : fmtInt(wire.peapotHits),
    winRatePct,
    winRateFormatted: fmtPct(winRatePct),
    totalDeployedEth,
    totalDeployedFormatted: fmtTokenSmart(totalDeployedEth, 4),
    netEth,
    netEthFormatted: netEth === null ? DASH : signedEth(netEth),
    totalWonPea,
    totalWonPeaFormatted: fmtTokenSmart(totalWonPea, 2),
    bestRound: wire.bestRound
      ? {
          roundId: wire.bestRound.roundId,
          netEth: fromWei(wire.bestRound.netEthWei),
          netEthFormatted: signedEth(fromWei(wire.bestRound.netEthWei)),
        }
      : null,
    bestWinStreak: wire.bestWinStreak,
    currentWinStreak: wire.currentWinStreak,
    firstPlayedAt: wire.firstPlayedAt,
    asOfRoundId: wire.asOfRoundId,
  };
}

export function toPricesVM(wire: PricesWire): PricesVM {
  return {
    peaUsd: wire.peaUsd,
    peaUsdFormatted: fmtUsd(wire.peaUsd),
    ethUsd: wire.ethUsd,
    ethUsdFormatted: fmtUsd(wire.ethUsd),
  };
}
