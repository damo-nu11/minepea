"use client";

/**
 * Every round whose peapot dropped, for the Explore Peapots table.
 *
 * WHY THIS EXISTS: the table used to filter the live round history, which is
 * capped at 120 rounds. At 1-in-333 odds that window holds about a third of
 * one expected hit, so the table showed one peapot while the chart beside it
 * showed five. They disagreed because they read different sources.
 *
 * This reads the SAME series the chart draws, so the two cannot contradict
 * each other: the analytics mining envelope marks each round's peapot pot and
 * whether it dropped. The series has no tile, winner or timestamp, so the
 * detail for each hit round is fetched individually. That is affordable
 * precisely because hits are rare, which is the same property that made the
 * history window useless here.
 *
 * Mock mode does not need this: the demo engine hits far more often, so its
 * own history already carries plenty.
 */

import { useEffect, useState } from "react";
import { type BackendRound, toRoundSummaryWire } from "@/lib/api/translate";
import { toRoundSummaryVM } from "@/lib/mappers";
import { report } from "@/lib/report";
import type { HookResult, RoundSummaryVM } from "@/lib/types";

/** A point on the analytics peapot series. */
export interface PeapotSeriesPoint {
  roundId: number;
  pot: number;
  hit: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** Bounded so a series full of hits cannot fan out into hundreds of fetches. */
const MAX_LOOKUPS = 40;

export function usePeapotRounds(
  points: PeapotSeriesPoint[] | undefined,
): HookResult<RoundSummaryVM[]> {
  const [state, setState] = useState<HookResult<RoundSummaryVM[]>>({
    data: undefined,
    status: "loading",
  });

  // Depend on the hit ids, not the array identity: the envelope is refetched
  // on a timer and a new array with the same hits must not restart the walk.
  const key = (points ?? [])
    .filter((p) => p.hit)
    .map((p) => p.roundId)
    .join(",");
  const ready = points !== undefined;

  useEffect(() => {
    if (!API_URL || !ready || key === "") return;
    const ids = key.split(",").map(Number);
    let alive = true;
    (async () => {
      const rows: RoundSummaryVM[] = [];
      // Newest first, matching every other table on the page.
      for (const id of ids.slice(-MAX_LOOKUPS).reverse()) {
        try {
          const res = await fetch(`${API_URL}/api/round/${id}`);
          if (!res.ok) continue;
          const body = (await res.json()) as BackendRound;
          if (!body.settled) continue;
          rows.push(toRoundSummaryVM(toRoundSummaryWire(body)));
        } catch (err) {
          report("peapot-rounds", err, { roundId: id });
        }
        if (!alive) return;
      }
      if (alive) setState({ data: rows, status: "live" });
    })();
    return () => {
      alive = false;
    };
  }, [key, ready]);

  // A series with no hits is a KNOWN-EMPTY answer, not a pending one. Derived
  // here rather than pushed through setState, so the effect never sets state
  // synchronously on mount.
  if (ready && key === "") return { data: [], status: "live" };
  return state;
}
