/**
 * GET /api/stockpot/ledger — the Stockpot's chain-derived ledger + chart
 * history, assembled server-side so every visitor shares ONE upstream
 * budget (the explorer allows ~180 req/min per IP and the candle API a
 * hard 30/min with live 429s; client-direct would multiply both by
 * visitors). CDN-cached via s-maxage; upstream fetches carry their own
 * revalidate windows.
 *
 * Fails CLOSED: a partial transfer history would silently corrupt cost
 * basis and totals, so any upstream failure returns 502 and the client
 * keeps whatever payload it already has.
 */

import { NextResponse } from "next/server";
import {
  assembleLedger,
  type ExplorerTransferItem,
} from "@/lib/stockpot/assemble";
import { STOCKPOT_ASSETS, STOCKPOT_PERIPHERY } from "@/lib/stockpot/registry";
import type { StockpotLedgerPayload } from "@/lib/stockpot/types";

/** Sequential explorer pagination can take a while on a cold walk. */
export const maxDuration = 60;

const EXPLORER = "https://robinhoodchain.blockscout.com/api/v2";
const CANDLES = "https://api.geckoterminal.com/api/v2/networks/robinhood/pools";
/**
 * 40 pages × 50 = 2,000 transfers before truncation. Audit-measured launch
 * rate is ~106 items/day (payout legs dominate and scale with recipients),
 * so this is roughly three weeks of headroom, not "weeks" of comfort — the
 * UI surfaces `truncated` and the durable fix is an incremental cursor
 * cache. Every ERC-20 leg counts against the budget, including the PEA and
 * WETH legs the assembler ignores.
 */
const MAX_PAGES = 40;
/**
 * Per-upstream-request timeout: a hung socket must not ride the function
 * into the platform kill. Raised 4s → 12s on 2026-07-30: the explorer's
 * cold page latency drifted to ~7s, so a 4s cap aborted the FIRST page and
 * the whole route failed closed with a 502 while both upstreams were
 * healthy (found live on prod). Sized off measured latency with headroom,
 * and bounded overall by WALK_BUDGET_MS below rather than by this alone.
 */
const UPSTREAM_TIMEOUT_MS = 12_000;
/**
 * Wall-clock budget for the sequential explorer walk. Pagination is keyset,
 * so pages cannot be fetched in parallel; at the explorer's current pace a
 * deep history would otherwise run past maxDuration and be killed with
 * nothing to show. When the budget runs out we stop and return what we
 * have as `truncated`, which the UI already tells the truth about ("within
 * the ledger window", never "lifetime"). A labelled partial beats a 502.
 */
const WALK_BUDGET_MS = 38_000;
/** Warm-instance stale-if-error: serving a recent ledger briefly beats an
 * uncacheable 502 that turns every cold tab into a 15s retry hammer
 * against a rate-limited upstream (audit 2026-07-28). */
const LAST_GOOD_MAX_AGE_MS = 3_600_000;
let lastGood: { payload: StockpotLedgerPayload; atMs: number } | null = null;

async function fetchTransfers(): Promise<{
  items: ExplorerTransferItem[];
  truncated: boolean;
}> {
  const items: ExplorerTransferItem[] = [];
  const deadline = Date.now() + WALK_BUDGET_MS;
  let params = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    // Pages come newest-first, so stopping early loses the OLDEST history —
    // the same shape of loss as the page cap, reported the same way.
    if (page > 0 && Date.now() > deadline) return { items, truncated: true };
    const res = await fetch(
      `${EXPLORER}/addresses/${STOCKPOT_PERIPHERY.pot}/token-transfers?type=ERC-20${params}`,
      {
        next: { revalidate: 240 },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`explorer ${res.status}`);
    const body = (await res.json()) as {
      items: ExplorerTransferItem[];
      next_page_params: Record<string, string | number> | null;
    };
    items.push(...body.items);
    if (!body.next_page_params) return { items, truncated: false };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(body.next_page_params))
      qs.set(k, String(v));
    params = `&${qs.toString()}`;
  }
  return { items, truncated: true };
}

async function fetchDailyCloses(
  pool: string,
): Promise<{ t: number; v: number }[]> {
  // limit=1000 (~2.7 years) — at limit=100 every buy older than ~107 days
  // silently priced at 0 and decayed cost basis (audit 2026-07-28). One
  // retry honoring Retry-After absorbs a single upstream 429 instead of
  // failing all five series and 502ing the whole route.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `${CANDLES}/${pool}/ohlcv/day?aggregate=1&limit=1000&currency=usd`,
      {
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
    if (res.status === 429 && attempt === 0) {
      const ra = Number(res.headers.get("retry-after"));
      await new Promise((r) =>
        setTimeout(r, Number.isFinite(ra) && ra > 0 ? Math.min(ra, 3) * 1000 : 1_500),
      );
      continue;
    }
    if (!res.ok) throw new Error(`candles ${res.status}`);
    const body = (await res.json()) as {
      data: { attributes: { ohlcv_list: [number, ...number[]][] } };
    };
    // ohlcv rows arrive newest-first as [unixSec, o, h, l, close, volume].
    return body.data.attributes.ohlcv_list
      .map((row) => ({ t: row[0] * 1000, v: row[4] }))
      .sort((a, b) => a.t - b.t);
  }
  throw new Error("candles retry exhausted");
}

export async function GET() {
  try {
    const [transfers, ...series] = await Promise.all([
      fetchTransfers(),
      ...STOCKPOT_ASSETS.filter((a) => a.chartable).map((a) =>
        fetchDailyCloses(a.pool),
      ),
    ]);
    const history: StockpotLedgerPayload["history"] = {};
    STOCKPOT_ASSETS.filter((a) => a.chartable).forEach((a, i) => {
      history[a.ticker] = series[i];
    });
    const { purchases, payouts } = assembleLedger(transfers.items, history);
    const payload: StockpotLedgerPayload = {
      purchases,
      payouts,
      history,
      truncated: transfers.truncated,
    };
    lastGood = { payload, atMs: Date.now() };
    return NextResponse.json(payload, {
      headers: {
        // max-age=0: BROWSERS always revalidate (a stale private cache once
        // showed excluded rows after a rules change); s-maxage keeps the
        // shared CDN cache carrying the load.
        "Cache-Control":
          "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch {
    // Stale-if-error: a recent good payload with a SHORT shared cache beats
    // an uncacheable 502 (which every cold tab retries at 15s against the
    // same struggling upstream). Older than an hour fails honestly.
    if (lastGood && Date.now() - lastGood.atMs < LAST_GOOD_MAX_AGE_MS) {
      return NextResponse.json(lastGood.payload, {
        headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
      });
    }
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
