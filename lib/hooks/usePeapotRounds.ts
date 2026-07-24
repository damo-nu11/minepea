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
import { useRound } from "@/lib/hooks/useGame";
import { toRoundSummaryVM } from "@/lib/mappers";
import { report } from "@/lib/report";
import type { HookResult, RoundSummaryVM } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PAGE_SIZE = 50;
/** Bound on the paging loop; 50 pages is 2,500 peapots. */
const MAX_PAGES = 50;

/**
 * Shared across mounts so the table does not refetch on every render, but
 * TIME-BOUNDED. A permanent cache silently froze the table at whatever had
 * fired when the tab was opened: a peapot that dropped an hour later was
 * invisible until a hard refresh, which reads as the table being wrong.
 */
const CACHE_TTL_MS = 45_000;
let cache: {
  rows: RoundSummaryVM[];
  at: number;
  /** The round in flight when these rows were fetched. */
  roundId: number | undefined;
} | null = null;
let inflight: Promise<RoundSummaryVM[]> | null = null;

/*
 * Known, accepted window: if the round advances while a fetch is in flight,
 * the late effect run attaches to the same promise and stamps the cache with
 * the NEWER round id, so a peapot landing in that exact gap shows one round
 * late (the next settlement triggers the refetch that picks it up; the TTL
 * backstops remounts). Rounds outlast the fetch by two orders of magnitude,
 * and closing the window means racing parallel fetches for a table that
 * self-heals in ~70s. Also accepted: the very first mount can fetch twice
 * (once at roundId undefined pre-bootstrap, once when the id lands) when the
 * first response returns before bootstrap; both requests are one page.
 */

/**
 * Refetch when the ROUND has moved on, or when the rows are simply old.
 *
 * The round check is the load-bearing one: a peapot can only appear at
 * settlement, so a new round id is the exact signal that the answer may have
 * changed. The TTL alone would not do it, since it only happens to exceed a
 * round by accident of two unrelated constants, and a shorter round would
 * leave the cache permanently "fresh" and the table permanently stale.
 */
const needsFetch = (roundId: number | undefined) =>
  cache === null ||
  cache.roundId !== roundId ||
  Date.now() - cache.at >= CACHE_TTL_MS;

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
  return (
    hits
      .map((r) => toRoundSummaryVM(toRoundSummaryWire(r)))
      // Newest first, matching every other table on the page.
      .sort((a, b) => b.roundId - a.roundId)
  );
}

export function usePeapotRounds(): HookResult<RoundSummaryVM[]> {
  // A peapot can only fire when a round settles, so the round id is the exact
  // moment a refetch could return something new. Cheaper and more precise than
  // polling on a timer.
  const roundId = useRound().data?.roundId;
  const [state, setState] = useState<HookResult<RoundSummaryVM[]>>(
    cache
      ? { data: cache.rows, status: "live" }
      : { data: undefined, status: "loading" },
  );

  useEffect(() => {
    if (!needsFetch(roundId)) return;
    let alive = true;
    inflight ??= load().finally(() => {
      inflight = null;
    });
    void inflight
      .then((rows) => {
        cache = { rows, at: Date.now(), roundId };
        if (alive) setState({ data: rows, status: "live" });
      })
      .catch((err) => {
        report("peapot-rounds", err);
        // Keep the last good rows rather than blanking a populated table on a
        // transient failure; only a first load with nothing cached is an error.
        if (alive && !cache) setState({ data: undefined, status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [roundId]);

  return state;
}
