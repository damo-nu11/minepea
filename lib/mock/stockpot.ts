/**
 * Seeded Stockpot mock bundle — local development and tests ONLY.
 *
 * HARD RULE (reference/stockpot-plan.md): fabricated treasury data never
 * ships to production. The Explore tab is env-gated; this bundle exists so
 * the section can be built and polished before the real treasury's first
 * buy, and so tests have deterministic fixtures.
 *
 * Shape mirrors the mechanism: buys land ONLY inside US market hours
 * (13:30-20:00 UTC, weekdays) because LP fees earned during those hours
 * fund the pot; three payout events model peapot hits. Deterministic:
 * fixed UTC anchor, seeded rng, no clock reads at module scope.
 */

import { createRng, type Rng } from "@/lib/mock/rng";
import { STOCKPOT_ASSETS } from "@/lib/stockpot/registry";
import type {
  StockpotPayoutWire,
  StockpotPurchaseWire,
  StockpotWire,
} from "@/lib/stockpot/types";
import type { Address } from "@/lib/types";

/** Fixed anchor (house hydration rule: never a module-scope clock read). */
export const STOCKPOT_MOCK_NOW = Date.UTC(2026, 6, 28); // 2026-07-28T00:00Z

const DAYS = 42;
/** Market hours in minutes-of-day UTC (9:30am-4:00pm Eastern, DST). */
const RTH_OPEN_MIN = 810; // 13:30 UTC
const RTH_CLOSE_MIN = 1200; // 20:00 UTC

/** Plausible per-ticker price anchors for the walk (mock-only values). */
const PRICE_ANCHORS: Record<string, number> = {
  NVDA: 195,
  TSLA: 300,
  AAPL: 335,
  GOOGL: 200,
  SPCX: 250,
};

/** Buy-weighting per ticker (sums to 1). */
const WEIGHTS: readonly { ticker: string; w: number }[] = [
  { ticker: "NVDA", w: 0.3 },
  { ticker: "TSLA", w: 0.2 },
  { ticker: "GOOGL", w: 0.2 },
  { ticker: "AAPL", w: 0.15 },
  { ticker: "SPCX", w: 0.15 },
];

function hex(rng: Rng, chars: number): string {
  let s = "";
  for (let i = 0; i < chars; i++) s += rng.int(16).toString(16);
  return s;
}

function pickWeighted(rng: Rng): string {
  const r = rng.next();
  let acc = 0;
  for (const { ticker, w } of WEIGHTS) {
    acc += w;
    if (r < acc) return ticker;
  }
  return WEIGHTS[WEIGHTS.length - 1].ticker;
}

/** Shares number → raw 18dp string, exact (6dp precision then padded). */
function toSharesWei(shares: number): string {
  const micro = BigInt(Math.round(shares * 1e6));
  return (micro * BigInt(1e12)).toString();
}

export interface StockpotMockBundle {
  wire: StockpotWire;
  /** Daily close series per ticker, oldest first, ending at the as-of
   * moment — the same walk the buys were priced against, so the chart's
   * markers sit on the line they were bought on. */
  history: Record<string, { t: number; v: number }[]>;
}

export function buildStockpotMock(seed = 11): StockpotMockBundle {
  const rng = createRng(seed);
  const byTicker = new Map(STOCKPOT_ASSETS.map((a) => [a.ticker, a]));

  // Daily price walk per ticker, ending near the anchor.
  const walk = new Map<string, number[]>();
  for (const a of STOCKPOT_ASSETS) {
    const anchor = PRICE_ANCHORS[a.ticker];
    let p = anchor * rng.range(0.8, 0.9);
    const days: number[] = [];
    for (let d = 0; d <= DAYS; d++) {
      p *= 1 + rng.range(-0.02, 0.025);
      days.push(p);
    }
    walk.set(a.ticker, days);
  }

  const purchases: StockpotPurchaseWire[] = [];
  const payouts: StockpotPayoutWire[] = [];
  const held = new Map<string, number>(); // ticker -> shares, running

  const payoutDays = new Set([14, 26, 38]);
  for (let d = 0; d < DAYS; d++) {
    const dayMs = STOCKPOT_MOCK_NOW - (DAYS - d) * 86_400_000;
    const dow = new Date(dayMs).getUTCDay();
    if (dow === 0 || dow === 6) continue; // market closed

    const buys = 3 + rng.int(4); // 3-6 buys per session
    for (let b = 0; b < buys; b++) {
      const ticker = pickWeighted(rng);
      // EXACTLY the day close, matching the assembler's guarantee — the
      // markers-on-the-line invariant must hold in the mock too (audit).
      const price = walk.get(ticker)![d];
      const usd = rng.range(50, 400);
      const shares = usd / price;
      const minute =
        RTH_OPEN_MIN + rng.int(RTH_CLOSE_MIN - RTH_OPEN_MIN);
      purchases.push({
        txHash: `0x${hex(rng, 64)}`,
        atMs: dayMs + minute * 60_000,
        token: byTicker.get(ticker)!.token,
        sharesWei: toSharesWei(shares),
        dayCloseUsd8: String(Math.round(price * 1e8)),
      });
      held.set(ticker, (held.get(ticker) ?? 0) + shares);
    }

    if (payoutDays.has(d)) {
      const winner = `0x${hex(rng, 40)}` as Address;
      const roundId = 2200 + d * 40 + rng.int(20);
      const atMs = dayMs + (RTH_CLOSE_MIN + 30) * 60_000;
      for (const [ticker, shares] of held) {
        if (shares <= 0 || !rng.chance(0.7)) continue;
        const out = shares * rng.range(0.2, 0.35);
        payouts.push({
          // One tx PER TICKER, like the real disperser (audit): renders
          // exercise the event grouping and the "+N" tx count.
          txHash: `0x${hex(rng, 64)}`,
          atMs,
          token: byTicker.get(ticker)!.token,
          sharesWei: toSharesWei(out),
          winner,
          roundId,
        });
        held.set(ticker, shares - out);
      }
    }
  }

  const history: StockpotMockBundle["history"] = {};
  for (const a of STOCKPOT_ASSETS) {
    const days = walk.get(a.ticker)!;
    history[a.ticker] = [
      ...Array.from({ length: DAYS }, (_, d) => ({
        t: STOCKPOT_MOCK_NOW - (DAYS - d) * 86_400_000 + RTH_CLOSE_MIN * 60_000,
        v: days[d],
      })),
      { t: STOCKPOT_MOCK_NOW, v: days[DAYS] },
    ];
  }

  return {
    wire: {
      snapshot: {
        asOfMs: STOCKPOT_MOCK_NOW,
        prices: STOCKPOT_ASSETS.map((a) => ({
          token: a.token,
          priceUsd8: String(
            Math.round(
              walk.get(a.ticker)![DAYS] * rng.range(0.998, 1.002) * 1e8,
            ),
          ),
          paused: false,
        })),
      },
      purchases: [...purchases].sort((a, b) => b.atMs - a.atMs),
      payouts: [...payouts].sort((a, b) => b.atMs - a.atMs),
    },
    history,
  };
}

const BUNDLE = buildStockpotMock(11);
export const STOCKPOT_MOCK: StockpotWire = BUNDLE.wire;
export const STOCKPOT_MOCK_HISTORY: StockpotMockBundle["history"] =
  BUNDLE.history;
