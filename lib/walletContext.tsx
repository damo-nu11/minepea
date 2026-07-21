"use client";

/**
 * Shared wallet context + hooks (Phase 9 seam). TWO providers implement it:
 * - lib/wallet.tsx        — the local stub (default; no env needed)
 * - lib/walletPrivy.tsx   — real Privy (active when NEXT_PUBLIC_PRIVY_APP_ID is set)
 * Components only ever import useWallet/useBalances, so swapping providers
 * changes zero component code.
 */

import { createContext, useContext } from "react";
import type { EIP1193Provider } from "viem";
import type { BalancesVM, HookResult, WalletApi } from "@/lib/types";

/** Discord account linking (Privy-native — no custom backend). Undefined
 * under the stub provider; live once the Privy dashboard enables Discord. */
export interface DiscordLink {
  /** Linked Discord username, or null when not linked yet. */
  username: string | null;
  /** Opens Privy's Discord OAuth link flow. */
  link(): void;
  /** Unlinks the Discord account from the Privy user. */
  unlink(): Promise<void>;
  /** Last link attempt's user-facing error (audit: silent failures). */
  error: string | null;
}

export interface WalletContextValue extends WalletApi {
  balances: HookResult<BalancesVM>;
  discord?: DiscordLink;
  /**
   * EIP-1193 provider for the connected wallet — the tx-signing seam
   * (lib/tx/). Undefined under the stub provider: no real signer exists,
   * and tx hooks fall back to the mock engine's simulated actions.
   */
  getEthereumProvider?: () => Promise<EIP1193Provider>;
  /** Privy access token (authenticated API routes); absent under the stub. */
  getAccessToken?: () => Promise<string | null>;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletApi {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside a wallet provider");
  const { status, address, connect, disconnect, refreshBalances } = ctx;
  return { status, address, connect, disconnect, refreshBalances };
}

/** Separate async balances hook (never a sync field on the wallet). */
export function useBalances(): HookResult<BalancesVM> {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error("useBalances must be used inside a wallet provider");
  return ctx.balances;
}

/** Discord linking seam — undefined when the provider can't link (stub). */
/** Privy access token for authenticated API routes — undefined under the
 * stub (no identity to prove), so callers stay local-only in mock mode. */
export function useAccessToken():
  | (() => Promise<string | null>)
  | undefined {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error("useAccessToken must be used inside a wallet provider");
  return ctx.getAccessToken;
}

export function useDiscord(): DiscordLink | undefined {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error("useDiscord must be used inside a wallet provider");
  return ctx.discord;
}

/** Tx-signing seam — undefined when the provider can't sign (stub). */
export function useEthereumProvider():
  | (() => Promise<EIP1193Provider>)
  | undefined {
  const ctx = useContext(WalletContext);
  if (!ctx)
    throw new Error(
      "useEthereumProvider must be used inside a wallet provider",
    );
  return ctx.getEthereumProvider;
}
