/**
 * Pure Stockpot derivations. The ledger (purchases + payouts) is the source
 * of truth; holdings, cost basis, and totals are all derived from it, so a
 * treasury balance read is a cross-check, never the primary.
 *
 * Cost basis uses the AVERAGE-COST method: each buy re-averages the
 * per-share cost; a payout removes shares at the current average, leaving
 * the average unchanged. Deterministic, order-independent within a token,
 * and matches how the UI narrates the pot ("avg cost per share").
 */

import { fromWei } from "@/lib/format";
import { ASSET_BY_TOKEN } from "@/lib/stockpot/registry";
import type {
  StockpotPayoutWire,
  StockpotPendingWire,
  StockpotPurchaseWire,
} from "@/lib/stockpot/types";

/** Raw 8dp USD figure (Chainlink answers, day closes) to a number. */
export function price8ToUsd(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n / 1e8 : 0;
}

/** A buy's USD cost: shares × its execution-day close. */
export function buyCostUsd(p: StockpotPurchaseWire): number {
  return fromWei(p.sharesWei) * price8ToUsd(p.dayCloseUsd8);
}

export interface FlowPosition {
  /** Net shares held (never below zero; dust clamps to exactly zero). */
  shares: number;
  /** Remaining cost basis in USD (average-cost method). */
  costUsd: number;
  /** Lifetime buys for this token. */
  buyCount: number;
  /** Buys with no resolvable day-close price. One is enough to poison the
   * average: cost figures for the position must dash, never dilute. */
  unpricedBuys: number;
}

/**
 * Positions below this share count are DUST, treated as exactly zero.
 * Disperser sweeps structurally leave 4-5 wei per ticker (integer division
 * across recipients); without the clamp those wei rendered phantom average
 * cost lines, dust P&L percentages, and could hold the all-or-nothing
 * headline hostage to a paused feed on 6e-18 shares (audit 2026-07-28).
 */
export const DUST_SHARES = 1e-9;

/**
 * Fold the ledger into per-token positions. Events are applied in TIME
 * order regardless of input ordering (the wire is newest-first). A payout
 * exceeding the held amount clamps to zero rather than going negative: on
 * real data that means the allowlist missed an inflow, and a clamped
 * position is visibly wrong while a negative one poisons every total.
 */
export function positionsFromFlows(
  purchases: readonly StockpotPurchaseWire[],
  payouts: readonly StockpotPayoutWire[],
): Map<string, FlowPosition> {
  type Ev =
    | {
        kind: "buy";
        atMs: number;
        token: string;
        shares: number;
        usd: number;
        unpriced: boolean;
      }
    | { kind: "out"; atMs: number; token: string; shares: number };
  const events: Ev[] = [
    ...purchases.map((p) => {
      const usd = buyCostUsd(p);
      return {
        kind: "buy" as const,
        atMs: p.atMs,
        token: p.token.toLowerCase(),
        shares: fromWei(p.sharesWei),
        usd,
        unpriced: price8ToUsd(p.dayCloseUsd8) <= 0,
      };
    }),
    ...payouts.map((p) => ({
      kind: "out" as const,
      atMs: p.atMs,
      token: p.token.toLowerCase(),
      shares: fromWei(p.sharesWei),
    })),
    // Explicit tie-break: at the SAME timestamp a buy folds before a sweep.
    // Explorer timestamps are second-granular and live sweeps trail buys by
    // seconds, so same-second pairs are realistic; relying on spread order
    // plus sort stability was correct but unpinned fragility (audit).
  ].sort(
    (a, b) =>
      a.atMs - b.atMs ||
      (a.kind === b.kind ? 0 : a.kind === "buy" ? -1 : 1),
  );

  const out = new Map<string, FlowPosition>();
  for (const ev of events) {
    const pos = out.get(ev.token) ?? {
      shares: 0,
      costUsd: 0,
      buyCount: 0,
      unpricedBuys: 0,
    };
    if (ev.kind === "buy") {
      pos.shares += ev.shares;
      pos.costUsd += ev.usd;
      pos.buyCount += 1;
      if (ev.unpriced) pos.unpricedBuys += 1;
    } else {
      const avg = pos.shares > 0 ? pos.costUsd / pos.shares : 0;
      const removed = Math.min(ev.shares, pos.shares);
      pos.shares -= removed;
      pos.costUsd = Math.max(0, pos.costUsd - removed * avg);
    }
    out.set(ev.token, pos);
  }
  // Dust clamp: swept-empty positions read as exactly empty.
  for (const pos of out.values()) {
    if (pos.shares < DUST_SHARES) {
      pos.shares = 0;
      pos.costUsd = 0;
    }
  }
  return out;
}

/** Average cost per share, or null for an empty position. */
export function avgCostPerShare(pos: FlowPosition): number | null {
  return pos.shares > 0 ? pos.costUsd / pos.shares : null;
}

/**
 * Total pot value. Null unless EVERY position with shares has a live,
 * unpaused price: a partial sum understates the pot, and an understated
 * headline is still a wrong headline.
 */
export function potTotalUsd(
  positions: ReadonlyMap<string, FlowPosition>,
  priceByToken: ReadonlyMap<string, number | null>,
): number | null {
  let total = 0;
  for (const [token, pos] of positions) {
    if (pos.shares <= 0) continue;
    const price = priceByToken.get(token);
    if (price == null) return null;
    total += pos.shares * price;
  }
  return total;
}

/** Lifetime swept shares per token (lowercased) from the payout ledger. */
export function paidOutSharesByToken(
  payouts: readonly StockpotPayoutWire[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payouts) {
    const key = p.token.toLowerCase();
    out.set(key, (out.get(key) ?? 0) + fromWei(p.sharesWei));
  }
  return out;
}

/** Shares the pot currently holds per token (lowercased) from the pending
 * feed. Dust reads as absent; unknown tokens drop (the address-only law). */
export function pendingSharesByToken(
  pending: StockpotPendingWire,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of pending.pendingStocks) {
    const amount = fromWei(s.amountWei);
    if (amount < DUST_SHARES) continue;
    const key = s.address.toLowerCase();
    if (!ASSET_BY_TOKEN.has(key)) continue;
    out.set(key, (out.get(key) ?? 0) + amount);
  }
  return out;
}

/** The pot's accruing ETH in USD: 0 for dust, null while non-dust ETH
 * sits without a live quote (never a confident zero). */
export function pendingEthUsdValue(
  pending: StockpotPendingWire,
  ethUsd: number,
): number | null {
  const eth = fromWei(pending.pendingEthWei);
  if (eth < 1e-9) return 0;
  return ethUsd > 0 ? eth * ethUsd : null;
}

/**
 * THE POT valued from the backend's pending state: held stocks at feed
 * prices plus accruing ETH at the live ETH price. All-or-nothing like
 * every headline: any non-dust component without a live price → null.
 * Built on the same per-token helpers the factsheet rows use, so the
 * headline and its per-stock decomposition cannot disagree.
 */
export function pendingPotUsd(
  pending: StockpotPendingWire,
  priceByToken: ReadonlyMap<string, number | null>,
  ethUsd: number,
): number | null {
  let total = 0;
  for (const [token, shares] of pendingSharesByToken(pending)) {
    const price = priceByToken.get(token);
    if (price == null) return null;
    total += shares * price;
  }
  const eth = pendingEthUsdValue(pending, ethUsd);
  if (eth === null) return null;
  return total + eth;
}
