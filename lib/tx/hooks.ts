"use client";

/**
 * On-chain action hooks (integration build 2026-07-16). All writes are real
 * wallet transactions on Robinhood Chain — there are no REST writes.
 *
 * Routing rule: in mock mode (no NEXT_PUBLIC_API_URL) the engine's simulated
 * actions run instead, so the zero-credential build and every existing test
 * behave exactly as before. In API mode the mock engine is absent
 * (useEngineActions() === null) and the wallet's EIP-1193 provider signs.
 *
 * Success feedback deliberately arrives via SSE (the backend indexes the
 * chain within ~1s and pushes `deployed`/`claimed*`/`stake*` events, which
 * UserDataProvider turns into toasts) — the tx layer only toasts FAILURES,
 * plus successes for actions with no SSE echo (approve, AutoMiner setConfig).
 */

import { report } from "@/lib/report";
import { TxPendingError, TxRevertedError } from "@/lib/tx/writeTx";
import { useCallback, useEffect, useState } from "react";
import { erc20Abi } from "viem";
import { useToast } from "@/components/Toast";
import { autoMinerAbi } from "@/lib/abi/autoMiner";
import { CLAIM_PEA_FN, gridMiningAbi } from "@/lib/abi/gridMining";
import { stakingAbi } from "@/lib/abi/staking";
import { CONTRACTS } from "@/lib/contracts";
import { IS_API_MODE, useEngineActions } from "@/lib/engineContext";
import type { Address, DeployParams } from "@/lib/types";
import {
  useAutomine,
  useRewards,
  useUserDataRefresh,
} from "@/lib/user/userData";
import { useEthereumProvider, useWallet } from "@/lib/walletContext";
import { depositFor, type AutoMinerDeposit } from "./autoMinerMath";
import { getPublicClient } from "./clients";
import { txErrorMessage, writeTx } from "./writeTx";

/** AutoMiner Select strategy — user-chosen blocks via mask (1–25 bits). */
const SELECT_STRATEGY_ID = 2;

// ─── AutoMiner executor fees (globals; change only by admin — session cache) ─

let feesCache: { feeBps: bigint; flatFee: bigint } | null = null;

export async function getAutoMinerFees(): Promise<{
  feeBps: bigint;
  flatFee: bigint;
}> {
  if (feesCache) return feesCache;
  const pub = getPublicClient();
  const [feeBps, flatFee] = await Promise.all([
    pub.readContract({
      address: CONTRACTS.autoMiner,
      abi: autoMinerAbi,
      functionName: "executorFeeBps",
    }),
    pub.readContract({
      address: CONTRACTS.autoMiner,
      abi: autoMinerAbi,
      functionName: "executorFlatFee",
    }),
  ]);
  feesCache = { feeBps, flatFee };
  return feesCache;
}

// ─── Generic pending-state wrapper ───────────────────────────────────────────

export interface TxAction<A extends readonly unknown[] = []> {
  run: (...args: A) => Promise<void>;
  pending: boolean;
}

function useTxAction<A extends readonly unknown[]>(
  fn: (...args: A) => Promise<unknown>,
  label: string,
): TxAction<A> {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      try {
        await fn(...args);
      } catch (err) {
        toast.push({
          title: `${label} failed`,
          body: txErrorMessage(err),
          variant: "error",
        });
        throw err;
      } finally {
        setPending(false);
      }
    },
    [fn, label, toast],
  );
  return { run, pending };
}

// ─── Deploy (Mine page CTA) ──────────────────────────────────────────────────

/** Which path a deploy actually took. Arming the AutoMiner stakes
 * NOTHING in the current round — the executor deploys on later ones — so
 * the board must not lock or light tiles for the round in view. */
export type DeployOutcome = "direct" | "armed";

export interface DeployAction {
  deploy(params: DeployParams): Promise<DeployOutcome>;
  /** false when neither the mock engine nor a signing wallet is available. */
  available: boolean;
}

