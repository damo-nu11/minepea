/**
 * Pure assembly: raw explorer transfer items + daily USD candles → the
 * Stockpot wire. Lives apart from the API route so the classification
 * rules are unit-testable against FROZEN REAL fixtures (a recorded buy
 * from the live pot anchors the tests; if the mechanism's shape ever
 * changes, a pin goes red instead of the page going quietly wrong).
 *
 * Classification (verified against the live pot 2026-07-28, source rules
 * audit-corrected same day):
 * - inbound allowlisted stock FROM a known buy source (the v4 PoolManager,
 *   which custodies every v4 pool's tokens, or any registry v3 pool
 *   address — v3-routed buys arrive from the pool itself) → a purchase
 * - outbound allowlisted stock FROM the pot to anything that is NOT a buy
 *   source → a payout leg (a pot→pool transfer is sale-shaped and must
 *   never be booked as a payout with the pool as the "winner")
 * - anything in STOCKPOT_EXCLUDED_TX or before the launch cutoff → out
 * - everything else (WETH funding legs, the PEA `collect` leg, counterfeit
 *   tokens, unrelated dust) → ignored by the address-only law
 *
 * Buys are priced at their execution-day close (raw 8dp) from the pool
 * candles; a buy on a day with no candle takes the NEAREST EARLIER close
 * (thin young pools can skip a print) and only falls to "0" — which the
 * mapper renders as a dash-costed row — when nothing earlier exists.
 */

import {
  ASSET_BY_TOKEN,
  STOCKPOT_BUY_SOURCES,
  STOCKPOT_EXCLUDED_TX,
  STOCKPOT_LEDGER_START_MS,
  STOCKPOT_PERIPHERY,
} from "@/lib/stockpot/registry";
import type {
  StockpotPayoutWire,
  StockpotPurchaseWire,
} from "@/lib/stockpot/types";
import type { Address } from "@/lib/types";

/** The explorer fields the assembler reads (subset of the API item). */
export interface ExplorerTransferItem {
  transaction_hash: string;
  timestamp: string; // ISO
  from: { hash: string };
  to: { hash: string };
  token: { address_hash?: string; address?: string };
  total: { value: string };
}

const DAY_MS = 86_400_000;

/** UTC day bucket of a timestamp. */
export function dayKey(atMs: number): number {
  return Math.floor(atMs / DAY_MS);
}

/** day → close price (USD), from an oldest-first candle series. */
export function closeByDay(
  series: readonly { t: number; v: number }[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of series) out.set(dayKey(p.t), p.v);
  return out;
}

/** The buy's execution-day close, else the nearest earlier close, else 0. */
export function priceForDay(
  closes: ReadonlyMap<number, number>,
  atMs: number,
  maxLookbackDays = 7,
): number {
  const day = dayKey(atMs);
  for (let back = 0; back <= maxLookbackDays; back++) {
    const v = closes.get(day - back);
    if (v !== undefined) return v;
  }
  return 0;
}

export function assembleLedger(
  items: readonly ExplorerTransferItem[],
  historyByTicker: Readonly<Record<string, { t: number; v: number }[]>>,
  excludedTx: ReadonlySet<string> = STOCKPOT_EXCLUDED_TX,
): { purchases: StockpotPurchaseWire[]; payouts: StockpotPayoutWire[] } {
  const pot = STOCKPOT_PERIPHERY.pot.toLowerCase();
  const closesByToken = new Map<string, Map<number, number>>();
  for (const [tokenKey, asset] of ASSET_BY_TOKEN) {
    closesByToken.set(
      tokenKey,
      closeByDay(historyByTicker[asset.ticker] ?? []),
    );
  }

  const purchases: StockpotPurchaseWire[] = [];
  const payouts: StockpotPayoutWire[] = [];

  for (const it of items) {
    const tokenAddr = (
      it.token.address_hash ??
      it.token.address ??
      ""
    ).toLowerCase();
    const asset = ASSET_BY_TOKEN.get(tokenAddr);
    if (!asset) continue; // the address-only law
    const from = it.from.hash.toLowerCase();
    const to = it.to.hash.toLowerCase();
    const atMs = Date.parse(it.timestamp);
    if (!Number.isFinite(atMs)) continue;
    // Pre-launch dev-test activity stays out of every view, and so does
    // anything ruled out by hash (post-launch test runs).
    if (atMs < STOCKPOT_LEDGER_START_MS) continue;
    if (excludedTx.has(it.transaction_hash.toLowerCase())) continue;

    if (to === pot && STOCKPOT_BUY_SOURCES.has(from)) {
      const closes = closesByToken.get(tokenAddr)!;
      purchases.push({
        txHash: it.transaction_hash,
        atMs,
        token: asset.token,
        sharesWei: it.total.value,
        dayCloseUsd8: String(
          Math.round(priceForDay(closes, atMs) * 1e8),
        ),
      });
    } else if (from === pot && !STOCKPOT_BUY_SOURCES.has(to)) {
      payouts.push({
        txHash: it.transaction_hash,
        atMs,
        token: asset.token,
        sharesWei: it.total.value,
        winner: it.to.hash as Address,
      });
    }
  }

  purchases.sort((a, b) => b.atMs - a.atMs);
  payouts.sort((a, b) => b.atMs - a.atMs);
  return { purchases, payouts };
}
