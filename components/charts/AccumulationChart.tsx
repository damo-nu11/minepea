"use client";

/**
 * The Accumulation Chart (reference/stockpot-plan.md §6) — the Stockpot's
 * signature block: a stock's price history as a thin white line on black,
 * a dashed lime reference line at the protocol's average cost, and
 * identical lime dots seated ON the price line at every treasury buy.
 * Price above the dashed line means the pot is in profit; that one line
 * tells the whole P&L story.
 *
 * Kit conventions (LineChart's): hand-rolled SVG, tokens-only colors,
 * deterministic first render at a fallback width + ResizeObserver upgrade,
 * role=img with a text alternative. Marker design never varies — identical
 * dots are what make accumulation read systematic — and dense periods
 * merge into ONE marker with a count badge rather than shingling.
 *
 * Motion budget: the only animation on this chart is the hover ring on a
 * marker. The readout card is pointer-events-none like LineChart's (tx
 * links live in the ledger table, not in a hover card).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AXIS_FONT_PX,
  extent,
  fmtDate,
  niceTicks,
} from "@/components/charts/scale";
import { useAxisPad } from "@/components/charts/useAxisPad";
import { fmtToken, fmtUsd, shortAddr } from "@/lib/format";
import type { Address } from "@/lib/types";

export interface AccumulationBuy {
  atMs: number;
  shares: number;
  /** USD cost of the buy. */
  usd: number;
  txHash: string;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 46 };
const FALLBACK_W = 720;
/** Markers closer than this (px) merge into one badge-counted marker. */
export const MARKER_MIN_GAP = 14;

/**
 * Greedy left-to-right clustering of sorted x positions: a marker joins the
 * current cluster while it sits within `minGap` of the cluster's LAST
 * member, else it starts a new one. Returns index groups.
 */
export function clusterByGap(xs: readonly number[], minGap: number): number[][] {
  if (xs.length === 0) return [];
  const groups: number[][] = [[0]];
  for (let i = 1; i < xs.length; i++) {
    const current = groups[groups.length - 1];
    if (xs[i] - xs[current[current.length - 1]] < minGap) current.push(i);
    else groups.push([i]);
  }
  return groups;
}

