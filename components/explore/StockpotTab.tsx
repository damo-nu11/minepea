"use client";

/**
 * Stockpot tab (reference/stockpot-plan.md) — the protocol's stock treasury
 * as a fund factsheet in Voltage, LIVE off the chain: the ledger route
 * derives purchases/payouts from the pot's explorer history (cost priced at
 * execution-day closes), and a Chainlink multicall snapshot prices the
 * holdings every minute. The seeded mock now serves TESTS ONLY.
 *
 * Honesty rules: every block gates on data (dashes, never confident
 * zeros); a refresh failure keeps the last good payload; the pot drains on
 * every peapot hit, so the per-stock table leads with pending-for-the-
 * next-hit and lifetime-paid-out rather than a "holdings" frame that
 * reads zero almost always (user 2026-07-28). Color law: lime appears in
 * the headline total and buy markers ONLY. Price day moves are bright
 * white positive / coral negative, never lime.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { AccumulationChart } from "@/components/charts/AccumulationChart";
import {
  ChartCard,
  Pager,
  StatCard,
  TableScroller,
  TD,
  TH,
  usePage,
} from "@/components/explore/shared";
import { addressUrl, txUrl } from "@/lib/contracts";
import { fmtInt, shortAddr } from "@/lib/format";
import { usePrices } from "@/lib/hooks/useGame";
import { useStockpot } from "@/lib/hooks/useStockpot";
import {
  fmtOpenCountdown,
  nextMarketOpenMs,
} from "@/lib/stockpot/marketHours";
import { STOCKPOT_PERIPHERY } from "@/lib/stockpot/registry";
import type { Address } from "@/lib/types";

/** Per-block audit stamp: "As of 2026-07-28 00:00 UTC". */
function asOfLabel(atMs: number): string {
  const iso = new Date(atMs).toISOString();
  return `As of ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** Ledger-row timestamp: "2026-07-27 20:00". */
function stamp(atMs: number): string {
  const iso = new Date(atMs).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** Stock identity tile: the user-supplied logo when the registry carries
 * one, else the typographic ticker monogram. The ticker text always sits
 * beside the tile, so the image is decorative (empty alt). Exported for
 * the fallback pin. */
export function StockTile({ ticker, icon }: { ticker: string; icon?: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-line-slate bg-white/[0.03] text-[10px] font-extrabold tracking-[0.04em] text-fg">
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- fixed-size 36px tile; next/image adds nothing here
        <img src={icon} alt="" className="h-full w-full object-contain" />
      ) : (
        ticker.slice(0, 4)
      )}
    </span>
  );
}

/** Tiny inline price sparkline for the collapsed ticker rows. */
function Sparkline({ points }: { points: { t: number; v: number }[] }) {
  if (points.length < 2) return <span className="w-24" />;
  const w = 96;
  const h = 26;
  let min = points[0].v;
  let max = points[0].v;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const span = Math.max(1e-9, max - min);
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * w},${
          h - 3 - ((p.v - min) / span) * (h - 6)
        }`,
    )
    .join("");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="shrink-0"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-fg)"
        strokeOpacity="0.45"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ProvenanceRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-slate/60 py-3 last:border-b-0">
      <span className="micro-label">{label}</span>
      <span className="tnum text-[13.5px] font-medium text-fg">{children}</span>
    </div>
  );
}

function AddrLink({ addr }: { addr: Address }) {
  return (
    <a
      href={addressUrl(addr)}
      target="_blank"
      rel="noopener noreferrer"
      className="transition-colors hover:text-accent"
    >
      {shortAddr(addr)}
    </a>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="tnum text-[13px] text-fg-muted transition-colors hover:text-accent"
    >
      {`${hash.slice(0, 8)}...`}
    </a>
  );
}

const DASH = "—";

/** Day move of the last two daily closes: chart-local context for a stock
 * identity header. (The pot keeps no lasting position, so a position P&L
 * here would read +$0.00 forever.) */
function dayChangePct(points: { t: number; v: number }[]): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2].v;
  const last = points[points.length - 1].v;
  return prev > 0 ? ((last - prev) / prev) * 100 : null;
}

function fmtDayChange(v: number | null): string {
  return v === null ? DASH : `${v < 0 ? "" : "+"}${v.toFixed(2)}%`;
}

/** Ticking countdown to the next US market open (Convention 4 leaf: the
 * seconds re-render THIS caption alone, never the tab). Renders only in
 * the closed-market state, which never SSRs (the tab's data is async), so
 * the clock reads are hydration-safe. */
