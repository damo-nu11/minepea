/**
 * Single source of truth for the chain and contract addresses (user request
 * 2026-07-16). Everything that needs an address imports it from here — no
 * address literals or per-address env vars anywhere else in the codebase.
 *
 * When contracts are redeployed, edit CONTRACTS below. Keep backend/.env in
 * sync (and its quicknode-stream-filter ADDRESSES block, per the backend docs).
 */

import { defineChain } from "viem";
import type { Address } from "@/lib/types";

/**
 * Browser-safe RPC. NEXT_PUBLIC_RPC_URL overrides (e.g. a dedicated keyed
 * endpoint); unset/empty falls back to the public one.
 */
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://rpc.mainnet.chain.robinhood.com/";

/**
 * Robinhood Chain (Arbitrum Orbit L2) as a viem Chain — the ONE definition
 * handed to Privy `supportedChains`, `wallet_addEthereumChain` for injected
 * wallets, and viem clients.
 */
export const CHAIN = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

/** The deployed contracts */
export const CONTRACTS = {
  /** PEA ERC-20 token (balance reads, approvals). */
  peaToken: "0xe158E2E7b750fA971b12Fb2bF2A7262f94010aC8",
  /** Grid mining game — deploy() / claims / checkpoint. */
  gridMining: "0xC2fe80baB61020a6B46F35eC304Ce8479c1f0f2B",
  /** Protocol treasury (fee vault + buybacks). */
  treasury: "0x62251E73d86c57Fc01c6D547841A0E625c418295",
  /** AutoMiner — multi-round auto-deploy config + deposit. */
  autoMiner: "0x52319c4b87966bAA4679E8885D24eDe74fC92f0C",
  /** PEA staking pool. */
  staking: "0x91a662EF4576EA85a8C850Cf797029993f0aE62c",
} as const satisfies Record<string, Address>;
