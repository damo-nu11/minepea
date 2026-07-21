"use client";

/**
 * Explore v2 — Blockworks-style analytics (reference/explore-v2-plan.md,
 * incl. §4 plan-audit amendments). Layout: hero (stats rail + price chart)
 * → section tabs BUYBACKS | TOKEN | STAKING | MINING | MINERS.
 *
 * Data sourcing (audit-hardened coherence rules):
 * - Hero PRICE/MCAP/FDV come from the LIVE peaUsd (usePrices) × engine
 *   constants; the mock price SERIES is rescaled so its last point equals
 *   the live price (useScaledAnalytics — client hook, never module scope).
 * - Mining tab stat cards + tables are LIVE engine data; every mock-fed
 *   chart carries a SIMULATED tag; the peapot sawtooth uses generic round
 *   numbers so it can't contradict the live table's round ids.
 * - MINING is the default tab (LAST ROUND bar deep-links here expecting
 *   the rounds table on first paint).
 * - Analytics tab bodies are memo() components reading the ANALYTICS
 *   singleton — engine ticks re-render only the Mining tab.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { fmtDate } from "@/components/charts/scale";
import {
  LiveBuybacksTab,
  LiveHero,
  LiveMinersTab,
  LiveMiningCharts,
  LiveStakingTab,
  LiveTokenTab,
} from "@/components/explore/LiveTabs";
import {
  C,
  ChartCard,
  DiffCell,
  HeroStat,
  Pager,
  pct1,
  peaCompact,
  StatCard,
  TableScroller,
  TD,
  TH,
  usdAuto,
  usdCompact,
  usePage,
  ValueWithIcon,
  WinnerCell,
} from "@/components/explore/shared";
import { PriceChart } from "@/components/explore/PriceChart";
import { supplyView, useMarketData } from "@/lib/hooks/usePriceChart";
import { PageHeader, WideContainer } from "@/components/PageHeader";
import { RelTime } from "@/components/RelTime";
import { addressUrl, CONTRACTS, txUrl } from "@/lib/contracts";
import { IS_API_MODE } from "@/lib/engineContext";
import { fmtCompact, fmtInt, fmtUsd, shortAddr } from "@/lib/format";
import { usePrices, useRoundHistory } from "@/lib/hooks/useGame";
import {
  ANALYTICS,
  type AnalyticsBundle,
  type HolderRow,
  type StakerRow,
  type TimePoint,
} from "@/lib/mock/analytics";
import type { Address, RoundSummaryVM } from "@/lib/types";

type Tab = "buybacks" | "token" | "staking" | "mining" | "miners";

const TABS: { id: Tab; label: string }[] = [
  { id: "mining", label: "Mining" },
  { id: "buybacks", label: "Buybacks" },
  { id: "token", label: "Token" },
  { id: "staking", label: "Staking" },
  { id: "miners", label: "Miners" },
];

/** Weekly sum aggregation for daily series (audit: 180 daily bars = texture). */
function weeklySum(points: TimePoint[]): TimePoint[] {
  const out: TimePoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    out.push({
      t: chunk[chunk.length - 1].t,
      v: chunk.reduce((a, p) => a + p.v, 0),
    });
  }
  return out;
}

/** ANALYTICS with the price series rescaled so its terminal point equals
 * the LIVE peaUsd — hero chart, PRICE card, and header ticker agree
 * (plan-audit critical finding). Client-side only; pre-bootstrap renders
 * the unscaled bundle (SSR peaUsd is 0). */
function useScaledAnalytics(): { a: AnalyticsBundle; livePea: number | null } {
  const prices = usePrices();
  const livePea = prices.data?.peaUsd ?? null;
  const a = useMemo(() => {
    if (!livePea) return ANALYTICS;
    const last = ANALYTICS.priceSeries[ANALYTICS.priceSeries.length - 1].v;
    const k = livePea / last;
    return {
      ...ANALYTICS,
      priceSeries: ANALYTICS.priceSeries.map((p) => ({ t: p.t, v: p.v * k })),
      marketCapUsd: livePea * ANALYTICS.circulatingPea,
      fdvUsd: livePea * ANALYTICS.maxSupplyPea,
    };
  }, [livePea]);
  return { a, livePea };
}

