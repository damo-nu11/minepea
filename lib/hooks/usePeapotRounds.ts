"use client";

/**
 * Every settled round whose peapot fired, for the Explore Peapots table.
 *
 * The backend filters this for us: `/api/rounds?peapot=true` returns only the
 * rounds that fired, so this is one request and it is complete by definition.
 *
 * That endpoint replaced three worse attempts, each of which read a bounded
 * window and silently omitted older hits: the round history (120 rounds)
 * reported one peapot, the analytics peapot series (~500 rounds) reported
 * three, and a full unfiltered scan found five but cost a request per 50
 * rounds. Anything that reports a subset looks identical to a complete answer,
 * which is why this now asks a question the backend can answer exactly.
 *
 * `limit` still caps at 50 server-side, so pagination is kept: at 1-in-333 and
 * 60s rounds the 50th peapot lands within a couple of weeks.
 */

import { useEffect, useState } from "react";
import { type BackendRound, toRoundSummaryWire } from "@/lib/api/translate";
import { toRoundSummaryVM } from "@/lib/mappers";
import { report } from "@/lib/report";
import type { HookResult, RoundSummaryVM } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PAGE_SIZE = 50;
/** Bound on the paging loop; 50 pages is 2,500 peapots. */
const MAX_PAGES = 50;

/** One fetch per page session, shared by every mount. */
let cached: RoundSummaryVM[] | null = null;
let inflight: Promise<RoundSummaryVM[]> | null = null;

async function load(): Promise<RoundSummaryVM[]> {
  if (!API_URL) return [];
  const hits: BackendRound[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `${API_URL}/api/rounds?peapot=true&page=${page}&limit=${PAGE_SIZE}`,
    );
    if (!res.ok) throw new Error(`rounds?peapot page ${page}: ${res.status}`);
    const body = (await res.json()) as {
      rounds?: BackendRound[];
      pagination?: { pages?: number };
    };
    const rounds = body.rounds ?? [];
    if (rounds.length === 0) break;
    hits.push(...rounds);
    if (page >= (body.pagination?.pages ?? page)) break;
  }
  return hits
    .map((r) => toRoundSummaryVM(toRoundSummaryWire(r)))
    // Newest first, matching every other table on the page.
    .sort((a, b) => b.roundId - a.roundId);
}

export function usePeapotRounds(): HookResult<RoundSummaryVM[]> {
  const [state, setState] = useState<HookResult<RoundSummaryVM[]>>(
    cached
      ? { data: cached, status: "live" }
      : { data: undefined, status: "loading" },
  );

  useEffect(() => {
    if (cached) return;
    let alive = true;
    inflight ??= load().finally(() => {
      inflight = null;
    });
    void inflight
      .then((rows) => {
        cached = rows;
        if (alive) setState({ data: rows, status: "live" });
      })
      .catch((err) => {
        report("peapot-rounds", err);
        if (alive) setState({ data: undefined, status: "error" });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
