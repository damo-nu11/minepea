/**
 * GET /api/peapots — every settled round whose peapot fired.
 *
 * Done server-side and cached because there is no way to ask the backend for
 * "rounds with a peapot": the only route is to page through settled rounds and
 * filter. `/api/rounds` caps `limit` at 50, so that is one request per 50
 * rounds. Doing that from the browser would be a dozen-plus requests on every
 * Explore visit; here it is one scan per cache window, shared by everyone.
 *
 * This replaced reading the analytics peapot series, which only spans a
 * ~500-round window and so silently omitted anything older.
 */

import { NextResponse } from "next/server";
import type { BackendRound, RoundsResponse } from "@/lib/api/translate";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** The backend's hard cap. Asking for more returns 50 regardless. */
const PAGE_SIZE = 50;
/**
 * Scan ceiling. At 60s rounds this covers roughly two days of history per 50
 * pages, and it exists so the scan cannot grow without bound as the round
 * count does. When the protocol outgrows it, the fix is a backend endpoint
 * that filters by peapot rather than raising this.
 */
const MAX_PAGES = 60;

export const revalidate = 600;

export async function GET() {
  if (!API_URL) {
    return NextResponse.json({ rounds: [], error: "not configured" });
  }
  const hits: BackendRound[] = [];
  let scanned = 0;
  let truncated = false;
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `${API_URL}/api/rounds?settled=true&page=${page}&limit=${PAGE_SIZE}`,
        { next: { revalidate: 600 } },
      );
      if (!res.ok) throw new Error(`rounds page ${page}: ${res.status}`);
      const body = (await res.json()) as RoundsResponse;
      const rounds = body.rounds ?? [];
      if (rounds.length === 0) break;
      scanned += rounds.length;
      for (const r of rounds) {
        if (r.peapotAmount && r.peapotAmount !== "0") hits.push(r);
      }
      const pages = body.pagination?.pages ?? page;
      if (page >= pages) break;
      if (page === MAX_PAGES && pages > MAX_PAGES) truncated = true;
    }
  } catch (err) {
    // Partial results beat none: whatever was collected is still correct, it
    // is just not the whole history.
    return NextResponse.json(
      {
        rounds: hits,
        scanned,
        partial: true,
        error: err instanceof Error ? err.message : "scan failed",
      },
      { headers: { "Cache-Control": "public, s-maxage=30" } },
    );
  }

  return NextResponse.json(
    { rounds: hits, scanned, truncated },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    },
  );
}
