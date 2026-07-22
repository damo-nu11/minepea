"use client";

/**
 * Categorical SVG bar chart (Explore v2 plan §2): stacked positive AND
 * negative values (staking flow, net mint), optional line overlays (moving
 * averages), hover highlight + readout. Same responsive/hydration approach
 * as LineChart (fixed fallback width, ResizeObserver upgrade after mount).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AXIS_FONT_PX,
  axisPadLeft,
  extent,
  niceTicks,
} from "@/components/charts/scale";

export interface BarSeries {
  name: string;
  /** CSS color — token vars only. */
  color: string;
  /** One value per label; negatives stack downward. */
  values: number[];
}

export interface LineOverlay {
  name: string;
  color: string;
  values: number[];
}

const PAD = { top: 12, right: 12, bottom: 22, left: 46 };
const FALLBACK_W = 720;

export function BarChart({
  labels,
  series,
  overlays = [],
  height = 240,
  yFmt = (v: number) => String(Math.round(v)),
  label,
  xTickEvery,
}: {
  labels: string[];
  series: BarSeries[];
  overlays?: LineOverlay[];
  height?: number;
  yFmt?(v: number): string;
  /** Accessible one-line description of the chart. */
  label: string;
  /** Show every Nth x label (default: auto for readability). */
  xTickEvery?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  const [hoverI, setHoverI] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || FALLBACK_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { yOf, ticks, slotW, x0 } = useMemo(() => {
    // Stacked totals per index decide the domain (positives up, negatives down).
    const tops = labels.map((_, i) =>
      series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0),
    );
    const bottoms = labels.map((_, i) =>
      series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0),
    );
    const overlayV = overlays.flatMap((o) => o.values);
    let [vMin, vMax] = extent([...tops, ...bottoms, ...overlayV, 0]);
    const ticks = niceTicks(vMin, vMax);
    vMin = Math.min(vMin, ticks[0]);
    vMax = Math.max(vMax, ticks[ticks.length - 1]);
    // Gutter sized to the widest tick label, same helper LineChart uses. This
    // was a fixed 46px, which is narrower than a label like "15000.0%" needs,
    // so the leading digit was painted outside the viewBox and lost.
    const x0 = axisPadLeft(ticks.map(yFmt), AXIS_FONT_PX, PAD.left);
    const iW = Math.max(120, width - x0 - PAD.right);
    const iH = height - PAD.top - PAD.bottom;
    const yOf = (v: number) =>
      PAD.top + iH - ((v - vMin) / Math.max(1e-9, vMax - vMin)) * iH;
    return { yOf, ticks, slotW: iW / Math.max(1, labels.length), x0 };
  }, [labels, series, overlays, width, height, yFmt]);

  const every =
    xTickEvery ?? Math.max(1, Math.ceil(labels.length / (width < 480 ? 4 : 8)));
  const barW = Math.max(2, slotW * 0.66);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - x0;
    const i = Math.floor(x / slotW);
    setHoverI(i >= 0 && i < labels.length ? i : null);
  };

  // Screen-reader data alternative (audit): latest + range per series.
  const a11yLabel = useMemo(() => {
    const parts = series
      .filter((s) => s.values.length > 0)
      .map((s) => {
        const vs = s.values;
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
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={x0}
              x2={width - PAD.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="var(--color-line-slate)"
              strokeOpacity={v === 0 ? "0.9" : "0.55"}
            />
            <text
              x={x0 - 8}
              y={yOf(v) + 3.5}
              textAnchor="end"
              fontSize={AXIS_FONT_PX}
              fill="var(--color-fg-muted)"
            >
              {yFmt(v)}
            </text>
          </g>
        ))}
        {labels.map((lab, i) => {
          let up = 0;
          let down = 0;
          const cx = x0 + i * slotW + slotW / 2;
          return (
            <g key={i} opacity={hoverI === null || hoverI === i ? 1 : 0.45}>
              {series.map((s) => {
                const v = s.values[i] ?? 0;
                if (v === 0) return null;
                const from = v > 0 ? up : down;
                const to = from + v;
                if (v > 0) up = to;
                else down = to;
                const y1 = yOf(from);
                const y2 = yOf(to);
                return (
                  <rect
                    key={s.name}
                    x={cx - barW / 2}
                    y={Math.min(y1, y2)}
                    width={barW}
                    height={Math.max(1, Math.abs(y1 - y2))}
                    fill={s.color}
                    rx="1"
                  />
                );
              })}
              {i % every === 0 && (
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={AXIS_FONT_PX}
                  fill="var(--color-fg-muted)"
                >
                  {lab}
                </text>
              )}
            </g>
          );
        })}
        {overlays.map((o) => (
          <path
            key={o.name}
            d={o.values
              .map(
                (v, i) =>
                  `${i === 0 ? "M" : "L"}${x0 + i * slotW + slotW / 2},${yOf(v)}`,
              )
              .join("")}
            fill="none"
            stroke={o.color}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {hoverI !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line-slate bg-surface px-2.5 py-1.5"
          style={{
            left: `${Math.min(92, Math.max(2, ((x0 + hoverI * slotW) / width) * 100))}%`,
            transform:
              (x0 + hoverI * slotW) / width > 0.7
                ? "translateX(-105%)"
                : "translateX(10px)",
          }}
        >
          <div className="text-[10px] font-medium text-fg-muted">
            {labels[hoverI]}
          </div>
          {[...series, ...overlays].map((s) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ background: s.color }}
              />
              <span className="tnum text-[11px] font-semibold text-fg">
                {yFmt(("values" in s ? s.values[hoverI] : 0) ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
      {(series.length > 1 || overlays.length > 0) && (
        <div className="mt-1 flex flex-wrap justify-end gap-x-4 gap-y-1">
          {[...series, ...overlays].map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-[3px]"
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