export function AccumulationChart({
  points,
  buys,
  avgCost,
  label,
  height = 260,
  yFmt = fmtUsd,
}: {
  /** Price series, oldest first. */
  points: { t: number; v: number }[];
  buys: AccumulationBuy[];
  /** Average cost per share, or null while unknown (no reference line). */
  avgCost: number | null;
  /** Accessible one-line description ("NVDA accumulation"). */
  label: string;
  height?: number;
  yFmt?(v: number): string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  const [hoverCluster, setHoverCluster] = useState<number | null>(null);

  // Data swaps (ticker switch, 5-min refresh) rebuild the clusters; a
  // surviving hover index would point the readout at the wrong cluster.
  // Adjust-state-during-render (the house pattern): an effect reset would
  // paint one stale frame and trips the compiler lint.
  const [seen, setSeen] = useState<{ p: typeof points; b: typeof buys }>({
    p: points,
    b: buys,
  });
  if (seen.p !== points || seen.b !== buys) {
    setSeen({ p: points, b: buys });
    if (hoverCluster !== null) setHoverCluster(null);
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || FALLBACK_W);
    measure();
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const ticks = useMemo(() => {
    if (points.length === 0) return null;
    // The avg-cost line must always be IN frame: include it in the domain.
    const values = points.map((p) => p.v);
    if (avgCost !== null) values.push(avgCost);
    const [rawMin, rawMax] = extent(values);
    return niceTicks(rawMin, rawMax);
  }, [points, avgCost]);

  // SSR-deterministic gutter (estimate first render, canvas upgrade in an
  // effect — the kit's hydration rule).
  const padLeft = useAxisPad(
    ticks ? ticks.map(yFmt) : [],
    AXIS_FONT_PX,
    PAD.left,
  );

  const geom = useMemo(() => {
    if (points.length === 0 || !ticks) return null;
    const times = points.map((p) => p.t);
    const [tMin, tMax] = extent(times);
    const values = points.map((p) => p.v);
    if (avgCost !== null) values.push(avgCost);
    const [rawMin, rawMax] = extent(values);
    const vMin = Math.min(rawMin, ticks[0]);
    const vMax = Math.max(rawMax, ticks[ticks.length - 1]);
    const iW = Math.max(120, width - padLeft - PAD.right);
    const iH = height - PAD.top - PAD.bottom;
    const xOf = (t: number) =>
      padLeft + ((t - tMin) / Math.max(1, tMax - tMin)) * iW;
    const yOf = (v: number) =>
      PAD.top + iH - ((v - vMin) / Math.max(1e-9, vMax - vMin)) * iH;
    /** Price-line y at an arbitrary time (linear interpolation, clamped). */
    const yAt = (t: number) => {
      if (t <= points[0].t) return yOf(points[0].v);
      for (let i = 1; i < points.length; i++) {
        if (t <= points[i].t) {
          const a = points[i - 1];
          const b = points[i];
          const f = (t - a.t) / Math.max(1, b.t - a.t);
          return yOf(a.v + (b.v - a.v) * f);
        }
      }
      return yOf(points[points.length - 1].v);
    };
    return { xOf, yOf, yAt, times };
  }, [points, avgCost, width, height, ticks, padLeft]);

  /** Buys sorted by time, mapped to x, clustered by pixel gap. */
  const clusters = useMemo(() => {
    if (!geom) return [];
    const sorted = [...buys].sort((a, b) => a.atMs - b.atMs);
    const xs = sorted.map((b) => geom.xOf(b.atMs));
    return clusterByGap(xs, MARKER_MIN_GAP).map((group) => {
      const members = group.map((i) => sorted[i]);
      const midT = (members[0].atMs + members[members.length - 1].atMs) / 2;
      return {
        // A cluster sits at the centre of its span; a single at its buy.
        x:
          group.length > 1
            ? (xs[group[0]] + xs[group[group.length - 1]]) / 2
            : xs[group[0]],
        y: geom.yAt(midT),
        members,
      };
    });
  }, [buys, geom]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (clusters.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let best: number | null = null;
    let bestDist = 16;
    clusters.forEach((c, i) => {
      const d = Math.abs(c.x - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverCluster(best);
  };

  const a11yLabel = useMemo(() => {
    if (points.length === 0) return label;
    const last = points[points.length - 1].v;
    const avg = avgCost !== null ? `, average cost ${yFmt(avgCost)}` : "";
    // "last daily close", not "latest price": the line is candle data and
    // can differ from the live feed price shown beside the chart.
    return `${label}. ${buys.length} treasury buys${avg}, last daily close ${yFmt(last)}.`;
  }, [label, points, buys, avgCost, yFmt]);

  if (!geom || !ticks) {
    return (
      <div
        className="flex w-full items-center justify-center text-[13px] text-fg-muted"
        style={{ height }}
      >
        —
      </div>
    );
  }

  const { xOf, yOf, times } = geom;
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t)},${yOf(p.v)}`)
    .join("");
  // Ticks are spaced evenly in TIME, never by candle index: candles
  // cluster (thin trading days, the appended now-point), so index spacing
  // scattered the date labels unevenly across the axis (user 2026-07-28).
  // Duplicate day labels on short spans dedupe away.
  const tickCount = width < 480 ? 3 : 5;
  const tSpanMin = times[0];
  const tSpanMax = times[times.length - 1];
  const seenLabels = new Set<string>();
  const xTickTimes = Array.from(
    { length: tickCount },
    (_, i) => tSpanMin + ((tSpanMax - tSpanMin) * i) / (tickCount - 1),
  ).filter((t) => {
    const label = fmtDate(t);
    if (seenLabels.has(label)) return false;
    seenLabels.add(label);
    return true;
  });
  const hovered = hoverCluster !== null ? clusters[hoverCluster] : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        role="img"
        aria-label={a11yLabel}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverCluster(null)}
      >
        {/* Grid + y labels */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={padLeft}
              x2={width - PAD.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="var(--color-line-slate)"
              strokeOpacity="0.45"
            />
            <text
              x={padLeft - 8}
              y={yOf(v) + 3.5}
              textAnchor="end"
              fontSize={AXIS_FONT_PX}
              fill="var(--color-fg-muted)"
            >
              {yFmt(v)}
            </text>
          </g>
        ))}
        {/* X labels */}
        {xTickTimes.map((t, n) => (
          <text
            key={t}
            x={xOf(t)}
            y={height - 6}
            textAnchor={
              n === 0
                ? "start"
                : n === xTickTimes.length - 1
                  ? "end"
                  : "middle"
            }
            fontSize={AXIS_FONT_PX}
            fill="var(--color-fg-muted)"
          >
            {fmtDate(t)}
          </text>
        ))}
        {/* Average-cost reference: the one dashed line that tells the whole
            P&L story. */}
        {avgCost !== null && (
          <g data-avg-line>
            <line
              x1={padLeft}
              x2={width - PAD.right}
              y1={yOf(avgCost)}
              y2={yOf(avgCost)}
              stroke="var(--color-accent)"
              strokeOpacity="0.65"
              strokeDasharray="5 5"
            />
            <text
              x={width - PAD.right}
              y={yOf(avgCost) - 5}
              textAnchor="end"
              fontSize={AXIS_FONT_PX}
              fill="var(--color-accent)"
              fillOpacity="0.9"
            >
              {`${yFmt(avgCost)} avg`}
            </text>
          </g>
        )}
        {/* The price line: thin, white, no fill. */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-fg)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
        {/* Buy markers, seated ON the line. Identical dots; dense runs merge
            into one badge-counted marker. */}
        {clusters.map((c, i) => (
          <g
            key={i}
            data-marker
            data-buys={c.members.length}
            className="cursor-pointer"
          >
            {hoverCluster === i && (
              <circle
                cx={c.x}
                cy={c.y}
                r={9}
                fill="none"
                stroke="var(--color-accent)"
                strokeOpacity="0.35"
              />
            )}
            <circle
              cx={c.x}
              cy={c.y}
              r={c.members.length > 1 ? 6 : 3.5}
              fill="var(--color-accent)"
            />
            {c.members.length > 1 && (
              <text
                x={c.x}
                y={c.y + 2.6}
                textAnchor="middle"
                fontSize="7.5"
                fontWeight="800"
                fill="var(--color-on-light)"
              >
                {c.members.length}
              </text>
            )}
          </g>
        ))}
      </svg>
      {/* Marker readout (pointer-only enhancement; ledger holds the links). */}
      {hovered && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line-slate bg-surface px-2.5 py-1.5"
          style={{
            left: `${Math.min(92, Math.max(2, (hovered.x / width) * 100))}%`,
            transform:
              hovered.x / width > 0.7 ? "translateX(-105%)" : "translateX(8px)",
          }}
        >
          <div className="text-[10px] font-medium text-fg-muted">
            {hovered.members.length > 1
              ? `${hovered.members.length} buys, ${fmtDate(hovered.members[0].atMs)} to ${fmtDate(hovered.members[hovered.members.length - 1].atMs)}`
              : fmtDate(hovered.members[0].atMs)}
          </div>
          <div className="tnum text-[11px] font-semibold text-fg">
            {fmtToken(
              hovered.members.reduce((a, b) => a + b.shares, 0),
              4,
            )}{" "}
            shares for{" "}
            {fmtUsd(hovered.members.reduce((a, b) => a + b.usd, 0))}
          </div>
          {hovered.members.length === 1 && (
            <div className="tnum text-[10px] text-fg-muted">
              {shortAddr(hovered.members[0].txHash as Address)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
