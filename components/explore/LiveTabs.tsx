"use client";

/**
 * Explore tabs — LIVE variants (integration 2026-07-17), fed entirely by the
 * backend's /api/analytics/:tab endpoints. Rendered in API mode instead of
 * the SIMULATED mock bodies; zero mock data. Charts denominate in ETH/PEA
 * until the DexScreener price feed exists (peaPriceEth null ⇒ USD rows "—").
 *
 * Charts awaiting NEW backend series (deliberately absent, not mocked):
 * peapot-pot-over-rounds and the harvesting-APR 1D/7D/30D lines.
 */

import { memo, useMemo } from "react";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { PriceChart } from "@/components/explore/PriceChart";
import { supplyView, useMarketData } from "@/lib/hooks/usePriceChart";
import { fmtDate } from "@/components/charts/scale";

import { RelTime } from "@/components/RelTime";
import { txUrl } from "@/lib/contracts";
import {
  bucketRows,
  seriesCumulative,
  seriesPoints,
  seriesPointsOpt,
  stat,
  tableRows,
  useAnalyticsTab,
  type TimePoint,
} from "@/lib/api/analyticsLive";
import {
  fmtCompact,
  fmtInt,
  fmtTokenSmart,
  fmtUsd,
  shortAddr,
} from "@/lib/format";
import { usePrices } from "@/lib/hooks/useGame";
import type { Address } from "@/lib/types";
import {
  C,
  ChartCard,
  HeroStat,
  Pager,
  pct1,
  StatCard,
  TableScroller,
  TD,
  TH,
  usdAuto,
  usePage,
  ValueWithIcon,
} from "./shared";

const eth4 = (v: number) => fmtTokenSmart(v, 4);
const pea1 = (v: number) => fmtTokenSmart(v, 1);

function NoData({ note = "No data yet." }: { note?: string }) {
  return <p className="py-10 text-center text-[15px] text-fg-muted">{note}</p>;
}

/** Chart-or-empty: the kit expects a non-empty domain. */
function hasPoints(...series: TimePoint[][]): boolean {
  return series.some((s) => s.length > 0);
}

// ─── Hero ────────────────────────────────────────────────────────────────────

export function LiveHero() {
  const token = useAnalyticsTab("token");
  const mining = useAnalyticsTab("mining");
  // Live PEA price (DexScreener via the game store's price poll) — 0 until
  // the pair is indexed.
  const prices = usePrices();
  const peaUsd =
    prices.data && prices.data.peaUsd > 0 ? prices.data.peaUsd : null;
  // REAL ETH spot (Coinbase, 30s poll via lib/livePrices) overlaid on the
  // store price. Prices the two deployed rows below.
  const ethUsd =
    prices.data && prices.data.ethUsd > 0 ? prices.data.ethUsd : null;

  const volume = seriesPoints(mining.data, "deployVolume", "total");
  // Same GeckoTerminal payload the chart is drawn from (see usePriceChart).
  const md = useMarketData().data;
  const sv = supplyView(md?.market, md?.priceUsd);
  const m = md?.market;
  const maxSupply = stat(token.data, "maxSupply");
  const allTime = stat(mining.data, "totalEthDeployed");
  const last24h = volume.length > 0 ? volume[volume.length - 1].v : null;

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Stats rail — USD rows light up the moment the price feed exists. */}
      <div className="rounded-[16px] border border-line-slate bg-gradient-to-br from-surface-active/40 via-panel to-bg px-6 py-3">
        <HeroStat
          label="Price"
          value={peaUsd === null ? "—" : fmtUsd(peaUsd)}
        />
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
        <HeroStat
          label="Max Supply"
          value={maxSupply === null ? "—" : fmtInt(maxSupply)}
        />
        <HeroStat label="Liquidity" value={usdAuto(m?.liquidityUsd)} />
        <HeroStat label="24h Trading Volume" value={usdAuto(m?.volume24hUsd)} />
        {/* USD, not ETH (user 2026-07-22): every other row in this rail is
            priced in dollars, and "Ξ 1016.6112" is 8 digits nobody reads at a
            glance. The ETH figure is real data, so it stays on hover rather
            than being dropped. Both fall back to "—" until the ETH price
            lands: the empty snapshot carries ethUsd 0, which would otherwise
            render a confident $0.00 on the rail's largest number. */}
        <HeroStat
          label="24h Deployed"
          value={
            last24h === null || ethUsd === null
              ? "—"
              : usdAuto(last24h * ethUsd)
          }
          hint={last24h === null ? undefined : `Ξ ${eth4(last24h)} deployed`}
        />
        <HeroStat
          label="All-Time Deployed"
          value={
            allTime === null || ethUsd === null
              ? "—"
              : usdAuto(allTime * ethUsd)
          }
          hint={allTime === null ? undefined : `Ξ ${eth4(allTime)} deployed`}
        />
      </div>
      {/* PEA/USD price chart, real GeckoTerminal OHLCV via /api/price-chart.
          Shows the awaiting state until the pair is indexed. */}
      <PriceChart />
    </div>
  );
}

