/**
 * Explore v2 mock analytics — determinism + coherence pins (the plan-audit
 * invariants that keep cards, charts, and the engine world in agreement).
 */

import { describe, expect, it } from "vitest";
import {
  ANALYTICS_ANCHOR_MS,
  ANALYTICS_DAYS,
  buildAnalytics,
} from "@/lib/mock/analytics";

describe("mock analytics bundle", () => {
  it("is deterministic: same seed ⇒ identical bundle (hydration safety)", () => {
    const a = buildAnalytics(7);
    const b = buildAnalytics(7);
    expect(a).toEqual(b);
  });

  it("different seeds diverge", () => {
    expect(buildAnalytics(1).priceSeries).not.toEqual(
      buildAnalytics(2).priceSeries,
    );
  });

  it("supply ramp terminates EXACTLY at the engine's constants (audit pin)", () => {
    const a = buildAnalytics(7);
    expect(a.circulatingPea).toBe(468_000);
    expect(a.maxSupplyPea).toBe(3_000_000);
    expect(a.circulatingSeries[a.circulatingSeries.length - 1].v).toBe(468_000);
  });

  it("price series ends pinned near the engine's seed price", () => {
    const a = buildAnalytics(7);
    const last = a.priceSeries[a.priceSeries.length - 1].v;
    expect(last).toBeCloseTo(12.4, 5);
  });

  it("series are daily, anchored to the fixed epoch, oldest→newest", () => {
    const a = buildAnalytics(7);
    expect(a.priceSeries).toHaveLength(ANALYTICS_DAYS);
    expect(a.priceSeries[a.priceSeries.length - 1].t).toBe(ANALYTICS_ANCHOR_MS);
    for (let i = 1; i < a.priceSeries.length; i++) {
      expect(a.priceSeries[i].t - a.priceSeries[i - 1].t).toBe(86_400_000);
    }
  });

  it("burned PEA is cumulative (monotonic) and matches the headline total", () => {
    const a = buildAnalytics(7);
    for (let i = 1; i < a.burnedPeaCumulative.length; i++) {
      expect(a.burnedPeaCumulative[i].v).toBeGreaterThanOrEqual(
        a.burnedPeaCumulative[i - 1].v,
      );
    }
    // Burned = 95% of bought back (5% goes to stakers, not burned).
    expect(a.burnedPeaCumulative[a.burnedPeaCumulative.length - 1].v).toBeCloseTo(
      a.totalBuybackPea * 0.95,
      6,
    );
  });

  it("economy is coherent: ETH ~engine price, buyback a believable slice, supply grows (audit)", () => {
    const a = buildAnalytics(7);
    // ETH terminal ≈ the engine's $3,845 (not the old stale ~$1,800).
    // volume24h = deployedEth(last) × ethUsd(last); deployedEth(last) =
    // avgDeployedPerRoundEth × 1440 (the /1440 the bundle divides by).
    const ethTerminal = a.volume24hUsd / (a.avgDeployedPerRoundEth * 1440);
    expect(ethTerminal).toBeGreaterThan(3500);
    expect(ethTerminal).toBeLessThan(4100);
    // Buyback is a plausible fraction of supply, not 85%, and never
    // exceeds the market cap.
    expect(a.pctSupplyBoughtBack).toBeGreaterThan(5);
    expect(a.pctSupplyBoughtBack).toBeLessThan(45);
    expect(a.totalBuybackUsd).toBeLessThan(a.marketCapUsd);
    // Circulating supply GROWS toward 468k as mining emits, not shrinks.
    const first = a.circulatingSeries[0].v;
    const last = a.circulatingSeries[a.circulatingSeries.length - 1].v;
    expect(last).toBeGreaterThan(first);
    expect(last).toBeCloseTo(468_000, 0);
  });

  it("revenue tracks the 10% protocol fee on deployed volume (user 2026-07-14)", () => {
    const a = buildAnalytics(7);
    for (let i = 0; i < a.revenueUsdDaily.length; i += 17) {
      const ratio = a.revenueUsdDaily[i].v / a.volumeUsdDaily[i].v;
      expect(ratio).toBeGreaterThan(0.096);
      expect(ratio).toBeLessThan(0.104);
    }
  });

  it("top stakers form a ranked, descending leaderboard with positive stakes", () => {
    const a = buildAnalytics(7);
    expect(a.topStakers.length).toBe(42);
    a.topStakers.forEach((row, i) => {
      expect(row.rank).toBe(i + 1); // rank matches array order
      expect(row.stakedPea).toBeGreaterThan(0);
      if (i > 0) {
        // strictly non-increasing by staked amount
        expect(row.stakedPea).toBeLessThanOrEqual(a.topStakers[i - 1].stakedPea);
      }
    });
  });

  it("has enough buyback transactions to paginate (>12/page)", () => {
    expect(buildAnalytics(7).buybackTxs.length).toBe(60);
  });

  it("top holders form a ranked leaderboard with a treasury head", () => {
    const a = buildAnalytics(7);
    expect(a.topHolders.length).toBe(50);
    expect(a.topHolders[0].category).toBe("Treasury"); // rank 1 labelled
    expect(a.topHolders[0].pctOfTotal).toBeGreaterThan(15); // treasury-heavy
    a.topHolders.forEach((row, i) => {
      expect(row.rank).toBe(i + 1);
      expect(row.quantityPea).toBeGreaterThan(0);
      if (i > 0) {
        expect(row.quantityPea).toBeLessThanOrEqual(
          a.topHolders[i - 1].quantityPea,
        );
      }
    });
  });

  it("mining-tab series exist and refining-APY windows nest (30D smoother than 1D)", () => {
    const a = buildAnalytics(7);
    expect(a.peapotPaidDaily).toHaveLength(ANALYTICS_DAYS);
    expect(a.refiningApy1d).toHaveLength(ANALYTICS_DAYS);
    expect(a.refiningApy30d).toHaveLength(ANALYTICS_DAYS);
    // A trailing mean has strictly lower variance than its source.
    const variance = (xs: number[]) => {
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
    };
    const v1 = variance(a.refiningApy1d.map((p) => p.v));
    const v30 = variance(a.refiningApy30d.map((p) => p.v));
    expect(v30).toBeLessThan(v1);
  });

  it("peapot chart reflects the 0.1/round + 1-in-333 mechanic: sampled, peaks in the tens, resets", () => {
    const a = buildAnalytics(7);
    expect(a.peapotRounds.length).toBeGreaterThan(60); // ~80 sampled bars
    const peak = Math.max(...a.peapotRounds.map((p) => p.pot));
    // 0.1/round with 1-in-333 odds ⇒ a mean cycle of ~33 PEA, and the
    // longest of ~7 cycles peaks higher (measured 55-90 across seeds).
    expect(peak).toBeGreaterThan(25);
    expect(peak).toBeLessThan(400);
    // At least one drop between samples (a fire happened).
    const drops = a.peapotRounds.filter(
      (p, i) => i > 0 && p.pot < a.peapotRounds[i - 1].pot,
    );
    expect(drops.length).toBeGreaterThanOrEqual(1);
  });
});