export function useDeployAction(): DeployAction {
  const engine = useEngineActions();
  const getProvider = useEthereumProvider();
  const automine = useAutomine();
  const refresh = useUserDataRefresh();
  const toast = useToast();

  const automineActive = automine.data?.active ?? false;

  const deploy = useCallback(
    async (params: DeployParams): Promise<DeployOutcome> => {
      // Mock/simulation path — byte-identical to the pre-integration shell.
      if (engine) {
        await engine.deploy(params);
        return params.rounds > 1 ? "armed" : "direct";
      }
      if (!getProvider) throw new Error("No signing wallet available");
      try {
        const amountPerTile = BigInt(params.amountPerTileWei);
        if (params.rounds <= 1) {
          await writeTx(getProvider, {
            account: params.miner,
            address: CONTRACTS.gridMining,
            abi: gridMiningAbi,
            functionName: "deploy",
            args: [params.tiles],
            value: amountPerTile * BigInt(params.tiles.length),
          });
          // Grid lock + feed item arrive via the `deployed` SSE self-match.
          return "direct";
        } else {
          // Multi-round = AutoMiner: ONE payable setConfig call carrying the
          // whole prepaid deposit (contract derives amountPerBlock from it).
          if (automineActive)
            throw new Error("AutoMiner is already active. Stop it first.");
          const { feeBps, flatFee } = await getAutoMinerFees();
          const quote = depositFor(
            amountPerTile,
            params.tiles.length,
            params.rounds,
            feeBps,
            flatFee,
          );
          const blockMask = params.tiles.reduce((m, t) => m | (1 << t), 0);
          await writeTx(getProvider, {
            account: params.miner,
            address: CONTRACTS.autoMiner,
            abi: autoMinerAbi,
            functionName: "setConfig",
            args: [
              SELECT_STRATEGY_ID,
              BigInt(params.rounds),
              params.tiles.length,
              blockMask,
            ],
            value: quote.deposit,
          });
          // No SSE echo for setConfig — toast locally.
          toast.push({
            title: "AutoMiner armed",
            body: `${params.rounds} rounds prepaid. Deploys run automatically.`,
            variant: "success",
          });
          refresh?.("automine");
          return "armed";
        }
      } catch (err) {
        report("tx.deploy", err);
        // A timeout is NOT a failure: the transaction may still confirm.
        // Telling the user it failed invites a retry that spends gas twice.
        if (err instanceof TxPendingError) {
          toast.push({
            title: "Still confirming",
            body: "The network has not confirmed this yet. Do not send it again; check your wallet before retrying.",
            variant: "info",
            txHash: err.hash,
          });
        } else {
          toast.push({
            title: "Deploy failed",
            body: txErrorMessage(err),
            variant: "error",
            txHash: err instanceof TxRevertedError ? err.hash : undefined,
          });
        }
        throw err;
      }
    },
    [engine, getProvider, automineActive, refresh, toast],
  );

  return { deploy, available: engine !== null || getProvider !== undefined };
}