function MarketOpenCountdown() {
  const [remainMs, setRemainMs] = useState<number | null>(null);
  useEffect(() => {
    let target = nextMarketOpenMs(Date.now());
    const tick = () => {
      const now = Date.now();
      if (now >= target) target = nextMarketOpenMs(now);
      setRemainMs(target - now);
    };
    tick();
    const t = setInterval(tick, 1_000);
    return () => clearInterval(t);
  }, []);
  if (remainMs === null) return <>Market closed</>;
  return (
    <>
      Market opens in{" "}
      <span className="tnum text-fg-body">{fmtOpenCountdown(remainMs)}</span>
    </>
  );
}

export const StockpotTab = memo(function StockpotTab() {
  // The live ETH quote prices the pot's accruing-ETH component.
  const prices = usePrices();
  const { data, status, pricesLive } = useStockpot(
    prices.data?.ethUsd ?? 0,
  );
  const vm = data?.vm ?? null;
  const history = data?.history ?? {};
  /** The ledger window overflowed: "lifetime" language must soften. */
  const truncated = data?.truncated ?? false;

  /** Expanded Accumulation Chart ticker; defaults to the most paid out. */
  const [chartPick, setChartPick] = useState<string | null>(null);
  /** Chart window, matching the price chart's range-chip pattern. ALL by
   * default while the pot is young; 1D would need hourly candles. */
  const [chartRange, setChartRange] = useState<"7D" | "30D" | "ALL">("ALL");
  const chartTicker = chartPick ?? vm?.stocks[0]?.ticker ?? null;
  const chartStock = vm?.stocks.find((s) => s.ticker === chartTicker) ?? null;
  const chartBuys = useMemo(
    () =>
      vm
        ? vm.purchases
            .filter((p) => p.ticker === chartTicker)
            .map((p) => ({
              atMs: p.atMs,
              shares: p.shares,
              usd: p.costUsd,
              txHash: p.txHash,
            }))
        : [],
    [vm, chartTicker],
  );
  const chartDay = dayChangePct(
    chartStock ? (history[chartStock.ticker] ?? []) : [],
  );

  // Window the chart data client-side: cutoff anchors to the NEWEST candle
  // (pure data, no clock reads). Buys filter to the same window so the
  // "N buys shown." caption stays literally true per range; average cost
  // stays the position's full-history figure (an account property, not a
  // window property).
  const fullChartPoints = chartStock ? (history[chartStock.ticker] ?? []) : [];
  const rangeDays = chartRange === "ALL" ? null : chartRange === "7D" ? 7 : 30;
  const chartCutoff =
    rangeDays !== null && fullChartPoints.length > 0
      ? fullChartPoints[fullChartPoints.length - 1].t -
        rangeDays * 86_400_000
      : null;
  const chartPoints =
    chartCutoff === null
      ? fullChartPoints
      : fullChartPoints.filter((p) => p.t >= chartCutoff);
  const chartBuysInRange =
    chartCutoff === null
      ? chartBuys
      : chartBuys.filter((b) => b.atMs >= chartCutoff);

  const purchasesPg = usePage(vm?.purchases ?? []);
  const payoutsPg = usePage(vm?.payoutEvents ?? []);

  return (
    <>
      <p className="max-w-[720px] text-[14.5px] leading-relaxed text-fg-body">
        The Stockpot is the protocol&apos;s stock treasury. The ETH side of
        LP fees earned during US market hours buys tokenized stocks on the
        open market, and a peapot hit sends the stocks out onchain.
      </p>

      {/* The pot: headline whole-dollar treasury + lifetime flows. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="THE POT"
          value={vm?.totalUsdFormatted ?? DASH}
          caption={
            vm?.marketOpen === true ? (
              "Held and accruing, market open"
            ) : vm?.marketOpen === false ? (
              <MarketOpenCountdown />
            ) : (
              "Held and accruing, swept on hits"
            )
          }
          accent
        />
        <StatCard
          title="DEPLOYED"
          value={vm?.deployedUsdFormatted ?? DASH}
          caption={
            truncated ? "Within the ledger window" : "Lifetime spent on stocks"
          }
        />
        <StatCard
          title="PAID OUT"
          value={vm?.paidOutUsdFormatted ?? DASH}
          caption="Swept out on hits, at current prices"
        />
        <StatCard
          title="BUYS"
          value={vm ? fmtInt(vm.buyCount) : DASH}
          caption={
            truncated ? "Within the ledger window" : "Lifetime purchases"
          }
        />
      </div>
      <p className="text-right text-[11.5px] text-fg-muted">
        {vm
          ? pricesLive
            ? asOfLabel(vm.asOfMs)
            : `${asOfLabel(vm.asOfMs)}. Prices reconnecting...`
          : status === "error"
            ? "The chain read did not complete. Retrying."
            : "Reading the pot from the chain..."}
      </p>
      {truncated && (
        <p className="text-right text-[11.5px] text-fg-muted">
          The ledger view is capped at its most recent entries; older
          activity is not included in these figures.
        </p>
      )}

      {/* Provenance strip: boring facts in boring type. */}
      <ChartCard
        title="Provenance"
        subtitle="Every entry on this page traces back to onchain activity."
      >
        <div className="flex flex-col">
          <ProvenanceRow label="THE POT">
            <AddrLink addr={STOCKPOT_PERIPHERY.pot} />
          </ProvenanceRow>
          <ProvenanceRow label="FEE COLLECTOR">
            <AddrLink addr={STOCKPOT_PERIPHERY.feeCollector} />
          </ProvenanceRow>
          <ProvenanceRow label="DISPERSER">
            <AddrLink addr={STOCKPOT_PERIPHERY.disperser} />
          </ProvenanceRow>
        </div>
      </ChartCard>

      {/* The Accumulation Chart: every marker is a buy. */}
      {vm && chartStock && (
        <ChartCard
          title="Accumulation"
          subtitle="Price history with a lime dot at every treasury buy. The dashed line, shown while the pot holds shares, is its average cost."
        >
          {/* WHICH stock the big chart shows (user 2026-07-28: the chart
              needs its name on it, not only in the a11y label). */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="flex items-center gap-3">
              <StockTile ticker={chartStock.ticker} icon={chartStock.icon} />
              <span className="flex flex-col">
                <span className="text-[15px] font-bold text-fg">
                  {chartStock.ticker}
                </span>
                <span className="text-[12px] text-fg-muted">
                  {chartStock.name}
                </span>
              </span>
            </span>
            <span className="flex items-baseline gap-3">
              <span className="tnum text-[15px] font-bold text-fg">
                {chartStock.priceFormatted}
              </span>
              <span
                className={`tnum text-[12.5px] ${
                  chartDay !== null && chartDay < 0 ? "text-danger" : "text-fg"
                }`}
              >
                {fmtDayChange(chartDay)}
                <span className="ml-1 text-[11px] text-fg-muted">1D</span>
              </span>
            </span>
          </div>
          {/* Range chips, the price chart's pattern. */}
          <div
            className="mb-2 flex justify-end gap-1.5"
            role="group"
            aria-label="Chart range"
          >
            {(["7D", "30D", "ALL"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={chartRange === r}
                onClick={() => setChartRange(r)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  chartRange === r
                    ? "bg-accent/[0.12] text-accent"
                    : "bg-white/[0.03] text-fg-muted hover:text-fg"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <AccumulationChart
            points={chartPoints}
            buys={chartBuysInRange}
            avgCost={chartStock.avgCostPerShare}
            label={`${chartStock.ticker} accumulation`}
          />
          <p className="mt-2 micro-label">
            {`${fmtInt(chartBuysInRange.length)} buys shown.`}
          </p>
          {/* Ticker switcher rows: the rest of the pot, sparklined. */}
          <div className="mt-4 flex flex-col">
            {vm.stocks
              .filter((s) => s.ticker !== chartStock.ticker)
              .map((s) => {
                const day = dayChangePct(history[s.ticker] ?? []);
                return (
                  <button
                    key={s.token}
                    type="button"
                    onClick={() => setChartPick(s.ticker)}
                    className="flex cursor-pointer items-center justify-between gap-4 border-t border-line-slate/50 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <StockTile ticker={s.ticker} icon={s.icon} />
                      <span className="text-[14px] font-bold text-fg">
                        {s.ticker}
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      <Sparkline points={history[s.ticker] ?? []} />
                      <span className="tnum w-24 text-right text-[13.5px] font-medium text-fg">
                        {s.priceFormatted}
                      </span>
                      <span
                        className={`tnum w-20 text-right text-[12.5px] ${
                          day !== null && day < 0 ? "text-danger" : "text-fg"
                        }`}
                      >
                        {fmtDayChange(day)}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </ChartCard>
      )}

      {/* Per-stock factsheet: pending for the next hit, lifetime paid out.
          The pot's steady state is SWEPT, so a "holdings" frame read as a
          wall of zeros (user 2026-07-28). */}
      {vm && (
        <ChartCard
          title="Payouts by stock"
          subtitle={
            truncated
              ? "What the next hit is set to pay in each stock, next to what has gone out within the ledger window."
              : "What the next hit is set to pay in each stock, next to what has already been paid out."
          }
        >
          <TableScroller label="Stockpot payouts by stock table">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">
                Pending payout and lifetime paid out per stock
              </caption>
              <thead>
                <tr className="border-b border-line-slate">
                  <th className={TH}>Stock</th>
                  <th className={`${TH} text-right`}>Price</th>
                  <th className={`${TH} text-right`}>Pending</th>
                  <th className={`${TH} text-right`}>Paid out</th>
                </tr>
              </thead>
              <tbody>
                {vm.stocks.map((s) => (
                  <tr key={s.token} className="border-b border-line-slate/50">
                    <td className={TD}>
                      <span className="flex items-center gap-3">
                        <StockTile ticker={s.ticker} icon={s.icon} />
                        <span className="flex flex-col">
                          <span className="text-[15px] font-bold">
                            {s.ticker}
                          </span>
                          <span className="text-[12px] font-normal text-fg-muted">
                            {s.name}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={`${TD} tnum text-right`}>
                      {s.priceFormatted}
                    </td>
                    <td className={`${TD} text-right`}>
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="tnum">{s.pendingUsdFormatted}</span>
                        {s.pendingShares !== null && (
                          <span className="tnum text-[12px] font-normal text-fg-muted">
                            {`≈ ${s.pendingSharesFormatted} sh`}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="tnum">{s.paidOutUsdFormatted}</span>
                        <span className="tnum text-[12px] font-normal text-fg-muted">
                          {`${s.paidOutSharesFormatted} sh`}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[11.5px] text-fg-muted">
              Pending is each stock&apos;s even share of the pot at live
              prices. Paid out is valued at current prices.
            </p>
            <p className="text-[11.5px] text-fg-muted">{asOfLabel(vm.asOfMs)}</p>
          </div>
        </ChartCard>
      )}

      {/* The ledger: every buy, tx-linked. */}
      {vm && (
        <ChartCard
          title="Purchases"
          subtitle={
            truncated
              ? "The most recent buys within the ledger window, priced at execution-day closes."
              : "Every buy since launch, priced at its execution-day close."
          }
        >
          <TableScroller label="Stockpot purchases table">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <caption className="sr-only">Stockpot purchase ledger</caption>
              <thead>
                <tr className="border-b border-line-slate">
                  <th className={TH}>Time (UTC)</th>
                  <th className={TH}>Stock</th>
                  <th className={`${TH} text-right`}>Shares</th>
                  <th className={`${TH} text-right`}>Price</th>
                  <th className={`${TH} text-right`}>Cost</th>
                  <th className={`${TH} text-right`}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {purchasesPg.slice.map((p, i) => (
                  <tr
                    key={`${p.txHash}-${p.token}-${i}`}
                    className="border-b border-line-slate/50"
                  >
                    <td className={`${TD} tnum`}>{stamp(p.atMs)}</td>
                    <td className={`${TD} font-bold`}>{p.ticker}</td>
                    <td className={`${TD} tnum text-right`}>
                      {p.sharesFormatted}
                    </td>
                    <td className={`${TD} tnum text-right`}>
                      {p.priceAtBuyFormatted}
                    </td>
                    <td className={`${TD} tnum text-right`}>
                      {p.costUsdFormatted}
                    </td>
                    <td className={`${TD} text-right`}>
                      <TxLink hash={p.txHash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
          <Pager
            page={purchasesPg.page}
            pages={purchasesPg.pages}
            start={purchasesPg.start}
            size={purchasesPg.size}
            total={purchasesPg.total}
            onPage={purchasesPg.setPage}
          />
        </ChartCard>
      )}

      {/* Payouts: peapot hits sweeping the pot to winners. */}
      {vm && vm.payoutEvents.length > 0 && (
        <ChartCard
          title="Payouts"
          subtitle="Peapot hits that swept the pot out onchain, valued at current prices."
        >
          <TableScroller label="Stockpot payouts table">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <caption className="sr-only">Stockpot payout events</caption>
              <thead>
                <tr className="border-b border-line-slate">
                  <th className={TH}>Time (UTC)</th>
                  <th className={`${TH} text-right`}>Value</th>
                  <th className={`${TH} pl-8`}>Stocks</th>
                  <th className={`${TH} text-right`}>Recipients</th>
                  <th className={`${TH} text-right`}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {payoutsPg.slice.map((e) => (
                  <tr
                    key={`${e.txHash}-${e.atMs}`}
                    className="border-b border-line-slate/50"
                  >
                    <td className={`${TD} tnum`}>{stamp(e.atMs)}</td>
                    <td className={`${TD} tnum text-right`}>
                      {e.valueUsdFormatted}
                    </td>
                    <td className={`${TD} pl-8 text-[13.5px] text-fg-body`}>
                      {e.stocks
                        .map((s) => `${s.sharesFormatted} ${s.ticker}`)
                        .join(", ")}
                    </td>
                    <td className={`${TD} tnum text-right`}>
                      {fmtInt(e.recipients)}
                    </td>
                    <td className={`${TD} text-right`}>
                      <TxLink hash={e.txHash} />
                      {e.txCount > 1 && (
                        <span className="ml-1.5 text-[11px] text-fg-muted">
                          +{e.txCount - 1}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
          <Pager
            page={payoutsPg.page}
            pages={payoutsPg.pages}
            start={payoutsPg.start}
            size={payoutsPg.size}
            total={payoutsPg.total}
            onPage={payoutsPg.setPage}
          />
        </ChartCard>
      )}
    </>
  );
});
