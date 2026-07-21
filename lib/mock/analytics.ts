/**
 * Seeded mock analytics for Explore v2 (reference/explore-v2-plan.md §2).
 * Pure + deterministic: same seed ⇒ identical bundle on server and client
 * (Convention 7 — the anchor is a fixed UTC constant, never a clock read).
 *
 * ONE bundle feeds every card, chart, and table on the page so headline
 * numbers and series can never contradict each other, and the scales are
 * anchored to the mock engine's world (PEA ≈ $12.4, circulating 468k,
 * max supply 3,000,000, a 10% protocol fee on deployed) so the page agrees
 * with the header tickers and the live Mining tables.
 *
 * Replaced at integration time by real series behind the same shape —
 * no component changes (the plan's Phase B/C seams).
 */

import { createRng, type Rng } from "@/lib/mock/rng";

export const ANALYTICS_ANCHOR_MS = Date.UTC(2026, 6, 13); // fixed epoch
const DAY_MS = 86_400_000;
export const ANALYTICS_DAYS = 180;

export interface TimePoint {
  t: number;
  v: number;
}
export interface PotPoint {
  round: number;
  pot: number;
  hit: boolean;
}
export interface BuybackTx {
  at: number;
  hash: string;
  pea: number;
  usd: number;
  price: number;
}
export interface TileShare {
  tile: number; // 1-25
  pct: number;
}
export interface BucketPnl {
  bucket: string; // "1", "2-5", ... "25"
  winRatePct: number;
  avgWinUsd: number;
  avgLoseUsd: number;
}
export interface StakerRow {
  rank: number;
  address: string; // 0x hex
  stakedPea: number;
  stakedUsd: number;
  pctOfTotal: number;
  diff1dPct: number;
  diff7dPct: number;
  diff30dPct: number;
}
export interface HolderRow {
  rank: number;
  address: string; // 0x hex
  category: string | null; // "Treasury" / "Staking Pool" / null
  quantityPea: number;
  valueUsd: number;
  pctOfTotal: number; // of circulating supply
  diff1dPct: number;
  diff7dPct: number;
  diff30dPct: number;
}

export interface AnalyticsBundle {
  // Hero
  priceSeries: TimePoint[]; // PEA/USD daily
  volumeUsdDaily: TimePoint[]; // ETH deployed valued in USD
  marketCapUsd: number;
  fdvUsd: number;
  circulatingPea: number;
  maxSupplyPea: number;
  volume24hUsd: number;
  allTimeDeployedUsd: number;
  // Buybacks
  revenueUsdDaily: TimePoint[];
  buybackUsdWeekly: TimePoint[];
  burnedPeaCumulative: TimePoint[];
  totalBuybackPea: number;
  totalBuybackUsd: number;
  pctSupplyBoughtBack: number;
  buybackTxs: BuybackTx[];
  // Token
  circulatingSeries: TimePoint[];
  mintPeaDaily: TimePoint[];
  burnPeaDaily: TimePoint[];
  netMintPeaDaily: TimePoint[];
  mcapFdvRatio: TimePoint[];
  holdersBySize: { bucket: string; holders: number }[];
  // Staking
  stakedPeaSeries: TimePoint[];
  stakedPctSeries: TimePoint[];
  stakingFlowWeekly: TimePoint[]; // signed
  apySeries: TimePoint[];
  totalStakedPea: number;
  totalStakedUsd: number;
  stakedPct: number;
  impliedApyPct: number;
  // Mining
  avgDeployedPerRoundEth: number;
  avgWinnersPerRound: number;
  peapotHitRatePct: number;
  avgWinnersSeries: TimePoint[];
  peapotRounds: PotPoint[];
  peapotPaidDaily: TimePoint[]; // PEA released when the peapot drops
  refiningApy1d: TimePoint[];
  refiningApy7d: TimePoint[];
  refiningApy30d: TimePoint[];
  // Miners
  autominePctSeries: TimePoint[];
  fullGridPctSeries: TimePoint[];
  autominePct: number;
  fullGridPct: number;
  avgMinersPerRound: number;
  tileDistribution: TileShare[];
  pnlByBucket: BucketPnl[];
  topStakers: StakerRow[];
  topHolders: HolderRow[];
}

