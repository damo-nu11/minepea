/**
 * Test fixtures for the live-backend protocol — shapes captured from real
 * responses in backend/API.md (2026-07-16). Imported ONLY by tests; keep in
 * sync with the doc when the backend contract changes.
 */

import type {
  BackendBlock,
  BackendDeploy,
  BackendRound,
  CurrentRoundResponse,
  DeployedEventPayload,
  PriceResponse,
  RoundDeploysResponse,
  RoundsResponse,
  RoundTransitionPayload,
} from "./translate";

export function emptyBlocks(): BackendBlock[] {
  return Array.from({ length: 25 }, (_, id) => ({
    id,
    deployed: "0",
    minerCount: 0,
  }));
}

/** Blocks with the given per-block wei amounts set (rest zero). */
export function blocksWith(
  entries: Record<number, { deployed: string; minerCount: number }>,
): BackendBlock[] {
  return emptyBlocks().map((b) =>
    entries[b.id] ? { id: b.id, ...entries[b.id] } : b,
  );
}

export const CURRENT_ROUND: CurrentRoundResponse = {
  roundId: "10",
  startTime: 1_784_222_283,
  endTime: 1_784_222_343,
  totalDeployed: "62500000000000",
  peapotPool: "900000000000000000",
  settled: false,
  blocks: blocksWith({
    0: { deployed: "2500000000000", minerCount: 1 },
    1: { deployed: "2500000000000", minerCount: 1 },
    2: { deployed: "2500000000000", minerCount: 1 },
  }),
  userDeployed: "0",
};

export const DEPLOY_A: BackendDeploy = {
  user: "0x3fe1000000000000000000000000000000002bf5",
  blocks: [0, 1, 2],
  blockMask: "7",
  amountPerBlock: "2500000000000",
  totalAmount: "7500000000000",
  isAutoMine: false,
  txHash: "0xad710000000000000000000000000000000000000000000000000000000000a1",
  timestamp: "2026-07-14T17:53:46.000Z",
};

export const DEPLOY_B: BackendDeploy = {
  user: "0xbbbb000000000000000000000000000000009999",
  blocks: [5, 6],
  blockMask: "96",
  amountPerBlock: "5000000000000",
  totalAmount: "10000000000000",
  isAutoMine: true,
  txHash: "0xbb220000000000000000000000000000000000000000000000000000000000b2",
  timestamp: "2026-07-14T17:53:50.000Z",
};

export function deploysResponse(
  roundId: number,
  deploys: BackendDeploy[],
): RoundDeploysResponse {
  return { roundId, count: deploys.length, deploys };
}

export const ROUND_5: BackendRound = {
  roundId: 5,
  settled: true,
  settledAt: "2026-07-14T18:10:38.000Z",
  winningBlock: 17,
  isSplit: true,
  topMiner: "0x0000000000000000000000000000000000000000",
  peaWinner: null,
  peapotAmount: "0",
  totalDeployed: "62500000000000",
  totalWinnings: "53460000000000",
  vaultedAmount: "5940000000000",
  winnerCount: 1,
};

export const ROUND_7: BackendRound = {
  roundId: 7,
  settled: true,
  settledAt: "2026-07-14T19:40:00.000Z",
  winningBlock: 12,
  isSplit: false,
  topMiner: "0x3fe1000000000000000000000000000000002bf5",
  peaWinner: "0x3fe1000000000000000000000000000000002bf5",
  peapotAmount: "1500000000000000000",
  totalDeployed: "100000000000000",
  totalWinnings: "90000000000000",
  vaultedAmount: "10000000000000",
  winnerCount: 3,
};

export function roundsResponse(rounds: BackendRound[]): RoundsResponse {
  return {
    rounds,
    pagination: { page: 1, limit: 60, total: rounds.length, pages: 1 },
  };
}

export const PRICE_NULL: PriceResponse = { pea: null };
export const PRICE_LIVE: PriceResponse = { pea: { priceUsd: "12.40" } };

/** The SSE deploy{} shape: NO `user` field (it lives top-level on the event
 * — this exact mismatch vs the REST shape was the live grid-update bug). */
export const SSE_DEPLOY_A = (() => {
  const { user: _user, ...sseShape } = DEPLOY_A;
  return sseShape;
})();

export function deployedEvent(
  overrides: Partial<DeployedEventPayload> = {},
): DeployedEventPayload {
  return {
    roundId: "10",
    user: DEPLOY_A.user ?? null,
    totalDeployed: "70000000000000",
    userDeployed: "0",
    blocks: blocksWith({
      0: { deployed: "5000000000000", minerCount: 2 },
      1: { deployed: "2500000000000", minerCount: 1 },
      2: { deployed: "2500000000000", minerCount: 1 },
    }),
    // Default mirrors the LIVE payload (no deploy.user).
    deploy: SSE_DEPLOY_A,
    ...overrides,
  };
}

export function transitionEvent(
  overrides: Partial<RoundTransitionPayload> = {},
): RoundTransitionPayload {
  return {
    settled: {
      roundId: "10",
      winningBlock: 14,
      topMiner: "0x3fe1000000000000000000000000000000002bf5",
      totalWinnings: "56250000000000",
      topMinerReward: "1000000000000000000",
      peapotAmount: "0",
      isSplit: false,
    },
    newRound: {
      roundId: "11",
      startTime: 1_784_222_404,
      endTime: 1_784_222_464,
      peapotPool: "1100000000000000000",
    },
    ...overrides,
  };
}
