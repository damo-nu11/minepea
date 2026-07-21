/**
 * Pure wire → view-model mappers (Convention 2). The only place formatted
 * twins are produced; components consume the VMs and never do display math.
 */

import {
  fmtInt,
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
    totalDeployedFormatted: fmtTokenSmart(totalEth, 1),
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

export function toPricesVM(wire: PricesWire): PricesVM {
  return {
    peaUsd: wire.peaUsd,
    peaUsdFormatted: fmtUsd(wire.peaUsd),
    ethUsd: wire.ethUsd,
    ethUsdFormatted: fmtUsd(wire.ethUsd),
  };
}
