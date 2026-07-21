/**
 * Live analytics data layer (integration 2026-07-17) — the six
 * GET /api/analytics/:tab endpoints (backend/API.md §Analytics). Every tab
 * returns the same envelope: { series, buckets, stats, tables }, daily
 * points keyed by "YYYY-MM-DD", cached 60s server-side (≤6 min data lag).
 *
 * This layer stays deliberately generic: one envelope type + typed accessors
 * (seriesPoints/stat/bucketRows/tableRows) instead of six bespoke schemas —
 * the backend contract is young and additive changes shouldn't need frontend
 * type surgery. Components pull exactly the keys they render.
 *
 * peaPriceEth is null until DexScreener indexes the pair — every USD-derived
 * figure renders "—" and charts denominate in ETH/PEA (user decision).
 */

import { useEffect, useState } from "react";
import type { HookResult } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
/** Matches the backend cache TTL. */
const TTL_MS = 60_000;

export type AnalyticsTab =
  | "token"
  | "financials"
  | "buyback"
  | "staking"
  | "mining"
  | "behaviour";

export interface SeriesDef {
  unit: string;
  points: Array<{ t: string } & Record<string, unknown>>;
}
export interface BucketDef {
  unit: string;
  rows: Record<string, unknown>[];
}
export interface StatDef {
  unit: string;
  value: number | null;
}

export interface AnalyticsEnvelope {
  tab: string;
  generatedAt: string;
  series: Record<string, SeriesDef>;
  buckets: Record<string, BucketDef>;
  stats: Record<string, StatDef>;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface TimePoint {
  t: number;
  v: number;
}

const cache = new Map<AnalyticsTab, { at: number; data: AnalyticsEnvelope }>();
const inflight = new Map<AnalyticsTab, Promise<AnalyticsEnvelope>>();

async function fetchTab(tab: AnalyticsTab): Promise<AnalyticsEnvelope> {
  const hit = cache.get(tab);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const pending = inflight.get(tab);
  if (pending) return pending;
  const p = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/${tab}`);
      if (!res.ok) throw new Error(`analytics/${tab} failed: ${res.status}`);
      const data = (await res.json()) as AnalyticsEnvelope;
      cache.set(tab, { at: Date.now(), data });
      return data;
    } finally {
      inflight.delete(tab);
    }
  })();
  inflight.set(tab, p);
  return p;
}

/** Fetch-once-per-mount (60s cache absorbs tab flipping). */
export function useAnalyticsTab(
  tab: AnalyticsTab,
): HookResult<AnalyticsEnvelope> {
  const cached = cache.get(tab);
  const [result, setResult] = useState<HookResult<AnalyticsEnvelope>>(
    cached
      ? { data: cached.data, status: "live" }
      : { data: undefined, status: "loading" },
  );
  useEffect(() => {
    let alive = true;
    fetchTab(tab)
      .then((data) => {
        if (alive) setResult({ data, status: "live" });
      })
      .catch(() => {
        if (alive)
          setResult((prev) =>
            prev.data ? prev : { data: undefined, status: "error" },
          );
      });
    return () => {
      alive = false;
    };
  }, [tab]);
  return result;
}

// ─── Accessors (all null/missing-safe — a young contract must not crash) ────

/** Day string "YYYY-MM-DD" → epoch ms (UTC midnight) for the chart kit. */
export function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) || 0;
}

/** One numeric field of a named series as chart points. */
export function seriesPoints(
  env: AnalyticsEnvelope | undefined,
  name: string,
  key: string,
): TimePoint[] {
  const points = env?.series?.[name]?.points ?? [];
  return points.map((p) => ({ t: dayMs(p.t), v: Number(p[key]) || 0 }));
}

/**
 * Like seriesPoints, but SKIPS points where the field is null/absent instead
 * of coercing to 0 — for rate series where null means "undefined, render a
 * gap" (per API.md: roasting APR is null when average unclaimed is 0).
 * NOTE: interior nulls currently connect across the gap (the chart kit has
 * no segment breaks); with expanding-window APRs nulls sit at the edges.
 */
export function seriesPointsOpt(
  env: AnalyticsEnvelope | undefined,
  name: string,
  key: string,
): TimePoint[] {
  const points = env?.series?.[name]?.points ?? [];
  const out: TimePoint[] = [];
  for (const p of points) {
    const raw = p[key];
    if (raw === null || raw === undefined) continue;
    const v = Number(raw);
    if (Number.isFinite(v)) out.push({ t: dayMs(p.t), v });
  }
  return out;
}

/** Running cumulative sum of a series field (e.g. total PEA burned). */
export function seriesCumulative(
  env: AnalyticsEnvelope | undefined,
  name: string,
  key: string,
): TimePoint[] {
  let acc = 0;
  return seriesPoints(env, name, key).map((p) => {
    acc += p.v;
    return { t: p.t, v: acc };
  });
}

export function stat(
  env: AnalyticsEnvelope | undefined,
  name: string,
): number | null {
  const value = env?.stats?.[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function bucketRows<T = Record<string, unknown>>(
  env: AnalyticsEnvelope | undefined,
  name: string,
): T[] {
  return (env?.buckets?.[name]?.rows ?? []) as T[];
}

export function tableRows<T = Record<string, unknown>>(
  env: AnalyticsEnvelope | undefined,
  name: string,
): T[] {
  return (env?.tables?.[name] ?? []) as T[];
}
