/**
 * The deterministic empty-world snapshot shared by every game store
 * (mock engine + API client): SSR and the hydration render read this, so it
 * must never contain clock/random-derived values (Convention 7).
 */

import type { EngineSnapshot, TileWire } from "@/lib/types";

export const EMPTY_TILES: TileWire[] = Array.from({ length: 25 }, (_, id) => ({
  id,
  deployedWei: "0",
  minerCount: 0,
}));

export const SERVER_SNAPSHOT: EngineSnapshot = {
  bootstrapped: false,
  round: {
    roundId: 0,
    startedAt: 0,
    endsAt: 0,
    phase: "active",
    tiles: EMPTY_TILES,
    totalDeployedWei: "0",
    motherlodePea: "0",
    winningTile: null,
    winner: null,
    isSplit: false,
  },
  feed: [],
  history: [],
  prices: { peaUsd: 0, ethUsd: 0 },
  protocolStats: {
    maxSupplyPea: "0",
    circulatingPea: "0",
    buried7dPea: "0",
    protocolRev7dWei: "0",
  },
  user: { deployedRound: null, deployedTiles: [], autoRemaining: 0 },
};