/** Random walk of `n` daily points ending exactly at `end`. */
function walk(
  rng: Rng,
  n: number,
  start: number,
  end: number,
  vol: number,
  floor = 0,
): TimePoint[] {
  const raw: number[] = [start];
  for (let i = 1; i < n; i++) {
    const prev = raw[i - 1];
    raw.push(Math.max(floor, prev * (1 + rng.range(-vol, vol))));
  }
  // Blend the drift so the final point lands on `end` without a cliff.
  const drift = end - raw[n - 1];
  return raw.map((v, i) => ({
    t: ANALYTICS_ANCHOR_MS - (n - 1 - i) * DAY_MS,
    v: Math.max(floor, v + (drift * i) / (n - 1)),
  }));
}

function sum(points: TimePoint[]): number {
  return points.reduce((a, p) => a + p.v, 0);
}

function weekly(points: TimePoint[]): TimePoint[] {
  const out: TimePoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    out.push({ t: chunk[chunk.length - 1].t, v: sum(chunk) });
  }
  return out;
}

function hex(rng: Rng, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789abcdef"[rng.int(16)];
  return s;
}

export function buildAnalytics(seed: number): AnalyticsBundle {
  const rng = createRng(seed);
  const n = ANALYTICS_DAYS;

  // ── Price & volume (all terminals pinned to the engine/live world so the
  //    page can't contradict itself — audit) ──
  const priceSeries = walk(rng, n, 3.2, 12.4, 0.06, 0.5);
  // ETH ends at the engine's seed price (~$3,845) — the header ticker shows
  // live ETH in this range, so USD deploy figures must use it, not ~$1,800.
  const ethUsd = walk(rng, n, 3150, 3845, 0.02, 1500);
  // Deployed ETH/day sized so the derived buyback stays a believable
  // fraction of the ~$5.8M market cap (audit: was ~$1.2M/day → 85% of
  // supply bought back, buyback > mcap).
  const deployedEthDaily = walk(rng, n, 18, 45, 0.12, 8);
  const volumeUsdDaily = deployedEthDaily.map((p, i) => ({
    t: p.t,
    v: p.v * ethUsd[i].v,
  }));

  // ── Revenue → buybacks (real mechanic, user 2026-07-14): a 10% protocol
  //    fee on deployed ETH is vaulted as revenue; 100% of it buys back PEA
  //    on the open market. Of the bought-back PEA, 95% is burned and 5% is
  //    paid to stakers (so only 95% reduces supply). ──
  const revenueUsdDaily = volumeUsdDaily.map((p) => ({
    t: p.t,
    v: p.v * 0.1 * rng.range(0.97, 1.03),
  }));
  // 100% of vault revenue buys PEA.
  const buybackUsdDaily = revenueUsdDaily.map((p) => ({ t: p.t, v: p.v }));
  const buybackPeaDaily = buybackUsdDaily.map((p, i) => ({
    t: p.t,
    v: p.v / priceSeries[i].v,
  }));
  const buybackUsdWeekly = weekly(buybackUsdDaily);
  // Cumulative BURNED PEA is 95% of what's bought back (5% goes to stakers).
  let burnAcc = 0;
  const burnedPeaCumulative = buybackPeaDaily.map((p) => {
    burnAcc += p.v * 0.95;
    return { t: p.t, v: burnAcc };
  });
  const totalBuybackPea = sum(buybackPeaDaily); // total bought back (100%)
  const totalBuybackUsd = sum(buybackUsdDaily);

  // ── Supply: mint is 1.1 PEA/round (1 to the winning tile + 0.1 to the
  //    peapot) ≈ 1,584/day at 60s rounds, which EXCEEDS the burn, so
  //    circulating GROWS toward 468k. Only 95% of bought-back PEA is burned
  //    (5% goes to stakers, staying in supply) — user 2026-07-14. ──
  const mintPeaDaily = walk(rng, n, 1520, 1600, 0.04, 1200);
  const burnPeaDaily = buybackPeaDaily.map((p) => ({ t: p.t, v: p.v * 0.95 }));
  const netMintPeaDaily = mintPeaDaily.map((p, i) => ({
    t: p.t,
    v: p.v - burnPeaDaily[i].v,
  }));
  const circulatingPea = 468_000;
  const maxSupplyPea = 3_000_000;
  const circulatingSeries: TimePoint[] = new Array(n);
  let circ = circulatingPea;
  for (let i = n - 1; i >= 0; i--) {
    circulatingSeries[i] = { t: netMintPeaDaily[i].t, v: circ };
    circ -= netMintPeaDaily[i].v;
  }
  const price = priceSeries[n - 1].v;
  const marketCapUsd = price * circulatingPea;
  const fdvUsd = price * maxSupplyPea;
  const mcapFdvRatio = circulatingSeries.map((p) => ({
    t: p.t,
    v: p.v / maxSupplyPea,
  }));
  const pctSupplyBoughtBack =
    (totalBuybackPea / (circulatingPea + totalBuybackPea)) * 100;

  const holdersBySize = [
    { bucket: "1-10", holders: 2140 + rng.int(300) },
    { bucket: "10-100", holders: 980 + rng.int(160) },
    { bucket: "100-1K", holders: 235 + rng.int(60) },
    { bucket: "1K-10K", holders: 64 + rng.int(20) },
    { bucket: ">10K", holders: 7 + rng.int(5) },
  ];

  // ── Staking ──
  const stakedPctSeries = walk(rng, n, 21, 60, 0.03, 5).map((p) => ({
    t: p.t,
    v: Math.min(82, p.v),
  }));
  const stakedPeaSeries = stakedPctSeries.map((p, i) => ({
    t: p.t,
    v: (p.v / 100) * circulatingSeries[i].v,
  }));
  const stakingFlowWeekly = weekly(
    stakedPeaSeries.map((p, i) => ({
      t: p.t,
      v: i === 0 ? 0 : (p.v - stakedPeaSeries[i - 1].v) / 7,
    })),
  ).map((p) => ({ t: p.t, v: p.v * rng.range(0.8, 1.25) }));
  const apySeries = walk(rng, n, 24, 14.6, 0.05, 4);
  const totalStakedPea = stakedPeaSeries[n - 1].v;
  const stakedPct = stakedPctSeries[n - 1].v;

  // ── Mining ──
  const avgWinnersSeries = walk(rng, n, 150, 205, 0.06, 40);
  // Real mechanic (user 2026-07-18): the pot grows 0.1 PEA every round and
  // has a 1-in-333 chance of dropping to the winning tile. Simulate a long
  // stretch of rounds and SAMPLE ~80 points so the bars are individually
  // visible (600 raw rounds merged into a solid silhouette); with these
  // odds the pot peaks in the tens of PEA.
  const CHART_ROUNDS = 2500;
  const SAMPLES = 80;
  const potFull: PotPoint[] = [];
  let pot = rng.range(0, 30); // start mid-cycle
  for (let r = 0; r < CHART_ROUNDS; r++) {
    pot += 0.1;
    const hit = rng.chance(1 / 333);
    potFull.push({ round: r + 1, pot: Math.round(pot * 10) / 10, hit });
    if (hit) pot = 0;
  }
  const potStep = Math.floor(CHART_ROUNDS / SAMPLES);
  const peapotRounds: PotPoint[] = potFull.filter((_, i) => i % potStep === 0);

  // ── Peapot PEA paid out per day. A payout series may never outrun what
  //    the pot takes in: 0.1 PEA/round x 1,440 rounds/day = 144 PEA/day,
  //    arriving in ~4.3 drops of ~33 PEA (1-in-333 odds). Spiky, but that
  //    is the mean. Drawn from its OWN stream so this shape can change
  //    without shifting every series compiled after it. ──
  const potRng = createRng(seed ^ 0x9e3779b9);
  const dropsInADay = () => {
    // Knuth's Poisson sampler, lambda = 1440 rounds / 333.
    const L = Math.exp(-1440 / 333);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= potRng.next();
    } while (p > L);
    return k - 1;
  };
  const peapotPaidDaily: TimePoint[] = Array.from({ length: n }, (_, i) => {
    let paid = 0;
    for (let d = dropsInADay(); d > 0; d--) paid += potRng.range(10, 56);
    return {
      t: ANALYTICS_ANCHOR_MS - (n - 1 - i) * DAY_MS,
      v: Math.round(paid),
    };
  });

  // ── Refining APY: a spiky daily fee-yield with 7D/30D trailing means
  //    nested over it (30D smoothest), like the reference's 1D/7D/30D. ──
  const refiningApy1d = walk(rng, n, 65, 52, 0.16, 25).map((p) => ({
    t: p.t,
    v: Math.min(98, Math.max(25, p.v)),
  }));
  const rollMean = (pts: TimePoint[], w: number): TimePoint[] =>
    pts.map((p, i) => {
      const slice = pts.slice(Math.max(0, i - w + 1), i + 1);
      return { t: p.t, v: slice.reduce((s, x) => s + x.v, 0) / slice.length };
    });
  const refiningApy7d = rollMean(refiningApy1d, 7);
  const refiningApy30d = rollMean(refiningApy1d, 30);

  // ── Miners ──
  const autominePctSeries = walk(rng, n, 58, 84, 0.04, 30).map((p) => ({
    t: p.t,
    v: Math.min(95, p.v),
  }));
  const fullGridPctSeries = walk(rng, n, 30, 44, 0.05, 12).map((p) => ({
    t: p.t,
    v: Math.min(70, p.v),
  }));
  const tileDistribution: TileShare[] = Array.from({ length: 25 }, (_, i) => ({
    tile: i + 1,
    pct: +(4 + rng.range(-0.45, 0.45)).toFixed(2),
  }));
  const pnlByBucket: BucketPnl[] = [
    { bucket: "1", winRatePct: 4, avgWinUsd: 24.6, avgLoseUsd: -1.4 },
    { bucket: "2-5", winRatePct: 13, avgWinUsd: 17.8, avgLoseUsd: -3.2 },
    { bucket: "6-10", winRatePct: 33, avgWinUsd: 3.1, avgLoseUsd: -3.4 },
    { bucket: "11-15", winRatePct: 51, avgWinUsd: 1.9, avgLoseUsd: -2.3 },
    { bucket: "16-20", winRatePct: 72, avgWinUsd: 1.2, avgLoseUsd: -1.6 },
    { bucket: "21-24", winRatePct: 69, avgWinUsd: 0.8, avgLoseUsd: -1.9 },
    { bucket: "25", winRatePct: 21, avgWinUsd: 0.6, avgLoseUsd: -2.4 },
  ].map((b) => ({
    ...b,
    winRatePct: +(b.winRatePct * rng.range(0.92, 1.08)).toFixed(1),
  }));

  // ── Buyback transactions (newest first) ──
  const buybackTxs: BuybackTx[] = Array.from({ length: 60 }, (_, i) => {
    const pea = +rng.range(28, 92).toFixed(2);
    const px = +(price * rng.range(0.975, 1.025)).toFixed(2);
    return {
      at: ANALYTICS_ANCHOR_MS - i * 7_200_000 - rng.int(1_800_000),
      hash: `0x${hex(rng, 64)}`,
      pea,
      usd: +(pea * px).toFixed(2),
      price: px,
    };
  });

  // ── Top stakers leaderboard (mock; ranked desc by staked PEA) ──
  const topStakers: StakerRow[] = Array.from({ length: 42 }, (_, i) => {
    const frac = 0.085 * Math.pow(0.91, i) * rng.range(0.9, 1.1);
    const staked = Math.round(totalStakedPea * frac);
    const diff = (skipChance: number, lo: number, hi: number) =>
      rng.chance(skipChance) ? 0 : +rng.range(lo, hi).toFixed(2);
    return {
      rank: 0,
      address: `0x${hex(rng, 40)}`,
      stakedPea: staked,
      stakedUsd: Math.round(staked * price),
      pctOfTotal: (staked / totalStakedPea) * 100,
      diff1dPct: diff(0.45, -2, 3),
      diff7dPct: diff(0.4, -4, 8),
      diff30dPct: diff(0.3, -6, 18),
    };
  })
    .sort((a, b) => b.stakedPea - a.stakedPea)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  // ── Top holders leaderboard (mock; treasury-heavy head, long tail) ──
  const topHolders: HolderRow[] = Array.from({ length: 50 }, (_, i) => {
    const frac =
      i === 0 ? 0.22 : 0.065 * Math.pow(0.9, i) * rng.range(0.85, 1.15);
    const qty = Math.round(circulatingPea * frac);
    const diff = (skipChance: number, lo: number, hi: number) =>
      rng.chance(skipChance) ? 0 : +rng.range(lo, hi).toFixed(2);
    return {
      rank: 0,
      address: `0x${hex(rng, 40)}`,
      category: null as string | null,
      quantityPea: qty,
      valueUsd: Math.round(qty * price),
      pctOfTotal: (qty / circulatingPea) * 100,
      diff1dPct: diff(0.5, -2, 3),
      diff7dPct: diff(0.45, -4, 8),
      diff30dPct: diff(0.35, -6, 12),
    };
  })
    .sort((a, b) => b.quantityPea - a.quantityPea)
    .map((row, i) => ({
      ...row,
      rank: i + 1,
      category: i === 0 ? "Treasury" : i === 1 ? "Staking Pool" : null,
    }));

  return {
    priceSeries,
    volumeUsdDaily,
    marketCapUsd,
    fdvUsd,
    circulatingPea,
    maxSupplyPea,
    volume24hUsd: volumeUsdDaily[n - 1].v,
    allTimeDeployedUsd: sum(volumeUsdDaily),
    revenueUsdDaily,
    buybackUsdWeekly,
    burnedPeaCumulative,
    totalBuybackPea,
    totalBuybackUsd,
    pctSupplyBoughtBack,
    buybackTxs,
    circulatingSeries,
    mintPeaDaily,
    burnPeaDaily,
    netMintPeaDaily,
    mcapFdvRatio,
    holdersBySize,
    stakedPeaSeries,
    stakedPctSeries,
    stakingFlowWeekly,
    apySeries,
    totalStakedPea,
    totalStakedUsd: totalStakedPea * price,
    stakedPct,
    impliedApyPct: apySeries[n - 1].v,
    avgDeployedPerRoundEth: deployedEthDaily[n - 1].v / 1440,
    avgWinnersPerRound: avgWinnersSeries[n - 1].v,
    peapotHitRatePct: 100 / 333, // 1-in-333 design rate (0.30%)
    avgWinnersSeries,
    peapotRounds,
    peapotPaidDaily,
    refiningApy1d,
    refiningApy7d,
    refiningApy30d,
    autominePctSeries,
    fullGridPctSeries,
    autominePct: autominePctSeries[n - 1].v,
    fullGridPct: fullGridPctSeries[n - 1].v,
    avgMinersPerRound: avgWinnersSeries[n - 1].v / 0.9,
    tileDistribution,
    pnlByBucket,
    topStakers,
    topHolders,
  };
}

/** Shared singleton — seed matches the engine's shipped seed. */
export const ANALYTICS = buildAnalytics(7);
