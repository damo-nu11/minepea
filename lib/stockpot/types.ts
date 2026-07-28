/**
 * Stockpot wire types and view models (Convention 2).
 *
 * The chain is the database: our API routes assemble these wire shapes from
 * the explorer's transfer log, Chainlink feed reads, and the treasury's
 * balances. A future backend can serve the identical shapes. Wire carries
 * RAW values only; view models add formatted twins via lib/format.ts.
 */

import type { Address } from "@/lib/types";

// ─── Wire (raw values only) ─────────────────────────────────────────────────

/** One treasury buy: stock in from the router, paid from the ETH side.
 * The router settles internally (no paired ERC-20 outflow leg exists in
 * the tx, verified against the recorded sample tx), so the buy is priced
 * at its execution-day close from the pool's USD candles — buys land at
 * the market close, so the day close IS the execution price. */
export interface StockpotPurchaseWire {
  txHash: string;
  atMs: number;
  token: Address;
  /** Stock received, raw 18dp. */
  sharesWei: string;
  /** USD price per share at the buy's execution day, raw 8dp. */
  dayCloseUsd8: string;
}

/** One payout leg: stock leaving the pot to a winner. */
export interface StockpotPayoutWire {
  txHash: string;
  atMs: number;
  token: Address;
  sharesWei: string;
  winner: Address;
  roundId?: number;
}

/** One asset's live pricing from its Chainlink feed. */
export interface StockpotPriceWire {
  token: Address;
  /** Feed answer, raw 8dp USD. */
  priceUsd8: string;
  /** oraclePaused() on the token: corporate action, price untrusted. */
  paused: boolean;
}

export interface StockpotSnapshotWire {
  asOfMs: number;
  prices: StockpotPriceWire[];
}

/** The backend's live pot state (GET /api/stockpot/pending on the game
 * API, dev 2026-07-28): what the pot HOLDS awaiting the next sweep plus
 * the ETH accruing toward the next buy. This is what makes THE POT
 * headline breathe intraday instead of resting at 0 between hits. */
export interface StockpotPendingWire {
  marketOpen: boolean;
  /** Total pending ETH earmarked for stock buys, raw wei. */
  pendingEthWei: string;
  /** Stocks currently held by the pot (address-matched, raw 18dp). */
  pendingStocks: { address: string; amountWei: string }[];
  updatedAtMs: number;
  /** The backend's own freshness verdict; stale data falls back to flows. */
  stale: boolean;
}

export interface StockpotWire {
  snapshot: StockpotSnapshotWire;
  /** Newest first. */
  purchases: StockpotPurchaseWire[];
  /** Newest first. */
  payouts: StockpotPayoutWire[];
}

// ─── View models (raw + formatted twins) ────────────────────────────────────

/** One registry stock's factsheet row. The pot's steady state is SWEPT
 * (a hit drains it within minutes), so a "position" frame reads zero
 * almost always; the row instead leads with what the next hit is set to
 * pay in this stock and what has already gone out (user 2026-07-28). */
export interface StockpotStockVM {
  ticker: string;
  name: string;
  token: Address;
  chartable: boolean;
  /** Self-hosted logo path, when the registry carries one. */
  icon?: string;
  /** null while the feed is unknown or paused (renders as a dash). */
  priceUsd: number | null;
  priceFormatted: string;
  paused: boolean;
  /** Fold-derived average buy cost while the pot holds shares; feeds the
   * accumulation chart's dashed reference line. Null on empty positions
   * or when an unpriced buy poisons the average. */
  avgCostPerShare: number | null;
  /** What the next hit pays in this stock: shares already held by the pot
   * plus this stock's EVEN slice of the accruing ETH (the pot buys the
   * five stocks equally), converted at the live feed price. Null while
   * the pending feed, the ETH quote, or a needed stock price is unknown
   * (never a confident zero). */
  pendingUsd: number | null;
  pendingUsdFormatted: string;
  pendingShares: number | null;
  pendingSharesFormatted: string;
  /** Lifetime shares swept out to winners (ledger-derived, always known). */
  paidOutShares: number;
  paidOutSharesFormatted: string;
  /** Paid-out shares at CURRENT prices; null when the price is unknown
   * while shares exist. */
  paidOutUsd: number | null;
  paidOutUsdFormatted: string;
}

export interface StockpotPurchaseVM extends StockpotPurchaseWire {
  ticker: string;
  shares: number;
  sharesFormatted: string;
  /** shares × execution-day close. */
  costUsd: number;
  costUsdFormatted: string;
  priceAtBuy: number;
  priceAtBuyFormatted: string;
}

export interface StockpotPayoutVM extends StockpotPayoutWire {
  ticker: string;
  shares: number;
  sharesFormatted: string;
}

/** One payout EVENT: a peapot hit. The disperser sends EACH STOCK in its
 * own transaction, so an event is legs clustered by TIME window (verified
 * live: one hit = five txs seconds apart), and the table shows one row per
 * hit, never a row per leg or per tx. */
export interface StockpotPayoutEventVM {
  /** First tx of the event (the row's receipt link). */
  txHash: string;
  /** Distinct transactions in the event. */
  txCount: number;
  atMs: number;
  /** Distinct recipient count across the event's legs. */
  recipients: number;
  /** Per-stock totals swept in this event, largest first. */
  stocks: { ticker: string; shares: number; sharesFormatted: string }[];
  /** Event value at CURRENT prices; null while any leg's price is unknown. */
  valueUsd: number | null;
  valueUsdFormatted: string;
}

export interface StockpotVM {
  asOfMs: number;
  /** Whole-dollar headline; null until every component has a live price.
   * Sourced from the backend's pending state when fresh (stocks at feed
   * prices + accruing ETH at the live ETH price), else from the flow fold. */
  totalUsd: number | null;
  totalUsdFormatted: string;
  /** From the pending feed; null while flows are the source. */
  marketOpen: boolean | null;
  /** Null when any buy lacks a day-close price (all-or-nothing, never a
   * silent understatement). */
  deployedUsd: number | null;
  deployedUsdFormatted: string;
  /** Payout shares valued at CURRENT prices (labeled as such in the UI). */
  paidOutUsd: number | null;
  paidOutUsdFormatted: string;
  buyCount: number;
  /** Every registry stock, sorted by lifetime paid out descending. */
  stocks: StockpotStockVM[];
  purchases: StockpotPurchaseVM[];
  payouts: StockpotPayoutVM[];
  /** Payout legs grouped by tx hash, newest first. */
  payoutEvents: StockpotPayoutEventVM[];
}

/** The ledger route's payload: chain-derived wire + chart history. */
export interface StockpotLedgerPayload {
  purchases: StockpotPurchaseWire[];
  payouts: StockpotPayoutWire[];
  /** Daily USD close series per ticker, oldest first. */
  history: Record<string, { t: number; v: number }[]>;
  /** True when pagination hit its cap before exhausting the history. */
  truncated: boolean;
}