/** Deposit/fee quote for the Mine CTA's disclosure rows (rounds > 1). */
export function useAutoMinerQuote(
  amountPerTileWei: string,
  tileCount: number,
  rounds: number,
): AutoMinerDeposit | null {
  // Keyed result: a quote only counts while it matches the CURRENT inputs,
  // so stale/invalid states derive to null without any sync setState.
  const key = `${amountPerTileWei}:${tileCount}:${rounds}`;
  const [state, setState] = useState<{
    key: string;
    quote: AutoMinerDeposit;
  } | null>(null);

  let amount = 0n;
  try {
    amount = BigInt(amountPerTileWei);
  } catch (err) {
    report("tx", err);
    // Mid-edit input — quote derives to null below.
  }
  const wanted = IS_API_MODE && rounds > 1 && tileCount > 0 && amount > 0n;

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    getAutoMinerFees()
      .then(({ feeBps, flatFee }) => {
        if (!cancelled)
          setState({
            key,
            quote: depositFor(
              BigInt(amountPerTileWei),
              tileCount,
              rounds,
              feeBps,
              flatFee,
            ),
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wanted, key, amountPerTileWei, tileCount, rounds]);

  return wanted && state && state.key === key ? state.quote : null;
}

/** Stop the active AutoMiner config and refund the unused deposit. */
export function useAutoMinerStop(): TxAction {
  const { address } = useWallet();
  const getProvider = useEthereumProvider();
  const refresh = useUserDataRefresh();
  return useTxAction(
    useCallback(async () => {
      if (!address || !getProvider) throw new Error("Connect a wallet first");
      await writeTx(getProvider, {
        account: address,
        address: CONTRACTS.autoMiner,
        abi: autoMinerAbi,
        functionName: "stop",
      });
      refresh?.("automine"); // `stopped` SSE also lands with the refund toast
    }, [address, getProvider, refresh]),
    "AutoMiner stop",
  );
}

// ─── Reward claims (ProfilePanel) ────────────────────────────────────────────

export function useClaimTxs(): {
  claimEth: TxAction;
  claimPea: TxAction;
} {
  const { address } = useWallet();
  const getProvider = useEthereumProvider();
  const refresh = useUserDataRefresh();
  const rewards = useRewards();
  const uncheckpointed = rewards.data?.uncheckpointedRound ?? null;

  const gridTx = useCallback(
    async (functionName: string, args: readonly unknown[] = []) => {
      if (!address || !getProvider) throw new Error("Connect a wallet first");
      await writeTx(getProvider, {
        account: address,
        address: CONTRACTS.gridMining,
        abi: gridMiningAbi,
        functionName,
        args,
      });
    },
    [address, getProvider],
  );

  // Rewards for a won round are claimable only after checkpoint(roundId) —
  // run it first automatically (two sequential txs) when one is pending.
  const claimWith = useCallback(
    async (claimFn: string) => {
      if (uncheckpointed !== null)
        await gridTx("checkpoint", [BigInt(uncheckpointed)]);
      await gridTx(claimFn);
      refresh?.("rewards"); // `claimed*` SSE also toasts the confirmation
    },
    [gridTx, uncheckpointed, refresh],
  );

  const claimEth = useTxAction(
    useCallback(() => claimWith("claimETH"), [claimWith]),
    "ETH claim",
  );
  const claimPea = useTxAction(
    useCallback(() => claimWith(CLAIM_PEA_FN), [claimWith]),
    "PEA claim",
  );
  return { claimEth, claimPea };
}

// ─── Staking (Stake page) ────────────────────────────────────────────────────

export function useStakingTxs(): {
  approve: TxAction<[bigint]>;
  deposit: TxAction<[bigint]>;
  withdraw: TxAction<[bigint]>;
  claimYield: TxAction;
  /** Restake pending yield in one tx (`yieldCompounded` SSE echoes it). */
  compound: TxAction;
  /** Current PEA allowance for the staking contract. */
  readAllowance: () => Promise<bigint>;
} {
  const { address } = useWallet();
  const getProvider = useEthereumProvider();
  const refresh = useUserDataRefresh();
  const toast = useToast();

  const requireWallet = useCallback(() => {
    if (!address || !getProvider) throw new Error("Connect a wallet first");
    return { address, getProvider };
  }, [address, getProvider]);

  const approve = useTxAction(
    useCallback(
      async (amountWei: bigint) => {
        const w = requireWallet();
        await writeTx(w.getProvider, {
          account: w.address,
          address: CONTRACTS.peaToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.staking, amountWei],
        });
        // No SSE echo for approvals — toast locally.
        toast.push({ title: "PEA approved", variant: "success" });
      },
      [requireWallet, toast],
    ),
    "Approval",
  );

  const deposit = useTxAction(
    useCallback(
      async (amountWei: bigint) => {
        const w = requireWallet();
        await writeTx(w.getProvider, {
          account: w.address,
          address: CONTRACTS.staking,
          abi: stakingAbi,
          functionName: "deposit",
          args: [amountWei],
          // deposit() is payable, but msg.value funds the compound-fee
          // reserve, NOT the stake — always 0 here.
          value: 0n,
        });
        refresh?.("staking"); // `stakeDeposited` SSE toasts + applies balance
      },
      [requireWallet, refresh],
    ),
    "Deposit",
  );

  const withdraw = useTxAction(
    useCallback(
      async (amountWei: bigint) => {
        const w = requireWallet();
        await writeTx(w.getProvider, {
          account: w.address,
          address: CONTRACTS.staking,
          abi: stakingAbi,
          functionName: "withdraw",
          args: [amountWei],
        });
        refresh?.("staking");
      },
      [requireWallet, refresh],
    ),
    "Withdrawal",
  );

  const claimYield = useTxAction(
    useCallback(async () => {
      const w = requireWallet();
      await writeTx(w.getProvider, {
        account: w.address,
        address: CONTRACTS.staking,
        abi: stakingAbi,
        functionName: "claimYield",
      });
      refresh?.("staking");
    }, [requireWallet, refresh]),
    "Yield claim",
  );

  const compound = useTxAction(
    useCallback(async () => {
      const w = requireWallet();
      await writeTx(w.getProvider, {
        account: w.address,
        address: CONTRACTS.staking,
        abi: stakingAbi,
        functionName: "compound",
      });
      refresh?.("staking");
    }, [requireWallet, refresh]),
    "Compound",
  );

  const readAllowance = useCallback(async (): Promise<bigint> => {
    if (!address) return 0n;
    return getPublicClient().readContract({
      address: CONTRACTS.peaToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address as Address, CONTRACTS.staking],
    });
  }, [address]);

  return { approve, deposit, withdraw, claimYield, compound, readAllowance };
}
