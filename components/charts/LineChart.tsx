"use client";

/**
 * Multi-series SVG line/area chart (Explore v2 plan §2 — hand-rolled: no
 * chart libs, no iframes, tokens-only colors via CSS vars).
 *
 * - Deterministic first render (fixed fallback width) + ResizeObserver
 *   upgrade after mount — hydration-safe (Convention 7).
 * - Hover crosshair with a readout box; pointer-only enhancement, the
 *   numbers always exist elsewhere on the page (a11y floor: role=img +
 *   aria-label describe the chart).
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { extent, fmtDate, niceTicks } from "@/components/charts/scale";
import type { TimePoint } from "@/lib/mock/analytics";

export interface LineSeries {
  name: string;
  /** CSS color — use token vars, e.g. "var(--color-accent)". */
  color: string;
  points: TimePoint[];
  /** Soft area fill under the line. */
  fill?: boolean;
  dashed?: boolean;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 46 };
const FALLBACK_W = 720;

export function LineChart({
  series,
  height = 240,
  yFmt = (v: number) => String(Math.round(v)),
  xFmt = fmtDate,
  label,
  zeroFloor = true,
}: {
  series: LineSeries[];
  height?: number;
  yFmt?(v: number): string;
  /** X-axis label formatter — default date; pass e.g. round numbers for
   * the peapot sawtooth (plan amendment 5). */
  xFmt?(t: number): string;
  /** Accessible one-line description of the chart. */
  label: string;
  /** Extend the y-domain down to 0 (most metrics); false = fit data. */
  zeroFloor?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useId();
  const [width, setWidth] = useState(FALLBACK_W);
  const [hoverI, setHoverI] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || FALLBACK_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { xOf, yOf, ticks, times, padLeft } = useMemo(() => {
    const times = series[0]?.points.map((p) => p.t) ?? [];
    const [tMin, tMax] = extent(times);
    const allV = series.flatMap((s) => s.points.map((p) => p.v));
    let [vMin, vMax] = extent(allV);
    if (zeroFloor) vMin = Math.min(0, vMin);
    const ticks = niceTicks(vMin, vMax);
    vMin = Math.min(vMin, ticks[0]);
    vMax = Math.max(vMax, ticks[ticks.length - 1]);
    // The y gutter sizes to its widest label. It used to be a fixed 46px,
    // which silently clipped the leading characters once a formatter emitted
    // anything longer (a sub-cent price axis renders "$0.00600", not "12").
    // 10.5px type in the brand face measures ~6.4px per character.
    const widest = ticks.reduce((m, v) => Math.max(m, yFmt(v).length), 0);
    const padLeft = Math.max(PAD.left, Math.ceil(widest * 6.4) + 14);
    const iW = Math.max(120, width - padLeft - PAD.right);
    const iH = height - PAD.top - PAD.bottom;
    const xOf = (t: number) =>
      padLeft + ((t - tMin) / Math.max(1, tMax - tMin)) * iW;
    const yOf = (v: number) =>
      PAD.top + iH - ((v - vMin) / Math.max(1e-9, vMax - vMin)) * iH;
    return { xOf, yOf, ticks, times, padLeft };
  }, [series, width, height, zeroFloor, yFmt]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (times.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // Map the cursor to the NEAREST POINT BY TIME, not by index. The
    // crosshair and readout are positioned with xOf(times[i]), so an
    // index-based guess only agrees with them when points are evenly spaced.
    // Hourly market data is not evenly spaced (gaps where nothing traded), so
    // index mapping quoted a different candle than the one under the cursor.
    const iW = Math.max(120, width - padLeft - PAD.right);
    const frac = Math.min(1, Math.max(0, (x - padLeft) / iW));
    const tMin = times[0];
    const tMax = times[times.length - 1];
    const target = tMin + frac * (tMax - tMin);
    let nearest = 0;
    for (let i = 1; i < times.length; i++) {
      if (Math.abs(times[i] - target) < Math.abs(times[nearest] - target)) {
        nearest = i;
      }
    }
    setHoverI(nearest);
  };

  const xTickIdx = useMemo(() => {
    if (times.length === 0) return [];
    const count = width < 480 ? 3 : 5;
    // Dedupe: with fewer points than label slots the rounded indices collide
    // (4 live points → [0,1,2,2,3]), double-painting labels and duplicating
    // React keys. The 180-point mock never hit this.
    return [
      ...new Set(
        Array.from({ length: count }, (_, i) =>
          Math.round((i * (times.length - 1)) / (count - 1)),
        ),
      ),
    ];
  }, [times, width]);

  // Screen-reader data alternative (audit: chart-only series had no text
  // equivalent) — latest value + range per series appended to the label.
  const a11yLabel = useMemo(() => {
    const parts = series
      .filter((s) => s.points.length > 0)
      .map((s) => {
        const vs = s.points.map((p) => p.v);
        const last = vs[vs.length - 1];
        let min = vs[0];
        let max = vs[0];
        for (const v of vs) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
        return `${s.name} latest ${yFmt(last)}, ranging ${yFmt(min)} to ${yFmt(max)}`;
      });
    return parts.length ? `${label}. ${parts.join("; ")}.` : label;
  }, [series, yFmt, label]);

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
        onPointerLeave={() => setHoverI(null)}
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
              strokeOpacity="0.55"
            />
            <text
              x={padLeft - 8}
              y={yOf(v) + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fill="var(--color-fg-muted)"
            >
              {yFmt(v)}
            </text>
          </g>
        ))}
        {/* X labels */}
        {xTickIdx.map((i) => (
          <text
            key={i}
            x={xOf(times[i])}
            y={height - 6}
            textAnchor="middle"
            fontSize="10.5"
            fill="var(--color-fg-muted)"
          >
            {xFmt(times[i])}
          </text>
        ))}
        {/* Gradient area fills (reference look: strong at the line, fading
            to nothing — the "green mountain") */}
        <defs>
          {series.map(
            (s, i) =>
              s.fill && (
                <linearGradient
                  key={s.name}
                  id={`${gradId}-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                </linearGradient>
              ),
          )}
        </defs>
        {/* Series */}
        {series.map((s, i) => {
          const d = s.points
            .map((p, j) => `${j === 0 ? "M" : "L"}${xOf(p.t)},${yOf(p.v)}`)
            .join("");
          const base = yOf(Math.max(0, ticks[0]));
          return (
            <g key={s.name}>
              {s.fill && s.points.length > 1 && (
                <path
                  d={`${d}L${xOf(s.points[s.points.length - 1].t)},${base}L${xOf(s.points[0].t)},${base}Z`}
                  fill={`url(#${gradId}-${i})`}
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2.2"
                strokeDasharray={s.dashed ? "4 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {/* Crosshair */}
        {hoverI !== null && times[hoverI] !== undefined && (
          <g>
            <line
              x1={xOf(times[hoverI])}
              x2={xOf(times[hoverI])}
              y1={PAD.top}
              y2={height - PAD.bottom}
              stroke="var(--color-fg-muted)"
              strokeOpacity="0.5"
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              // hoverI is derived from series[0]; a shorter series would throw
              // here on the right-hand side of the chart.
              const p = s.points[hoverI];
              return p ? (
                <circle
                  key={s.name}
                  cx={xOf(p.t)}
                  cy={yOf(p.v)}
                  r="3"
                  fill={s.color}
                />
              ) : null;
            })}
          </g>
        )}
      </svg>
      {/* Readout */}
      {hoverI !== null && times[hoverI] !== undefined && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line-slate bg-surface px-2.5 py-1.5"
          style={{
            left: `${Math.min(92, Math.max(2, (xOf(times[hoverI]) / width) * 100))}%`,
            transform:
              xOf(times[hoverI]) / width > 0.7
                ? "translateX(-105%)"
                : "translateX(8px)",
          }}
        >
          <div className="text-[10px] font-medium text-fg-muted">
            {xFmt(times[hoverI])}
          </div>
          {series.map((s) => {
            const p = s.points[hoverI];
            return p ? (
              <div key={s.name} className="flex items-center gap-1.5">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="tnum text-[11px] font-semibold text-fg">
                  {yFmt(p.v)}
                </span>
              </div>
            ) : null;
          })}
        </div>
      )}
      {/* Legend */}
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap justify-end gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                className="h-[3px] w-4 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-[11px] text-fg-muted">{s.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
