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
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com/";

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
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

/** Explorer link for a transaction hash. The app showed hashes as dead
 * text before this existed — a user could see the hash but had nowhere to
 * take it. */
export function txUrl(hash: string): string {
  return `${CHAIN.blockExplorers.default.url}/tx/${hash}`;
}

/** Explorer link for an address. */
export function addressUrl(address: string): string {
  return `${CHAIN.blockExplorers.default.url}/address/${address}`;
}

/** The deployed contracts */
export const CONTRACTS = {
  /** PEA ERC-20 token (balance reads, approvals). */
  peaToken: "0xfe177128Df8d336cAf99F787b72183D1E68Ff9c2",
  /** Grid mining game — deploy() / claims / checkpoint. */
  gridMining: "0x46D5459F439E64B8CC2D02e89b137608eA5711CE",
  /** Protocol treasury (fee vault + buybacks). */
  treasury: "0x78Df583557baa1b9C8b8839BeCAAe2eD665Bd7e6",
  /** AutoMiner — multi-round auto-deploy config + deposit. */
  autoMiner: "0x88d3Eb3b38dFb9A62b435809144c771e9cAb64a1",
  /** PEA staking pool. */
  staking: "0x98842D64E73A7196c90606Dea66B666D088cC4fB",
} as const satisfies Record<string, Address>;