function RoundsTable({ rows }: { rows: RoundSummaryVM[] }) {
  const pg = usePage(rows);
  return (
    <div>
      <TableScroller label="Recent rounds table">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <caption className="sr-only">
            Recent mining rounds and winners
          </caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Round
              </th>
              <th scope="col" className={TH}>
                Tile
              </th>
              <th scope="col" className={TH}>
                PEA Winner
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Winners
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Deployed
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Vaulted
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Winnings
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Peapot
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((r) => (
              <tr key={r.roundId}>
                <td className={`${TD} tnum`}>{r.roundIdFormatted}</td>
                <td className={`${TD} tnum`}>{r.tileLabel}</td>
                <td className={TD}>
                  <WinnerCell row={r} />
                </td>
                <td className={`${TD} tnum text-right`}>{r.winnerCount}</td>
                <td className={`${TD} text-right`}>
                  <ValueWithIcon icon="eth" value={r.deployedFormatted} />
                </td>
                <td className={`${TD} text-right`}>
                  <ValueWithIcon icon="eth" value={r.vaultedFormatted} />
                </td>
                <td className={`${TD} text-right`}>
                  <ValueWithIcon icon="eth" value={r.winningsFormatted} />
                </td>
                <td className={`${TD} text-right`}>
                  {r.motherlodeFormatted ? (
                    <ValueWithIcon icon="pea" value={r.motherlodeFormatted} />
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className={`${TD} text-right`}>
                  <RelTime at={r.settledAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
      <Pager
        page={pg.page}
        pages={pg.pages}
        start={pg.start}
        size={pg.size}
        total={pg.total}
        onPage={pg.setPage}
      />
    </div>
  );
}

function PeapotsTable({ rows }: { rows: RoundSummaryVM[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-[15px] text-fg-muted">
        No peapots hit in the recent window.
      </p>
    );
  }
  return (
    <TableScroller label="Peapot hits table">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">Rounds where the peapot dropped</caption>
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Round
            </th>
            <th scope="col" className={TH}>
              Tile
            </th>
            <th scope="col" className={TH}>
              Winner
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Peapot
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Time
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.roundId}>
              <td className={`${TD} tnum`}>{r.roundIdFormatted}</td>
              <td className={`${TD} tnum`}>{r.tileLabel}</td>
              <td className={TD}>
                <WinnerCell row={r} />
              </td>
              <td className={`${TD} text-right`}>
                <ValueWithIcon
                  icon="pea"
                  value={r.motherlodeFormatted ?? "—"}
                />
              </td>
              <td className={`${TD} text-right`}>
                <RelTime at={r.settledAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroller>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  const { a, livePea } = useScaledAnalytics();
  // Market facts come from the same GeckoTerminal payload as the chart, so a
  // number in the rail can never disagree with the line beside it.
  const md = useMarketData().data;
  const sv = supplyView(md?.market, md?.priceUsd);
  const m = md?.market;
  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Stats rail */}
      <div className="rounded-[16px] border border-line-slate bg-gradient-to-br from-surface-active/40 via-panel to-bg px-6 py-3">
        <HeroStat label="Price" value={livePea ? fmtUsd(livePea) : "—"} />
        <HeroStat label="Market Cap" value={usdAuto(sv.marketCapUsd)} />
        <HeroStat label="FDV" value={usdAuto(sv.fdvUsd)} />
        <HeroStat
          label="Circulating Supply"
          value={sv.circulating != null ? fmtInt(sv.circulating) : "—"}
        />
        <HeroStat
          label="Total Supply"
          value={sv.totalSupply != null ? fmtInt(sv.totalSupply) : "—"}
        />
        <HeroStat label="Max Supply" value={fmtInt(a.maxSupplyPea)} />
        <HeroStat label="Liquidity" value={usdAuto(m?.liquidityUsd)} />
        <HeroStat label="24h Trading Volume" value={usdAuto(m?.volume24hUsd)} />
        <HeroStat
          label="24h Deployed Volume"
          value={usdCompact(a.volume24hUsd)}
        />
        <HeroStat
          label="All-Time Deployed"
          value={usdCompact(a.allTimeDeployedUsd)}
        />
      </div>
      {/* No simulated fallback: with no market the designed empty state is
          the honest render. A mock series here draws an invented price
          history under a "PEA / USD" heading with nothing marking it. */}
      <PriceChart />
    </div>
  );
}

// ─── Tabs (analytics bodies are memo'd — engine ticks never touch them) ──────

function BuybackTxTable() {
  const pg = usePage(ANALYTICS.buybackTxs);
  return (
    <div>
      <TableScroller label="Buyback transactions table">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Time
              </th>
              <th scope="col" className={TH}>
                Transaction
              </th>
              <th scope="col" className={`${TH} text-right`}>
                PEA
              </th>
              <th scope="col" className={`${TH} text-right`}>
                USD
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((tx) => (
              <tr key={tx.hash}>
                <td className={`${TD} !h-12`}>
                  <RelTime at={tx.at} />
                </td>
                <td className={`${TD} !h-12 tnum text-fg-body`}>
                  <a
                    href={txUrl(tx.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={tx.hash}
                    className="tnum text-fg-body underline-offset-2 transition hover:text-accent hover:underline focus-ring rounded-sm"
                  >
                    {`${tx.hash.slice(0, 6)}...${tx.hash.slice(-4)}`}
                  </a>
                </td>
                <td className={`${TD} !h-12 text-right`}>
                  <ValueWithIcon icon="pea" value={tx.pea.toFixed(2)} />
                </td>
                <td className={`${TD} !h-12 tnum text-right`}>
                  {fmtUsd(tx.usd)}
                </td>
                <td className={`${TD} !h-12 tnum text-right`}>
                  {fmtUsd(tx.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
      <Pager
        page={pg.page}
        pages={pg.pages}
        start={pg.start}
        size={pg.size}
        total={pg.total}
        onPage={pg.setPage}
      />
    </div>
  );
}

const BuybacksTab = memo(function BuybacksTab() {
  const a = ANALYTICS;
  const revenue30d = a.revenueUsdDaily.slice(-30).reduce((s, p) => s + p.v, 0);
  const weeks = a.buybackUsdWeekly.map((p) =>
    new Date(p.t).getUTCDate().toString(),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Buybacks"
          value={`${fmtCompact(a.totalBuybackPea)} PEA`}
          caption="Bought back on the open market"
        />
        <StatCard
          title="Total Buyback Amount"
          value={usdCompact(a.totalBuybackUsd)}
          caption="Cumulative USD spent"
        />
        <StatCard
          title="% of Supply Bought Back"
          value={pct1(a.pctSupplyBoughtBack)}
          caption="Of circulating + burned"
          accent
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Protocol Revenue"
          subtitle={`A 10% protocol fee on deployed ETH funds buybacks and staking. ${usdCompact(revenue30d)} in the last 30 days.`}
        >
          <LineChart
            series={[
              {
                name: "Revenue",
                color: C.accent,
                points: a.revenueUsdDaily,
                fill: true,
              },
            ]}
            yFmt={usdCompact}
            label={`Daily protocol revenue, ${usdCompact(revenue30d)} over the last 30 days`}
          />
        </ChartCard>
        <ChartCard
          title="Weekly Buybacks"
          subtitle="100% of the protocol fee buys PEA on the open market"
        >
          <BarChart
            labels={weeks}
            series={[
              {
                name: "Buybacks",
                color: C.accent,
                values: a.buybackUsdWeekly.map((p) => p.v),
              },
            ]}
            yFmt={usdCompact}
            label={`Weekly PEA buybacks, latest ${usdCompact(a.buybackUsdWeekly[a.buybackUsdWeekly.length - 1].v)}`}
          />
        </ChartCard>
      </div>
      <ChartCard
        title="Cumulative PEA Burned"
        subtitle="95% of bought back PEA is burned"
      >
        <LineChart
          series={[
            {
              name: "Burned",
              color: C.fg,
              points: a.burnedPeaCumulative,
              fill: true,
            },
          ]}
          yFmt={peaCompact}
          label={`Cumulative PEA burned, ${fmtCompact(a.totalBuybackPea * 0.95)} total`}
        />
      </ChartCard>
      <ChartCard
        title="Buyback Transactions"
        subtitle="Open-market buys, newest first"
      >
        <BuybackTxTable />
      </ChartCard>
    </div>
  );
});

const TokenTab = memo(function TokenTab() {
  const a = ANALYTICS;
  // Supply and market cap come from the same onchain source as the hero rail.
  // They used to read the mock bundle, so one scroll of this page showed two
  // market caps orders of magnitude apart under identical labels.
  const md = useMarketData().data;
  const sv = supplyView(md?.market, md?.priceUsd);
  const mintW = weeklySum(a.mintPeaDaily);
  const burnW = weeklySum(a.burnPeaDaily);
  const weeks = mintW.map((p) => new Date(p.t).getUTCDate().toString());
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Circulating Supply"
          value={sv.circulating != null ? fmtInt(sv.circulating) : "—"}
          caption="Circulating PEA"
        />
        <StatCard
          title="Market Cap"
          value={usdAuto(sv.marketCapUsd)}
          caption="Circulating × live price"
        />
        <StatCard
          title="Max Supply"
          value={fmtInt(a.maxSupplyPea)}
          caption="Hard cap of PEA"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Circulating Supply Over Time"
          subtitle="Minting (1.1 PEA per round) minus buyback burns"
        >
          <LineChart
            series={[
              {
                name: "Circulating",
                color: C.accent,
                points: a.circulatingSeries,
                fill: true,
              },
            ]}
            yFmt={peaCompact}
            label={`Circulating supply, now ${fmtInt(a.circulatingPea)} PEA`}
          />
        </ChartCard>
        <ChartCard
          title="Weekly Mint vs Burn"
          subtitle="Burn above mint ⇒ deflationary week"
        >
          <BarChart
            labels={weeks}
            series={[
              {
                name: "Minted",
                color: C.accent,
                values: mintW.map((p) => p.v),
              },
              {
                name: "Burned",
                color: C.danger,
                values: burnW.map((p) => -p.v),
              },
            ]}
            yFmt={peaCompact}
            label="Weekly PEA minted versus burned"
          />
        </ChartCard>
        <ChartCard
          title="MCAP / FDV Ratio"
          subtitle="Share of the hard cap already circulating"
        >
          <LineChart
            series={[
              {
                name: "Ratio",
                color: C.fg,
                points: a.mcapFdvRatio,
                fill: true,
              },
            ]}
            yFmt={(v) => v.toFixed(2)}
            label={`MCAP to FDV ratio, now ${(a.circulatingPea / a.maxSupplyPea).toFixed(2)}`}
          />
        </ChartCard>
        <ChartCard title="Holders by Size" subtitle="Wallets by PEA held">
          <BarChart
            labels={a.holdersBySize.map((h) => h.bucket)}
            series={[
              {
                name: "Holders",
                color: C.accent,
                values: a.holdersBySize.map((h) => h.holders),
              },
            ]}
            yFmt={(v) => fmtCompact(v)}
            xTickEvery={1}
            label="Holder count by wallet-size bucket"
          />
        </ChartCard>
      </div>
      <ChartCard title="Top Holders" subtitle="Largest PEA balances">
        <HoldersTable rows={a.topHolders} />
      </ChartCard>
    </div>
  );
});

function HoldersTable({ rows }: { rows: HolderRow[] }) {
  const pg = usePage(rows);
  return (
    <div>
      <TableScroller label="Top holders table">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <caption className="sr-only">Top PEA holders by quantity</caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Rank
              </th>
              <th scope="col" className={TH}>
                Wallet
              </th>
              <th scope="col" className={TH}>
                Category
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Quantity
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Value
              </th>
              <th scope="col" className={`${TH} text-right`}>
                % of Total
              </th>
              <th scope="col" className={`${TH} text-right`}>
                1D
              </th>
              <th scope="col" className={`${TH} text-right`}>
                7D
              </th>
              <th scope="col" className={`${TH} text-right`}>
                30D
              </th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((r) => (
              <tr key={r.rank}>
                <td className={`${TD} !h-14 tnum text-fg-muted`}>{r.rank}</td>
                <td className={`${TD} !h-14 tnum text-fg-body`}>
                  {shortAddr(r.address as Address)}
                </td>
                <td className={`${TD} !h-14`}>
                  {r.category ? (
                    <span className="inline-flex h-6 items-center rounded-full border border-line-slate px-2.5 text-[12px] font-medium text-fg-body">
                      {r.category}
                    </span>
                  ) : null}
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <ValueWithIcon icon="pea" value={fmtInt(r.quantityPea)} />
                </td>
                <td className={`${TD} !h-14 tnum text-right`}>
                  {fmtUsd(r.valueUsd)}
                </td>
                <td className={`${TD} !h-14 tnum text-right`}>
                  {r.pctOfTotal.toFixed(2)}%
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <DiffCell v={r.diff1dPct} />
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <DiffCell v={r.diff7dPct} />
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <DiffCell v={r.diff30dPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
      <Pager
        page={pg.page}
        pages={pg.pages}
        start={pg.start}
        size={pg.size}
        total={pg.total}
        onPage={pg.setPage}
      />
    </div>
  );
}

function StakersTable({ rows }: { rows: StakerRow[] }) {
  const pg = usePage(rows);
  return (
    <div>
      <TableScroller label="Top stakers table">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <caption className="sr-only">Top PEA stakers by amount</caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Rank
              </th>
              <th scope="col" className={TH}>
                Wallet
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Staked
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Value
              </th>
              <th scope="col" className={`${TH} text-right`}>
                % of Total
              </th>
              <th scope="col" className={`${TH} text-right`}>
                1D
              </th>
              <th scope="col" className={`${TH} text-right`}>
                7D
              </th>
              <th scope="col" className={`${TH} text-right`}>
                30D
              </th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((r) => (
              <tr key={r.rank}>
                <td className={`${TD} !h-14 tnum text-fg-muted`}>{r.rank}</td>
                <td className={`${TD} !h-14 tnum text-fg-body`}>
                  {shortAddr(r.address as Address)}
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <ValueWithIcon icon="pea" value={fmtInt(r.stakedPea)} />
                </td>
                <td className={`${TD} !h-14 tnum text-right`}>
                  {fmtUsd(r.stakedUsd)}
                </td>
                <td className={`${TD} !h-14 tnum text-right`}>
                  {r.pctOfTotal.toFixed(2)}%
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <DiffCell v={r.diff1dPct} />
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <DiffCell v={r.diff7dPct} />
                </td>
                <td className={`${TD} !h-14 text-right`}>
                  <DiffCell v={r.diff30dPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
      <Pager
        page={pg.page}
        pages={pg.pages}
        start={pg.start}
        size={pg.size}
        total={pg.total}
        onPage={pg.setPage}
      />
    </div>
  );
}

const StakingTab = memo(function StakingTab() {
  const a = ANALYTICS;
  const weeks = a.stakingFlowWeekly.map((p) =>
    new Date(p.t).getUTCDate().toString(),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Staked"
          value={`${fmtCompact(a.totalStakedPea)} PEA`}
          caption={usdCompact(a.totalStakedUsd)}
        />
        <StatCard
          title="% of PEA Staked"
          value={pct1(a.stakedPct)}
          caption="Of circulating supply"
        />
        <StatCard
          title="Implied Staking APR"
          value={pct1(a.impliedApyPct)}
          caption="7-day rolling average"
          accent
        />
      </div>
      <ChartCard
        title="Total Staked PEA"
        subtitle="Share of circulating supply locked in staking"
      >
        <LineChart
          series={[
            {
              name: "Staked",
              color: C.accent,
              points: a.stakedPeaSeries,
              fill: true,
            },
          ]}
          yFmt={peaCompact}
          label={`Total staked PEA, now ${fmtCompact(a.totalStakedPea)}`}
        />
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Weekly Staking Flow"
          subtitle="Net deposits (up) vs withdrawals (down)"
        >
          <BarChart
            labels={weeks}
            series={[
              {
                name: "Net flow",
                color: C.accent,
                values: a.stakingFlowWeekly.map((p) => p.v),
              },
            ]}
            yFmt={peaCompact}
            label="Weekly net staking flow in PEA"
          />
        </ChartCard>
        <ChartCard
          title="Implied APR"
          subtitle="Yield from the staking share of protocol revenue"
        >
          <LineChart
            series={[{ name: "APR", color: C.fg, points: a.apySeries }]}
            yFmt={pct1}
            label={`Implied staking APR, now ${pct1(a.impliedApyPct)}`}
          />
        </ChartCard>
      </div>
      <ChartCard title="Top Stakers" subtitle="Largest PEA staking positions">
        <StakersTable rows={a.topStakers} />
      </ChartCard>
    </div>
  );
});

/** Static mining charts (mock). memo'd so the live tab's ~3/s ticks
 * (stat cards + tables) never re-render these SVGs. */
const MiningCharts = memo(function MiningCharts() {
  const a = ANALYTICS;
  const potLabels = a.peapotRounds.map((p) => `#${p.round}`);
  const potValues = a.peapotRounds.map((p) => p.pot);
  const deployedLabels = a.volumeUsdDaily.map((p) => fmtDate(p.t));
  const paidLabels = a.peapotPaidDaily.map((p) => fmtDate(p.t));
  return (
    <>
      {/* Peapot chart: full width + tall so the bars are distinct (user). */}
      <ChartCard
        title="Peapot Over Rounds"
        subtitle="The pot grows 0.1 PEA every round and has 1-in-333 odds of dropping to the winning tile"
      >
        <BarChart
          labels={potLabels}
          series={[{ name: "Peapot", color: C.accent, values: potValues }]}
          yFmt={(v) => fmtInt(Math.round(v))}
          xTickEvery={20}
          height={360}
          label="Peapot pot size accumulating and resetting across rounds"
        />
      </ChartCard>

      {/* Mechanics prose (original copy) — 3 columns below the chart. */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            h: "Round Mechanics",
            p: "Rounds run on a fixed timer over a board of 25 tiles. Miners deploy ETH on any tiles, one by one or across consecutive rounds with the AutoMiner. When time runs out, one winning tile is drawn at random by Pyth Network's VRF: every tile has the same 1-in-25 chance, however much ETH sits on it.",
          },
          {
            h: "Where the ETH goes",
            p: "A 10% protocol fee is taken on each round's deployed ETH. All of it buys back PEA on the open market: 95% of the bought back PEA is burned and 5% is paid to stakers. Everything else is paid out to the miners on the winning tile, in proportion to what they deployed there. If the drawn tile has no miners on it, the round has no winners and all of its ETH goes to the vault instead.",
          },
          {
            h: "PEA rewards",
            p: "Every round mints 1.1 PEA. One PEA goes to the winning tile: a 50/50 draw settled by the same VRF decides whether it splits across every miner on that tile pro-rata to their ETH or goes whole to one of them. The other 0.1 PEA grows the PEAPOT, which has 1-in-333 odds of dropping each round.",
          },
        ].map((m) => (
          <div
            key={m.h}
            className="rounded-[16px] border border-line-slate bg-gradient-to-br from-surface-active/40 via-panel to-bg p-6 text-[13.5px] leading-relaxed text-fg-body"
          >
            <h3 className="font-wordmark text-[14px] font-bold tracking-[-0.01em] text-fg">
              {m.h}
            </h3>
            <p className="mt-2">{m.p}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Total ETH Deployed for Mining"
          subtitle="Daily ETH deployed into rounds, valued in USD"
        >
          <BarChart
            labels={deployedLabels}
            series={[
              {
                name: "Deployed",
                color: C.accent,
                values: a.volumeUsdDaily.map((p) => p.v),
              },
            ]}
            yFmt={usdCompact}
            label="Total USD value of ETH deployed for mining per day"
          />
        </ChartCard>
        <ChartCard
          title="Peapot Rewards Paid Out"
          subtitle="PEA released each day when the peapot drops"
        >
          <BarChart
            labels={paidLabels}
            series={[
              {
                name: "Paid",
                color: C.accent,
                values: a.peapotPaidDaily.map((p) => p.v),
              },
            ]}
            yFmt={(v) => fmtInt(Math.round(v))}
            label="PEA paid out from peapot drops per day"
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Harvesting APR"
        subtitle="Harvest fees paid out to unharvested PEA, rolling 1D / 7D / 30D windows"
      >
        <LineChart
          series={[
            { name: "1D", color: C.accent, points: a.refiningApy1d },
            { name: "7D", color: C.fg, points: a.refiningApy7d },
            { name: "30D", color: C.muted, points: a.refiningApy30d },
          ]}
          yFmt={pct1}
          height={280}
          label="Harvesting APR over rolling 1-day, 7-day, and 30-day windows"
        />
      </ChartCard>
    </>
  );
});

function MiningTab() {
  const history = useRoundHistory();
  const rows = useMemo(() => history.data ?? [], [history.data]);
  const peapots = useMemo(
    () => rows.filter((r) => r.motherlodeFormatted !== null),
    [rows],
  );

  // LIVE stat cards (audit: must agree with the tables beside them). The
  // peapot hit rate is the protocol's DESIGN odds (1-in-333), not the
  // accelerated demo engine's rate — so it agrees with the mechanics copy.
  const { avgDeployed, avgWinners } = useMemo(() => {
    if (rows.length === 0) return { avgDeployed: null, avgWinners: null };
    const dep = rows.reduce((s, r) => s + r.deployedEth, 0) / rows.length;
    const win = rows.reduce((s, r) => s + r.winnerCount, 0) / rows.length;
    return { avgDeployed: dep, avgWinners: win };
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Avg Deployed / Round"
          value={avgDeployed === null ? "—" : `${avgDeployed.toFixed(1)} ETH`}
          caption="7-day average"
        />
        <StatCard
          title="Avg Winners / Round"
          value={avgWinners === null ? "—" : fmtInt(Math.round(avgWinners))}
          caption="7-day average"
        />
        <StatCard
          title="Peapot Hit Rate"
          value="1 in 333"
          caption="All-time odds per round"
          accent
        />
      </div>

      {IS_API_MODE ? <LiveMiningCharts /> : <MiningCharts />}

      {/* #rounds: deep-link target for the Mine page's LAST ROUND bar. */}
      <div id="rounds" className="scroll-mt-24">
        <ChartCard title="Rounds" subtitle="Every settled round, newest first">
          <RoundsTable rows={rows} />
        </ChartCard>
      </div>
      <ChartCard title="Peapots" subtitle="Rounds where the peapot dropped">
        <PeapotsTable rows={peapots.slice(0, 25)} />
      </ChartCard>
    </div>
  );
}

const MinersTab = memo(function MinersTab() {
  const a = ANALYTICS;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Automining Share"
          value={pct1(a.autominePct)}
          caption="Of deployed ETH, daily basis"
        />
        <StatCard
          title="Full-Board Deployments"
          value={pct1(a.fullGridPct)}
          caption="Rounds covering all 25 tiles"
        />
        <StatCard
          title="Avg Miners / Round"
          value={fmtInt(Math.round(a.avgMinersPerRound))}
          caption="Active wallets per round"
        />
      </div>
      <ChartCard
        title="Automining vs Full-Board Share"
        subtitle="How miners actually play: automation and board coverage"
      >
        <LineChart
          series={[
            {
              name: "Automining %",
              color: C.accent,
              points: a.autominePctSeries,
            },
            { name: "Full-board %", color: C.fg, points: a.fullGridPctSeries },
          ]}
          yFmt={pct1}
          label={`Automining share ${pct1(a.autominePct)}, full-board share ${pct1(a.fullGridPct)}`}
        />
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Deployment Share by Tile"
          subtitle="How evenly the 25 tiles get covered"
        >
          <BarChart
            labels={a.tileDistribution.map((t) => String(t.tile))}
            series={[
              {
                name: "Share",
                color: C.accent,
                values: a.tileDistribution.map((t) => t.pct),
              },
            ]}
            yFmt={pct1}
            xTickEvery={2}
            label="Share of deployments per tile, roughly even across the board"
          />
        </ChartCard>
        <ChartCard
          title="Avg P&L by Tiles Deployed"
          subtitle="Average round outcome by how many tiles a miner covers"
        >
          <BarChart
            labels={a.pnlByBucket.map((b) => b.bucket)}
            series={[
              {
                name: "Avg win",
                color: C.accent,
                values: a.pnlByBucket.map((b) => b.avgWinUsd),
              },
              {
                name: "Avg loss",
                color: C.danger,
                values: a.pnlByBucket.map((b) => b.avgLoseUsd),
              },
            ]}
            yFmt={(v) => `$${v.toFixed(0)}`}
            xTickEvery={1}
            label="Average USD win and loss per round by tile-count bucket"
          />
        </ChartCard>
      </div>
    </div>
  );
});

// ─── Page ────────────────────────────────────────────────────────────────────

/**
 * Deployed contract addresses, straight from lib/contracts.ts so this panel
 * can never drift from what the app actually calls. Every row links to the
 * block explorer, which is the point: a published address nobody can verify
 * is not much of a disclosure.
 */
function ContractsSection() {
  const rows: { label: string; address: string }[] = [
    { label: "PEA Token", address: CONTRACTS.peaToken },
    { label: "GridMining", address: CONTRACTS.gridMining },
    { label: "Staking", address: CONTRACTS.staking },
    { label: "AutoMiner", address: CONTRACTS.autoMiner },
    { label: "Treasury", address: CONTRACTS.treasury },
  ];
  return (
    <ChartCard
      title="Contracts"
      subtitle="Verify any address on the block explorer before you interact with it"
    >
      <TableScroller label="Deployed contract addresses">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <caption className="sr-only">PEA contract addresses</caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Contract
              </th>
              <th scope="col" className={TH}>
                Address
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={TD}>{r.label}</td>
                <td className={TD}>
                  <a
                    href={addressUrl(r.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring tnum rounded-sm break-all text-accent underline-offset-2 hover:underline"
                  >
                    {r.address}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroller>
    </ChartCard>
  );
}

export function ExplorePage() {
  const [tab, setTab] = useState<Tab>("mining");

  // Deep-link: the Mine page's LAST ROUND bar links to /explore#rounds — the
  // Mining tab is the default, so just scroll the Rounds table into view once
  // it has laid out (history loads async, so wait a paint or two).
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#rounds")
      return;
    const t = setTimeout(() => {
      document
        .getElementById("rounds")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <WideContainer>
      <PageHeader
        title="Explore"
        subtitle="Protocol analytics and live mining activity."
      />

      {IS_API_MODE ? <LiveHero /> : <Hero />}

      {/* Section tabs — full APG tab pattern (audit): roving tabindex +
          arrow-key navigation, each tab controls the panel below. */}
      <div
        role="tablist"
        aria-label="Analytics sections"
        className="no-scrollbar mt-10 flex w-full gap-1.5 overflow-x-auto rounded-[16px] border border-line-slate bg-panel p-1.5"
      >
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="analytics-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const dir = e.key === "ArrowRight" ? 1 : -1;
              const next = TABS[(i + dir + TABS.length) % TABS.length];
              setTab(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
            className={`h-10 flex-1 cursor-pointer whitespace-nowrap rounded-[11px] border px-4 text-[14px] transition-all ${
              tab === t.id
                ? "border-accent/40 bg-gradient-to-b from-accent/20 to-accent/[0.04] font-semibold text-fg shadow-[0_0_14px_-8px_var(--color-accent)]"
                : "border-transparent font-medium text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        id="analytics-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="mb-20 mt-6"
      >
        {tab === "mining" && <MiningTab />}
        {tab === "buybacks" &&
          (IS_API_MODE ? <LiveBuybacksTab /> : <BuybacksTab />)}
        {tab === "token" && (IS_API_MODE ? <LiveTokenTab /> : <TokenTab />)}
        {tab === "staking" &&
          (IS_API_MODE ? <LiveStakingTab /> : <StakingTab />)}
        {tab === "miners" && (IS_API_MODE ? <LiveMinersTab /> : <MinersTab />)}
      </div>

      <div className="mb-20">
        <ContractsSection />
      </div>
    </WideContainer>
  );
}
