"use client";

/**
 * Every settled round whose peapot fired, for the Explore Peapots table.
 *
 * WHY THIS EXISTS: the table originally filtered the live round history, which
 * is capped at 120 rounds. At 1-in-333 odds that window holds about a third of
 * one expected hit, so it showed a single peapot beside a chart showing five.
 *
 * The first fix read the analytics peapot series instead, which agreed with
 * the chart but inherited the same flaw in a larger size: that series is a
 * ~500-round window, so it reported three hits when the protocol had more.
 *
 * This reads /api/peapots, which pages through EVERY settled round server-side
 * and caches the result. See that route for why the scan cannot happen here.
 */

import { useEffect, useState } from "react";
import { type BackendRound, toRoundSummaryWire } from "@/lib/api/translate";
import { toRoundSummaryVM } from "@/lib/mappers";
import { report } from "@/lib/report";
import type { HookResult, RoundSummaryVM } from "@/lib/types";

export function usePeapotRounds(): HookResult<RoundSummaryVM[]> {
  const [state, setState] = useState<HookResult<RoundSummaryVM[]>>({
    data: undefined,
    status: "loading",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/peapots");
        if (!res.ok) throw new Error(`peapots ${res.status}`);
        const body = (await res.json()) as { rounds?: BackendRound[] };
        if (!alive) return;
        const rows = (body.rounds ?? [])
          .map((r) => toRoundSummaryVM(toRoundSummaryWire(r)))
          // Newest first, matching every other table on the page.
          .sort((a, b) => b.roundId - a.roundId);
        setState({ data: rows, status: "live" });
      } catch (err) {
        report("peapot-rounds", err);
        if (alive) setState({ data: undefined, status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
