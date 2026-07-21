/**
 * AutoMiner — minimal hand-curated ABI (viem `as const`), extracted from
 * backend/reference/abis/AutoMiner.json (test deployment 2026-07-16).
 * setConfig is ONE payable call: msg.value is the whole prepaid deposit,
 * from which the contract derives amountPerBlock (see lib/tx/autoMinerMath).
 */

export const autoMinerAbi = [
  {
    inputs: [
      { internalType: "uint8", name: "strategyId", type: "uint8" },
      { internalType: "uint256", name: "numRounds", type: "uint256" },
      { internalType: "uint8", name: "numBlocks", type: "uint8" },
      { internalType: "uint32", name: "blockMask", type: "uint32" },
    ],
    name: "setConfig",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "stop",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getUserState",
    outputs: [
      {
        components: [
          { internalType: "uint8", name: "strategyId", type: "uint8" },
          { internalType: "uint8", name: "numBlocks", type: "uint8" },
          { internalType: "bool", name: "active", type: "bool" },
          { internalType: "uint16", name: "executorFeeBps", type: "uint16" },
          { internalType: "uint32", name: "selectedBlockMask", type: "uint32" },
          { internalType: "uint128", name: "amountPerBlock", type: "uint128" },
          { internalType: "uint64", name: "numRounds", type: "uint64" },
          { internalType: "uint64", name: "roundsExecuted", type: "uint64" },
          { internalType: "uint128", name: "depositAmount", type: "uint128" },
          { internalType: "uint32", name: "depositTimestamp", type: "uint32" },
          { internalType: "uint96", name: "executorFlatFee", type: "uint96" },
        ],
        internalType: "struct AutoMiner.AutoConfig",
        name: "config",
        type: "tuple",
      },
      { internalType: "uint64", name: "lastRound", type: "uint64" },
      { internalType: "uint256", name: "costPerRound", type: "uint256" },
      { internalType: "uint256", name: "roundsRemaining", type: "uint256" },
      { internalType: "uint256", name: "totalRefundable", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "executorFeeBps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "executorFlatFee",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minDeploy",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "ConfigAlreadyActive", type: "error" },
  { inputs: [], name: "ConfigNotActive", type: "error" },
  { inputs: [], name: "DuplicateBlock", type: "error" },
  { inputs: [], name: "GameNotStarted", type: "error" },
  { inputs: [], name: "InsufficientDeposit", type: "error" },
  { inputs: [], name: "InvalidBlockCount", type: "error" },
  { inputs: [], name: "InvalidBlockMask", type: "error" },
  { inputs: [], name: "InvalidDeposit", type: "error" },
  { inputs: [], name: "InvalidNumBlocks", type: "error" },
  { inputs: [], name: "InvalidNumRounds", type: "error" },
  { inputs: [], name: "InvalidStrategy", type: "error" },
] as const;