// ─── Mining charts (stat cards + tables stay in MiningTab — already live) ────

/** Peapot points are the ONE non-daily series — keyed by roundId (API.md). */
interface PeapotPoint {
  roundId: number;
  pot: number;
  hit: boolean;
}

export const LiveMiningCharts = memo(function LiveMiningCharts() {
  const mining = useAnalyticsTab("mining");
  const env = mining.data;
  // Harvesting-APR series ships on the token tab (harvest rollup) — the 60s
  // client cache dedupes this with the Token tab's own fetch.
  const token = useAnalyticsTab("token");

  // Hundreds of one-round bars merge into a solid silhouette, which is what
  // the chart looked like: a filled triangle rather than a sawtooth. Sample
  // to ~90 bars so each is individually visible, and never drop a HIT, since
  // the hits are the whole point of the chart.
  const peapot = useMemo(() => {
    const raw = (env?.series?.peapot?.points ?? []) as unknown as PeapotPoint[];
    const MAX_BARS = 90;
    if (raw.length <= MAX_BARS) return raw;
    const step = Math.ceil(raw.length / MAX_BARS);
    return raw.filter((p, i) => p.hit || i % step === 0);
  }, [env]);
  const apr1d = seriesPointsOpt(token.data, "roasting", "apr1d");
  const apr7d = seriesPointsOpt(token.data, "roasting", "apr7d");
  const apr30d = seriesPointsOpt(token.data, "roasting", "apr30d");

  const volManual = seriesPoints(env, "deployVolume", "manual");
  const volAuto = seriesPoints(env, "deployVolume", "auto");
  const cntFull = seriesPoints(env, "deployCounts", "fullGrid");
  const cntPartial = seriesPoints(env, "deployCounts", "partial");
  const minersActive = seriesPoints(env, "miners", "active");
  const minersNew = seriesPoints(env, "miners", "new");
  const popularity = bucketRows<{ blockId: number; deploys: number }>(
    env,
    "blockPopularity",
  );
  const perDeploy = bucketRows<{ blocks: number; deploys: number }>(
    env,
    "blocksPerDeploy",
  );
  const dayLabels = volManual.map((p) => fmtDate(p.t));

  return (
    <>
      {/* Full-width sawtooth: the pot climbing each winner round, draining
          on hits (hit rounds render in white). */}
      <ChartCard
        title="Peapot Over Rounds"
        subtitle="The pot grows 0.1 PEA every round and has 1-in-333 odds of dropping to the winning tile"
      >
        {peapot.length > 0 ? (
          <BarChart
            labels={peapot.map((p) => `#${p.roundId}`)}
            series={[
              {
                name: "Peapot",
                color: C.accent,
                values: peapot.map((p) => (p.hit ? 0 : p.pot)),
              },
              {
                name: "Hit",
                color: C.fg,
                values: peapot.map((p) => (p.hit ? p.pot : 0)),
              },
            ]}
            yFmt={pea1}
            xTickEvery={Math.max(1, Math.floor(peapot.length / 12))}
            height={360}
            label="Peapot pot size accumulating and resetting across rounds"
          />
        ) : (
          <NoData />
        )}
      </ChartCard>
      <ChartCard
        title="Harvesting APR"
        subtitle="Harvest fees paid out to unharvested PEA, rolling 1D / 7D / 30D windows"
      >
        {hasPoints(apr1d, apr7d, apr30d) ? (
          <LineChart
            series={[
              { name: "1D", color: C.accent, points: apr1d },
              { name: "7D", color: C.fg, points: apr7d },
              { name: "30D", color: C.muted, points: apr30d },
            ]}
            yFmt={pct1}
            height={280}
            label="Harvesting APR over rolling 1-day, 7-day, and 30-day windows"
          />
        ) : (
          <NoData note="No harvesting yield yet." />
        )}
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="ETH Deployed per Day"
          subtitle="Manual vs AutoMiner deployments"
        >
          {hasPoints(volManual, volAuto) ? (
            <BarChart
              labels={dayLabels}
              series={[
                {
                  name: "Manual",
                  color: C.accent,
                  values: volManual.map((p) => p.v),
                },
                {
                  name: "AutoMiner",
                  color: C.fg,
                  values: volAuto.map((p) => p.v),
                },
              ]}
              yFmt={eth4}
              label="ETH deployed per day, manual versus AutoMiner"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
        <ChartCard
          title="Deploys per Day"
          subtitle="Full board (all 25 tiles) vs partial coverage"
        >
          {hasPoints(cntFull, cntPartial) ? (
            <BarChart
              labels={dayLabels}
              series={[
                {
                  name: "Full board",
                  color: C.accent,
                  values: cntFull.map((p) => p.v),
                },
                {
                  name: "Partial",
                  color: C.muted,
                  values: cntPartial.map((p) => p.v),
                },
              ]}
              yFmt={(v) => fmtInt(Math.round(v))}
              label="Deploy count per day, full-board versus partial"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
        <ChartCard
          title="Active Miners"
          subtitle="Unique wallets deploying per day"
        >
          {hasPoints(minersActive) ? (
            <LineChart
              series={[
                { name: "Active", color: C.accent, points: minersActive },
                { name: "New", color: C.fg, points: minersNew },
              ]}
              yFmt={(v) => fmtInt(Math.round(v))}
              label="Active and new miners per day"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
        <ChartCard
          title="Deploys per Tile"
          subtitle="How often each tile gets covered"
        >
          {popularity.length > 0 ? (
            <BarChart
              labels={popularity.map((b) => String(b.blockId + 1))}
              series={[
                {
                  name: "Deploys",
                  color: C.accent,
                  values: popularity.map((b) => b.deploys),
                },
              ]}
              yFmt={(v) => fmtInt(Math.round(v))}
              xTickEvery={2}
              label="Number of deploys covering each tile"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
      </div>
      <ChartCard
        title="Tiles per Deploy"
        subtitle="How many tiles miners cover in one deploy"
      >
        {perDeploy.length > 0 ? (
          <BarChart
            labels={perDeploy.map((b) => String(b.blocks))}
            series={[
              {
                name: "Deploys",
                color: C.accent,
                values: perDeploy.map((b) => b.deploys),
              },
            ]}
            yFmt={(v) => fmtInt(Math.round(v))}
            xTickEvery={2}
            label="Deploy count by number of tiles covered"
          />
        ) : (
          <NoData />
        )}
      </ChartCard>
    </>
  );
});

// ─── Buybacks ────────────────────────────────────────────────────────────────

interface BuybackRow {
  ethSpent?: number;
  peaReceived?: number;
  peaBurned?: number;
  txHash?: string;
  /** ISO timestamp — the backend names this `t`, same as its series points. */
  t?: string;
}

export const LiveBuybacksTab = memo(function LiveBuybacksTab() {
  const buyback = useAnalyticsTab("buyback");
  const financials = useAnalyticsTab("financials");

  const revenue = seriesPoints(financials.data, "revenue", "revenue");
  const spentDaily = seriesPoints(buyback.data, "buybacks", "ethSpent");
  const burnedCumulative = seriesCumulative(
    buyback.data,
    "buybacks",
    "peaBurned",
  );
  const rows = tableRows<BuybackRow>(buyback.data, "recentBuybacks");
  const pg = usePage(rows);

  const totalBurned = stat(buyback.data, "totalPeaBurned");
  const totalSpent = stat(buyback.data, "totalEthSpent");
  const count = stat(buyback.data, "buybackCount");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total PEA Burned"
          value={totalBurned === null ? "—" : `${fmtCompact(totalBurned)} PEA`}
          caption="Bought back and burned"
          accent
        />
        <StatCard
          title="Total Buyback Spend"
          value={totalSpent === null ? "—" : `Ξ ${eth4(totalSpent)}`}
          caption="Cumulative ETH spent"
        />
        <StatCard
          title="Buybacks Executed"
          value={count === null ? "—" : fmtInt(count)}
          caption="Open-market buys"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Protocol Revenue"
          subtitle="10% fee on deployed ETH, vaulted per day"
        >
          {hasPoints(revenue) ? (
            <LineChart
              series={[
                {
                  name: "Revenue",
                  color: C.accent,
                  points: revenue,
                  fill: true,
                },
              ]}
              yFmt={eth4}
              label="Daily protocol revenue in ETH"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
        <ChartCard
          title="Daily Buyback Spend"
          subtitle="ETH used to buy PEA on the open market"
        >
          {hasPoints(spentDaily) ? (
            <BarChart
              labels={spentDaily.map((p) => fmtDate(p.t))}
              series={[
                {
                  name: "Spent",
                  color: C.accent,
                  values: spentDaily.map((p) => p.v),
                },
              ]}
              yFmt={eth4}
              label="ETH spent on buybacks per day"
            />
          ) : (
            <NoData note="No buybacks yet." />
          )}
        </ChartCard>
      </div>
      <ChartCard
        title="Cumulative PEA Burned"
        subtitle="95% of bought back PEA is burned"
      >
        {hasPoints(burnedCumulative) ? (
          <LineChart
            series={[
              {
                name: "Burned",
                color: C.fg,
                points: burnedCumulative,
                fill: true,
              },
            ]}
            yFmt={pea1}
            label="Cumulative PEA burned"
          />
        ) : (
          <NoData note="No burns yet." />
        )}
      </ChartCard>
      <ChartCard
        title="Buyback Transactions"
        subtitle="Open-market buys, newest first"
      >
        {rows.length === 0 ? (
          <NoData note="No buybacks yet." />
        ) : (
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
                      ETH Spent
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      PEA Received
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      PEA Burned
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pg.slice.map((tx, i) => (
                    <tr key={tx.txHash ?? i}>
                      <td className={`${TD} !h-12`}>
                        {tx.t ? <RelTime at={Date.parse(tx.t)} /> : "—"}
                      </td>
                      <td className={`${TD} !h-12 tnum text-fg-body`}>
                        {tx.txHash ? (
                          <a
                            href={txUrl(tx.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={tx.txHash}
                            className="tnum text-fg-body underline-offset-2 transition hover:text-accent hover:underline focus-ring rounded-sm"
                          >
                            {`${tx.txHash.slice(0, 6)}...${tx.txHash.slice(-4)}`}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${TD} !h-12 text-right`}>
                        <ValueWithIcon
                          icon="eth"
                          value={eth4(tx.ethSpent ?? 0)}
                        />
                      </td>
                      <td className={`${TD} !h-12 text-right`}>
                        <ValueWithIcon
                          icon="pea"
                          value={pea1(tx.peaReceived ?? 0)}
                        />
                      </td>
                      <td className={`${TD} !h-12 text-right`}>
                        <ValueWithIcon
                          icon="pea"
                          value={pea1(tx.peaBurned ?? 0)}
                        />
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
        )}
      </ChartCard>
    </div>
  );
});

// ─── Token ───────────────────────────────────────────────────────────────────

const HOLDER_BUCKETS = ["0-10", "10-100", "100-1k", "1k-10k", "10k+"] as const;

interface HolderRowLive {
  rank: number;
  address: string;
  balance: number;
  pct: number;
  category: string | null;
  is_system: boolean;
  is_miner: boolean;
}

export const LiveTokenTab = memo(function LiveTokenTab() {
  const token = useAnalyticsTab("token");
  const financials = useAnalyticsTab("financials");

  const minted = seriesPoints(financials.data, "netEmissions", "minted");
  const net = seriesPoints(financials.data, "netEmissions", "net");
  const ma7 = seriesPoints(financials.data, "netEmissions", "ma7");
  const holdersBySize = bucketRows<{ bucket: string; holders: number }>(
    token.data,
    "holdersBySize",
  );
  // holderBreakdown points: { t, values: { "<bucket>": count } }
  const breakdownRaw = token.data?.series?.holderBreakdown?.points ?? [];
  const breakdownSeries = HOLDER_BUCKETS.map((bucket, i) => ({
    name: bucket,
    color: [C.accent, C.fg, C.muted, C.danger, C.accent][i],
    points: breakdownRaw.map((p) => ({
      t: Date.parse(`${p.t}T00:00:00Z`) || 0,
      v:
        Number((p.values as Record<string, number> | undefined)?.[bucket]) || 0,
    })),
  }));
  const holders = tableRows<HolderRowLive>(token.data, "topHolders");
  const pg = usePage(holders);
  const maxSupply = stat(token.data, "maxSupply");
  const totalHolders = stat(token.data, "totalHolders");
  // Token tab keeps the backend's own circulating figure. The hero rail
  // derives its from onchain total supply minus the lock, so if these two ever
  // disagree post-launch that is a real signal, not a display bug.
  const circulating = stat(token.data, "circulatingSupply");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Circulating Supply"
          value={circulating === null ? "—" : fmtInt(circulating)}
          caption="Circulating PEA"
        />
        <StatCard
          title="Max Supply"
          value={maxSupply === null ? "—" : fmtInt(maxSupply)}
          caption="Hard cap of PEA"
        />
        <StatCard
          title="Holders"
          value={totalHolders === null ? "—" : fmtInt(totalHolders)}
          caption="Wallets holding ≥0.01 PEA"
          accent
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="PEA Emissions"
          subtitle="Minted per day vs net of buyback burns (7-day mean)"
        >
          {hasPoints(minted) ? (
            <LineChart
              series={[
                { name: "Minted", color: C.accent, points: minted },
                { name: "Net", color: C.fg, points: net },
                { name: "7D mean", color: C.muted, points: ma7 },
              ]}
              yFmt={pea1}
              label="PEA minted and net emissions per day"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
        <ChartCard title="Holders by Size" subtitle="Wallets by PEA held">
          {holdersBySize.length > 0 ? (
            <BarChart
              labels={holdersBySize.map((h) => h.bucket)}
              series={[
                {
                  name: "Holders",
                  color: C.accent,
                  values: holdersBySize.map((h) => h.holders),
                },
              ]}
              yFmt={(v) => fmtInt(Math.round(v))}
              xTickEvery={1}
              label="Holder count by wallet-size bucket"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
      </div>
      <ChartCard
        title="Holders Over Time"
        subtitle="Wallet counts by size bucket, per day"
      >
        {breakdownRaw.length > 0 ? (
          <LineChart
            series={breakdownSeries}
            yFmt={(v) => fmtInt(Math.round(v))}
            label="Holder counts by bucket over time"
          />
        ) : (
          <NoData />
        )}
      </ChartCard>
      <ChartCard title="Top Holders" subtitle="Largest PEA balances">
        {holders.length === 0 ? (
          <NoData />
        ) : (
          <div>
            <TableScroller label="Top holders table">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">
                  Top PEA holders by balance
                </caption>
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
                      % of Supply
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pg.slice.map((r) => (
                    <tr key={r.rank}>
                      <td className={`${TD} !h-14 tnum text-fg-muted`}>
                        {r.rank}
                      </td>
                      <td className={`${TD} !h-14 tnum text-fg-body`}>
                        {shortAddr(r.address as Address)}
                      </td>
                      <td className={`${TD} !h-14`}>
                        {r.category ? (
                          <span className="inline-flex h-6 items-center rounded-full border border-line-slate px-2.5 text-[12px] font-medium text-fg-body">
                            {r.category}
                          </span>
                        ) : r.is_miner ? (
                          <span className="inline-flex h-6 items-center rounded-full border border-line-slate/60 px-2.5 text-[12px] font-medium text-fg-muted">
                            Miner
                          </span>
                        ) : null}
                      </td>
                      <td className={`${TD} !h-14 text-right`}>
                        <ValueWithIcon
                          icon="pea"
                          value={fmtTokenSmart(r.balance, 2)}
                        />
                      </td>
                      <td className={`${TD} !h-14 tnum text-right`}>
                        {r.pct.toFixed(2)}%
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
        )}
      </ChartCard>
    </div>
  );
});

// ─── Staking ─────────────────────────────────────────────────────────────────

interface StakerRowLive {
  rank: number;
  address: string;
  staked: number;
  pctOfStaked: number;
  daysStaked: number;
}

export const LiveStakingTab = memo(function LiveStakingTab() {
  const staking = useAnalyticsTab("staking");
  const yieldSeries = seriesPoints(staking.data, "yield", "distributed");
  const stakers = tableRows<StakerRowLive>(staking.data, "topStakers");
  const pg = usePage(stakers);

  const totalStaked = stat(staking.data, "totalStaked");
  const apr = stat(staking.data, "apr");
  const distributed = stat(staking.data, "totalYieldDistributed");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Staked"
          value={totalStaked === null ? "—" : `${fmtCompact(totalStaked)} PEA`}
          caption="In the staking pool"
        />
        <StatCard
          title="APR"
          value={apr === null ? "—" : pct1(apr)}
          caption="From the staker share of buybacks"
          accent
        />
        <StatCard
          title="Yield Distributed"
          value={distributed === null ? "—" : `${fmtCompact(distributed)} PEA`}
          caption="All-time to stakers"
        />
      </div>
      <ChartCard
        title="Yield Distributed"
        subtitle="PEA paid to stakers per day"
      >
        {hasPoints(yieldSeries) ? (
          <BarChart
            labels={yieldSeries.map((p) => fmtDate(p.t))}
            series={[
              {
                name: "Yield",
                color: C.accent,
                values: yieldSeries.map((p) => p.v),
              },
            ]}
            yFmt={pea1}
            label="PEA yield distributed per day"
          />
        ) : (
          <NoData note="No yield distributed yet." />
        )}
      </ChartCard>
      <ChartCard title="Top Stakers" subtitle="Largest PEA staking positions">
        {stakers.length === 0 ? (
          <NoData note="No stakers yet." />
        ) : (
          <div>
            <TableScroller label="Top stakers table">
              <table className="w-full min-w-[640px] border-collapse text-left">
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
                      % of Staked
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Days
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pg.slice.map((r) => (
                    <tr key={r.rank}>
                      <td className={`${TD} !h-14 tnum text-fg-muted`}>
                        {r.rank}
                      </td>
                      <td className={`${TD} !h-14 tnum text-fg-body`}>
                        {shortAddr(r.address as Address)}
                      </td>
                      <td className={`${TD} !h-14 text-right`}>
                        <ValueWithIcon
                          icon="pea"
                          value={fmtTokenSmart(r.staked, 2)}
                        />
                      </td>
                      <td className={`${TD} !h-14 tnum text-right`}>
                        {r.pctOfStaked.toFixed(2)}%
                      </td>
                      <td className={`${TD} !h-14 tnum text-right`}>
                        {fmtInt(r.daysStaked)}
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
        )}
      </ChartCard>
    </div>
  );
});

// ─── Miners (behaviour + lifetime leaderboard) ───────────────────────────────

interface TimingRow {
  second: number;
  bets: number;
  win_rate: number;
}
interface PnlRow {
  bucket: string;
  deploys: number;
  eth_deployed: number;
  eth_won: number;
  pnl: number;
}
interface TopMinerRow {
  rank: number;
  address: string;
  totalDeployedEth: number;
  roundsPlayed: number;
  roundsWon: number;
  winRatePct: number;
}

export const LiveMinersTab = memo(function LiveMinersTab() {
  const behaviour = useAnalyticsTab("behaviour");
  const mining = useAnalyticsTab("mining");

  const timing = bucketRows<TimingRow>(behaviour.data, "timing");
  const pnl = bucketRows<PnlRow>(behaviour.data, "blocksPnl");
  const miners = tableRows<TopMinerRow>(mining.data, "topMiners");
  const pg = usePage(miners);

  const totalBets = stat(behaviour.data, "totalBets");
  const winRate = stat(behaviour.data, "overallWinRate");
  const totalMiners = stat(mining.data, "totalMiners");
  const anyTiming = timing.some((r) => r.bets > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Deploys"
          value={totalBets === null ? "—" : fmtInt(totalBets)}
          caption="All-time deploy count"
        />
        <StatCard
          title="Win Rate"
          value={winRate === null ? "—" : pct1(winRate)}
          caption="Deploys covering the winning tile"
          accent
        />
        <StatCard
          title="Miners"
          value={totalMiners === null ? "—" : fmtInt(totalMiners)}
          caption="Unique wallets all-time"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Deploy Timing"
          subtitle="When in the 60s round miners place deploys"
        >
          {anyTiming ? (
            <BarChart
              labels={timing.map((r) => String(r.second))}
              series={[
                {
                  name: "Deploys",
                  color: C.accent,
                  values: timing.map((r) => r.bets),
                },
              ]}
              yFmt={(v) => fmtInt(Math.round(v))}
              xTickEvery={10}
              label="Deploys by second of the round"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
        <ChartCard
          title="P&L by Tiles Covered"
          subtitle="Realized ETH profit by tile-count bucket"
        >
          {pnl.length > 0 ? (
            <BarChart
              labels={pnl.map((b) => b.bucket)}
              series={[
                { name: "P&L", color: C.accent, values: pnl.map((b) => b.pnl) },
              ]}
              yFmt={eth4}
              xTickEvery={1}
              label="Realized ETH profit and loss by tiles-covered bucket"
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
      </div>
      <ChartCard title="Top Miners" subtitle="Lifetime deployers">
        {miners.length === 0 ? (
          <NoData />
        ) : (
          <div>
            <TableScroller label="Top miners table">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">
                  Top miners by lifetime ETH deployed
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      Rank
                    </th>
                    <th scope="col" className={TH}>
                      Wallet
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Deployed
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Rounds
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Wins
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Win %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pg.slice.map((r) => (
                    <tr key={r.rank}>
                      <td className={`${TD} !h-14 tnum text-fg-muted`}>
                        {r.rank}
                      </td>
                      <td className={`${TD} !h-14 tnum text-fg-body`}>
                        {shortAddr(r.address as Address)}
                      </td>
                      <td className={`${TD} !h-14 text-right`}>
                        <ValueWithIcon
                          icon="eth"
                          value={eth4(r.totalDeployedEth)}
                        />
                      </td>
                      <td className={`${TD} !h-14 tnum text-right`}>
                        {fmtInt(r.roundsPlayed)}
                      </td>
                      <td className={`${TD} !h-14 tnum text-right`}>
                        {fmtInt(r.roundsWon)}
                      </td>
                      <td className={`${TD} !h-14 tnum text-right`}>
                        {pct1(r.winRatePct)}
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
        )}
      </ChartCard>
    </div>
  );
});
