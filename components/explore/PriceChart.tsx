"use client";

/**
 * The Explore hero price card: title, range chips, and the chart itself.
 *
 * Shared by BOTH heroes (mock `Hero` in ExplorePage and `LiveHero` in
 * LiveTabs). They are separate components behind IS_API_MODE, and a chart
 * added to only one of them is invisible in the mode it was not added to,
 * which is exactly how the Explore mechanics cards ended up mock-only.
 *
 * Data is real: GeckoTerminal OHLCV through our cached /api/price-chart.
 * There is deliberately NO simulated fallback. With no market the honest
 * render is the empty state; a mock series here draws an invented price
 * history under a "PEA / USD" heading with nothing marking it as fake.
 */

import { useMemo, useState } from "react";
import { LineChart } from "@/components/charts/LineChart";
import { fmtDate } from "@/components/charts/scale";
import { C } from "@/components/explore/shared";
import { PeaIcon } from "@/components/icons";
import { usePriceChart } from "@/lib/hooks/usePriceChart";

// Windows the hourly feed can actually serve. ohlcv/hour?limit=1000 is about
// 41 days, so a 90D chip could never light up; ALL covers the long view.
const RANGES = [7, 30, 180] as const;
type Range = (typeof RANGES)[number];

const DAY_MS = 86_400_000;

/**
 * Price axis that survives four orders of magnitude. A fixed `toFixed(1)`
 * renders every label on a sub-cent token as "$0.0", which is how a chart with
 * real data still manages to say nothing.
 */
export function usdAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs === 0) return "$0";
  if (abs >= 1) return `$${v.toFixed(2)}`;
  if (abs >= 0.01) return `$${v.toFixed(3)}`;
  if (abs >= 0.0001) return `$${v.toFixed(5)}`;
  return `$${v.toExponential(1)}`;
}

export function PriceChart({
  emptyNote = "Awaiting market listing. The price chart goes live once the PEA pair is indexed.",
  priceLabel,
}: {
  emptyNote?: string;
  priceLabel?: string;
}) {
  const { data, status } = usePriceChart();
  const [range, setRange] = useState<Range>(30);

  const series = data;

  // Slice by elapsed time, not by point count: the upstream series is hourly
  // and a young pool has only a handful of points, so `slice(-90)` would show
  // the same thing for every chip while claiming to be a 90-day window.
  const sliced = useMemo(() => {
    if (!series || series.length === 0) return [];
    const newest = series[series.length - 1].t;
    const cutoff = newest - range * DAY_MS;
    const within = series.filter((p) => p.t >= cutoff);
    return within.length >= 2 ? within : series;
  }, [series, range]);

  const hasChart = sliced.length >= 2;

  // Two different spans, and conflating them is a trap.
  //
  // availableDays is how much history EXISTS. It decides which chips are
  // offerable, and must be measured on the unsliced series: measuring it on
  // the drawn window makes the test feed on its own output, so picking 30D
  // shrinks the span to 30 and then disables every longer chip.
  const availableDays =
    series && series.length >= 2
      ? (series[series.length - 1].t - series[0].t) / DAY_MS
      : 0;
  // spanDays is how much is DRAWN. It decides labelling only.
  const spanDays =
    sliced.length >= 2
      ? (sliced[sliced.length - 1].t - sliced[0].t) / DAY_MS
      : 0;

  // Hour-only below a day; add the date once the window crosses midnight,
  // otherwise two different days both label their 14:00 identically.
  const xFmt = (t: number) => {
    if (spanDays > 3) return fmtDate(t);
    const hhmm = new Date(t).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    return spanDays < 1 ? hhmm : `${fmtDate(t)} ${hhmm}`;
  };

  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"}`;
  const spanLabel =
    spanDays < 1
      ? plural(Math.max(1, Math.round(spanDays * 24)), "hour")
      : plural(Math.round(spanDays), "day");

  return (
    <div className="rounded-[16px] border border-line-slate bg-gradient-to-br from-surface-active/40 via-panel to-bg p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PeaIcon size={18} className="text-accent" />
          <span className="font-wordmark text-[14px] font-bold tracking-[-0.01em] text-fg">
            PEA / USD
          </span>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              disabled={
                !hasChart || (r !== 180 && r !== range && availableDays < r)
              }
              className={`tnum h-7 cursor-pointer rounded-full border px-3 text-[12px] font-semibold transition-all disabled:cursor-default disabled:opacity-40 ${
                range === r
                  ? "border-accent/40 bg-surface-active text-fg shadow-[0_0_14px_-4px_var(--color-accent)]"
                  : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {r === 180 ? "ALL" : `${r}D`}
            </button>
          ))}
        </div>
      </div>

      {hasChart ? (
        <div className="mt-4">
          <LineChart
            series={[
              { name: "PEA", color: C.accent, points: sliced, fill: true },
            ]}
            height={260}
            yFmt={usdAxis}
            xFmt={xFmt}
            zeroFloor={false}
            label={priceLabel ?? `PEA price over the last ${spanLabel}`}
          />
        </div>
      ) : (
        <div className="mt-4 flex h-[260px] flex-col items-center justify-center gap-1.5">
          <span className="tnum text-[28px] font-bold text-fg">
            {status === "loading" ? "" : "—"}
          </span>
          <p className="text-[13.5px] text-fg-muted">
            {status === "loading" ? "Loading price history..." : emptyNote}
          </p>
        </div>
      )}
    </div>
  );
}
