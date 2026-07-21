/**
 * Shared tx runner: simulate → sign → wait for receipt. Simulation runs
 * against the public RPC BEFORE the wallet prompt, so contract reverts
 * (wrong phase, already deployed, below minimum…) surface as decoded,
 * user-readable errors without costing a signature or gas.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  type Abi,
  type EIP1193Provider,
  type Hex,
} from "viem";
import type { Address } from "@/lib/types";
import { ensureChain, getPublicClient, walletClientFor } from "./clients";

export interface WriteTxParams {
  account: Address;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export async function writeTx(
  getProvider: () => Promise<EIP1193Provider>,
  params: WriteTxParams,
): Promise<Hex> {
  const provider = await getProvider();
  const wallet = walletClientFor(provider);
  await ensureChain(wallet);
  const pub = getPublicClient();
  const { request } = await pub.simulateContract({
    account: params.account,
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args as unknown[],
    value: params.value,
  });
  const hash = await wallet.writeContract(request);
  // A receipt does NOT mean success: waitForTransactionReceipt resolves for
  // mined-but-REVERTED transactions too. Simulation runs against current
  // state, so a tx submitted near a round boundary can simulate clean and
  // still revert once mined. Without this check the user pays gas, is not
  // in the round, and the UI reports a successful deploy.
  let receipt;
  try {
    receipt = await pub.waitForTransactionReceipt({ hash });
  } catch (err) {
    // Waiting timed out. The transaction is SUBMITTED and may still
    // confirm — reporting that as a failure invites a retry that spends
    // gas twice, which on claims and staking is a real double-spend.
    throw new TxPendingError(hash, err);
  }
  if (receipt.status === "reverted") {
    throw new TxRevertedError(hash);
  }
  return hash;
}

/** Submitted, but not confirmed within the wait window. Distinct from a
 * failure: it may still land, so the user must not resend it. */
export class TxPendingError extends Error {
  readonly hash: Hex;
  constructor(hash: Hex, cause?: unknown) {
    super(
      "The transaction was submitted but has not confirmed yet. It may still land, so do not send it again.",
    );
    this.name = "TxPendingError";
    this.hash = hash;
    this.cause = cause;
  }
}

/** A transaction that mined and then reverted. Carries the hash so the
 * user can quote it, and so nothing downstream mistakes it for success. */
export class TxRevertedError extends Error {
  readonly hash: Hex;
  constructor(hash: Hex) {
    super(
      "The transaction was mined but reverted onchain, so nothing was deployed. Gas was still spent. This usually means the round closed before it landed.",
    );
    this.name = "TxRevertedError";
    this.hash = hash;
  }
}

/** Contract revert names → user-facing copy (PEA terms, never legacy ones). */
const FRIENDLY: Record<string, string> = {
  AlreadyDeployedThisRound: "You already deployed this round.",
  RoundNotActive: "The round is not active.",
  GameNotStarted: "The game has not started yet.",
  InsufficientDeployAmount: "Amount per tile is below the contract minimum.",
  NoBlocksSelected: "Select at least one tile.",
  InvalidBlockId: "Invalid tile selection.",
  NothingToClaim: "Nothing to claim.",
  AlreadyCheckpointed: "That round is already checkpointed.",
  RoundNotSettled: "That round has not settled yet.",
  ConfigAlreadyActive: "AutoMiner is already active. Stop it first.",
  ConfigNotActive: "No active AutoMiner config.",
  InsufficientDeposit: "Deposit does not cover the rounds plus executor fees.",
  InvalidNumRounds: "Invalid number of rounds.",
  InvalidBlockMask: "Invalid tile selection.",
  BelowMinimumStake: "Amount is below the minimum stake.",
  InsufficientBalance: "Insufficient staked balance.",
  InsufficientPendingRewards: "No yield to claim or compound.",
  CompoundCooldownNotMet: "Compound cooldown has not elapsed yet.",
  ZeroAmount: "Enter an amount.",
};

/** Best user-facing message for a failed tx. */
export function txErrorMessage(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.signature;
      if (name && FRIENDLY[name]) return FRIENDLY[name];
      if (name) return `Transaction reverted: ${name}`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Transaction failed";
}
