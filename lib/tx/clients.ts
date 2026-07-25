/**
 * viem client factories for the tx layer (integration build 2026-07-16).
 * Chain/RPC come from lib/contracts.ts — the single source of truth.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from "viem";
import { CHAIN, chainReadTransport } from "@/lib/contracts";

let publicClient: PublicClient | null = null;

/** Shared read client for view calls, receipts and gas. Fails over across
 * RPC_URLS: simulation and receipt-wait errors here surfaced to users as
 * "HTTP request failed" and receipt timeouts whenever their network could
 * not reach the one official host. */
export function getPublicClient(): PublicClient {
  publicClient ??= createPublicClient({
    chain: CHAIN,
    transport: chainReadTransport(),
  });
  return publicClient;
}

/** Wallet client over the connected wallet's EIP-1193 provider. */
export function walletClientFor(provider: EIP1193Provider): WalletClient {
  return createWalletClient({ chain: CHAIN, transport: custom(provider) });
}

/**
 * Make sure the wallet is on Robinhood Chain: switch, and if the wallet
 * doesn't know the chain (EIP-3085 error 4902 / unrecognized-chain errors),
 * add it from our chain definition and retry.
 */
export async function ensureChain(walletClient: WalletClient): Promise<void> {
  try {
    const current = await walletClient.getChainId();
    if (current === CHAIN.id) return;
    await walletClient.switchChain({ id: CHAIN.id });
  } catch {
    await walletClient.addChain({ chain: CHAIN });
    await walletClient.switchChain({ id: CHAIN.id });
  }
}
