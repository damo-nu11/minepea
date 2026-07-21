/**
 * GridMining — minimal hand-curated ABI (viem `as const`), extracted from
 * backend/reference/abis/GridMining.json. Only the entries the frontend
 * calls + the revert errors it decodes.
 *
 * The contract's token surface is PEA throughout: the claim fn is `claimPEA()`
 * and getTotalPendingRewards returns unharvested/harvested PEA. The lib/abi/
 * pre-commit exemption stays as a safety net.
 */

/** The PEA-claim function's on-chain name (kept as a constant so callers read
 * intent, not a bare string). */
export const CLAIM_PEA_FN = "claimPEA";

export const gridMiningAbi = [
  {
    inputs: [{ internalType: "uint8[]", name: "blockIds", type: "uint8[]" }],
    name: "deploy",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "claimETH",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    // Claims the caller's mined PEA (net of harvest fee).
    inputs: [],
    name: "claimPEA",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint64", name: "roundId", type: "uint64" }],
    name: "checkpoint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "MIN_DEPLOY",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentRoundId",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getTotalPendingRewards",
    outputs: [
      { internalType: "uint256", name: "pendingETH", type: "uint256" },
      { internalType: "uint256", name: "pendingUnharvestedPEA", type: "uint256" },
      { internalType: "uint256", name: "pendingHarvestedPEA", type: "uint256" },
      { internalType: "uint64", name: "uncheckpointedRound", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "AlreadyCheckpointed", type: "error" },
  { inputs: [], name: "AlreadyDeployedThisRound", type: "error" },
  { inputs: [], name: "GameNotStarted", type: "error" },
  { inputs: [], name: "InsufficientDeployAmount", type: "error" },
  { inputs: [], name: "InvalidBlockId", type: "error" },
  { inputs: [], name: "NoBlocksSelected", type: "error" },
  { inputs: [], name: "NothingToClaim", type: "error" },
  { inputs: [], name: "RoundNotActive", type: "error" },
  { inputs: [], name: "RoundNotSettled", type: "error" },
] as const;
