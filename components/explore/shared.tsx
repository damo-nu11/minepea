"use client";

/**
 * Shared Explore building blocks (extracted from ExplorePage 2026-07-17 so
 * the live-backend tab variants reuse the exact same visual system as the
 * mock ones): stat/chart cards, hero rows, table scroller + pager, cells.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EthIcon,
  PeaIcon,
} from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { fmtCompact, fmtCompactSig, fmtInt, fmtUsd } from "@/lib/format";
import type { RoundSummaryVM } from "@/lib/types";

// Token-pure series palette (chart kit takes CSS vars).
export const C = {
  accent: "var(--color-accent)",
  fg: "var(--color-fg)",
  muted: "var(--color-fg-muted)",
  danger: "var(--color-danger)",
};

export const usdCompact = (v: number) => `$${fmtCompact(v)}`;
export const peaCompact = (v: number) => fmtCompact(v);
/** USD that stays readable at both ends: compact above 10k, exact below.
 * `usdCompact` alone renders a $0.02 pool as "$0.0". Compacts to four
 * SIGNIFICANT figures ($243.8K, $1.183M) rather than fixed decimals — this is
 * the headline stat rail, where every row is a different magnitude. */
export const usdAuto = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : Math.abs(v) >= 10_000
      ? `$${fmtCompactSig(v)}`
      : fmtUsd(v);
export const pct1 = (v: number) => `${v.toFixed(1)}%`;

export function StatCard({
  title,
  value,
  caption,
  accent = false,
}: {
  title: string;
  value: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[16px] border border-line-slate bg-gradient-to-br from-surface-active/40 via-panel to-bg p-2">
      <div className="flex flex-col gap-3 rounded-[11px] border border-line-slate/50 p-5">
        <span className="text-[13px] font-medium text-fg-muted">{title}</span>
        <div className="flex flex-col items-center gap-1 py-2">
          <span
            className={`tnum text-[34px] font-bold leading-none ${accent ? "text-accent" : "text-fg"}`}
          >
            {value}
          </span>
          <span className="text-[13px] text-fg-muted">{caption}</span>
        </div>
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-line-slate bg-gradient-to-br from-surface-active/40 via-panel to-bg p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-wordmark text-[18px] font-bold tracking-[-0.01em] text-fg">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[12.5px] text-fg-muted">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function HeroStat({
  label,
  value,
  sub,
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Hover detail. Dashed-underlines the label, the site's tooltip signal. */
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-slate/60 py-3 last:border-b-0">
      {hint ? (
        <Tooltip content={hint}>
          <span className="micro-label dashed-underline transition-colors hover:text-fg">
            {label}
          </span>
        </Tooltip>
      ) : (
        <span className="micro-label">{label}</span>
      )}
      <span className="flex items-baseline gap-2">
        <span className="tnum text-[17px] font-bold text-fg">{value}</span>
        {sub && <span className="tnum text-[12px] text-fg-muted">{sub}</span>}
      </span>
    </div>
  );
}

export const TH = "pb-4 text-[13px] font-medium text-th";
export const TD = "h-16 text-[15px] font-medium text-fg";

/** Horizontal-scroll wrapper with a right-edge fade whenever columns hang
 * off-screen. The fade drops once scrolled to the end. */
export function TableScroller({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    const raf = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="no-scrollbar overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-panel to-transparent transition-opacity duration-200 ${
          more ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

export function WinnerCell({ row }: { row: RoundSummaryVM }) {
  if (row.isSplit) {
    return (
      <span className="inline-flex h-7 items-center rounded-full border border-accent px-4 text-[13px] font-semibold text-accent">
        Split
      </span>
    );
  }
  return <span className="tnum">{row.winnerDisplay}</span>;
}

export function ValueWithIcon({
  icon,
  value,
}: {
  icon: "eth" | "pea";
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {icon === "eth" ? (
        <EthIcon size={15} className="text-fg" />
      ) : (
        <PeaIcon size={15} className="text-fg" />
      )}
      <span className="tnum">{value}</span>
    </span>
  );
}

export const PAGE_SIZE = 12;

/** Local page window over a row list. State persists across parent
 * re-renders (the component stays mounted), so the live Mining tab's
 * ~3/s ticks don't reset the page. */
export function usePage<T>(rows: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages - 1);
  const start = current * size;
  return {
    slice: rows.slice(start, start + size),
    page: current,
    pages,
    start,
    total: rows.length,
    size,
    setPage,
  };
}

export function Pager({
  page,
  pages,
  start,
  size,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  start: number;
  size: number;
  total: number;
  onPage(p: number): void;
}) {
  if (total <= size) return null;
  const btn =
    "flex size-7 cursor-pointer items-center justify-center rounded-lg border border-line-slate text-fg-muted transition-colors hover:border-accent/50 hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-slate disabled:hover:text-fg-muted";
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <span className="tnum text-[12.5px] text-fg-muted">
        {start + 1}-{Math.min(start + size, total)} of {fmtInt(total)}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={btn}
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeftIcon size={16} />
        </button>
        <span className="tnum px-1 text-[12.5px] font-medium text-fg-body">
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          className={btn}
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  );
}

/** Colored day/week/month change cell: lime up, coral down, muted flat. */
export function DiffCell({ v }: { v: number }) {
  const color = v > 0 ? "text-accent" : v < 0 ? "text-danger" : "text-fg-muted";
  return (
    <span className={`tnum ${color}`}>
      {v === 0 ? "0%" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`}
    </span>
  );
}
