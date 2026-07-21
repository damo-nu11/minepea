/**
 * GET /api/price-chart — price history for the Explore hero chart.
 *
 * Server-side and cached on purpose. GeckoTerminal's free tier allows roughly
 * 30 requests a minute per IP; fetching from each visitor's browser would trip
 * that on a busy minute and blank the chart for everyone. One cached response
 * behind our own origin costs upstream ~1 request per 5 minutes no matter how
 * many people are on the page.
 */

import { NextResponse } from "next/server";
import { fetchPriceHistory } from "@/lib/prices/geckoTerminal";

export const revalidate = 300;

export async function GET(request: Request) {
  const data = await fetchPriceHistory();
  // The header ticker only needs the price. Serving it the full OHLCV series
  // once a minute, on every page, in every tab, is megabytes an hour to
  // transport one float.
  const compact = new URL(request.url).searchParams.has("compact");
  const body = compact ? { ...data, points: [] } : data;

  // A failure must not be cached like a success. One transient 429 held under
  // a 5 minute s-maxage (15 with stale-while-revalidate) blanks the price and
  // the chart for every visitor for that whole window.
  const failed = Boolean(data.error) || data.priceUsd === null;
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": failed
        ? "public, s-maxage=20, stale-while-revalidate=40"
        : "public, s-maxage=300, stale-while-revalidate=900",
    },
  });
}
