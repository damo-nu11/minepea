"use client";

/**
 * Every settled round whose peapot fired, for the Explore Peapots table.
 *
 * WHY THIS IS NOT A SIMPLE READ: there is no "rounds with a peapot" endpoint.
 * The only route is to page every settled round and filter, and `/api/rounds`
 * caps `limit` at 50. Two earlier attempts read a bounded window instead and
 * both silently omitted older hits: the round history (120 rounds) reported
 * one, the analytics peapot series (~500 rounds) reported three, where a full
 * scan finds five.
 *
 * TWO PATHS, on purpose. The cheap one is /api/peapots, which does the scan
 * once server-side and caches it for everyone. That route is currently
 * refused by the game backend, which answers 403 to requests originating from
 * our hosting provider while serving browsers normally, so the client falls
 * back to scanning directly. The browser path costs a request per 50 rounds
 * and exists only so the table is not empty while that is unresolved; the
 * moment the block lifts, the server route starts answering and the fallback
 * stops running, with no code change.
 */

import { useEffect, useState } from "react";
import { type BackendRound, toRoundSummaryWire } from "@/lib/api/translate";
import { toRoundSummaryVM } from "@/lib/mappers";
import { report } from "@/lib/report";
import type { HookResult, RoundSummaryVM } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** The backend's hard cap; asking for more still returns 50. */
const PAGE_SIZE = 50;
/** Bound on the browser fallback. Deliberately lower than the server route's:
 * this one is paid by every visitor, so it favours a bounded cost over
 * completeness if the round count ever outgrows it. */
const MAX_PAGES = 30;

/** One scan per page session, shared by every mount. */
let cached: RoundSummaryVM[] | null = null;
let inflight: Promise<RoundSummaryVM[]> | null = null;

const toRows = (rounds: BackendRound[]): RoundSummaryVM[] =>
  rounds
    .map((r) => toRoundSummaryVM(toRoundSummaryWire(r)))
    // Newest first, matching every other table on the page.
    .sort((a, b) => b.roundId - a.roundId);

/** The cheap path: one cached server-side scan. */
async function fromServerRoute(): Promise<RoundSummaryVM[] | null> {
  try {
    const res = await fetch("/api/peapots");
    if (!res.ok) return null;
    const body = (await res.json()) as {
      rounds?: BackendRound[];
      partial?: boolean;
      error?: string;
    };
    // A partial answer means the scan was refused part-way. Its rows are
    // correct but incomplete, so prefer the fallback over showing a subset.
    if (body.error || body.partial) return null;
    return toRows(body.rounds ?? []);
  } catch {
    return null;
  }
}

/** The fallback: page from the browser, which the backend does serve. */
async function fromDirectScan(): Promise<RoundSummaryVM[]> {
  if (!API_URL) return [];
  const hits: BackendRound[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `${API_URL}/api/rounds?settled=true&page=${page}&limit=${PAGE_SIZE}`,
    );
    if (!res.ok) break;
    const body = (await res.json()) as {
      rounds?: BackendRound[];
      pagination?: { pages?: number };
    };
    const rounds = body.rounds ?? [];
    if (rounds.length === 0) break;
    for (const r of rounds) {
      if (r.peapotAmount && r.peapotAmount !== "0") hits.push(r);
    }
    if (page >= (body.pagination?.pages ?? page)) break;
  }
  return toRows(hits);
}

async function load(): Promise<RoundSummaryVM[]> {
  const viaRoute = await fromServerRoute();
  if (viaRoute !== null) return viaRoute;
  return fromDirectScan();
}

export function usePeapotRounds(): HookResult<RoundSummaryVM[]> {
  const [state, setState] = useState<HookResult<RoundSummaryVM[]>>(
    cached ? { data: cached, status: "live" } : { data: undefined, status: "loading" },
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
