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

export async function GET() {
  const data = await fetchPriceHistory();
  return NextResponse.json(data, {
    headers: {
      // Shared CDN cache; serve slightly stale rather than a gap while revalidating.
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
    },
  });
}
