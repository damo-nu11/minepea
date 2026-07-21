/**
 * Staking — minimal hand-curated ABI (viem `as const`), extracted from
 * backend/reference/abis/Staking.json (test deployment 2026-07-16).
 * deposit() pulls PEA via transferFrom (requires a prior peaToken approve);
 * its payable msg.value funds the compound-fee reserve — always send 0.
 */

export const stakingAbi = [
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "claimYield",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    // VERIFIED against hardhat/contracts/Staking.sol (line 237) and the
    // reference ABI (2026-07-18): compound() nonpayable, no args. Self-
    // compound has NO cooldown — the cooldown only gates compoundFor();
    // sole revert is InsufficientPendingRewards (pending == 0), so gating
    // the button on pendingYield > 0 is exactly right.
    inputs: [],
    name: "compound",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getStakeInfo",
    outputs: [
      { internalType: "uint256", name: "balance", type: "uint256" },
      { internalType: "uint256", name: "pendingRewards", type: "uint256" },
      { internalType: "uint256", name: "compoundFeeReserve", type: "uint256" },
      { internalType: "uint64", name: "lastClaimAt", type: "uint64" },
      { internalType: "uint64", name: "lastDepositAt", type: "uint64" },
      { internalType: "uint64", name: "lastWithdrawAt", type: "uint64" },
      { internalType: "bool", name: "canCompound", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getPendingRewards",
    outputs: [{ internalType: "uint256", name: "pending", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minStake",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "BelowMinimumStake", type: "error" },
  { inputs: [], name: "InsufficientBalance", type: "error" },
  { inputs: [], name: "InsufficientPendingRewards", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "ZeroAmount", type: "error" },
] as const;
