/**
 * Supply and valuation derivations.
 *
 * The pin that matters is the ordering one. Circulating supply is a subset of
 * total supply, so market cap can never exceed FDV. It did on screen
 * (2026-07-22: MARKET CAP $4.091M above FDV $3.981M) because the two were
 * computed from different prices, ours live and GeckoTerminal's from their
 * own snapshot. Any future "cross-check against the explorer" shortcut has to
 * fail here rather than in front of users.
 */

import { describe, expect, it } from "vitest";
import { supplyView } from "@/lib/hooks/usePriceChart";
import { LOCKED_SUPPLY_PEA } from "@/lib/prices/geckoTerminal";

const market = (over: Record<string, unknown> = {}) =>
  ({
    symbol: "PEA",
    totalSupply: 10419.73,
    fdvUsd: 3_925_000,
    marketCapUsd: null,
    volume24hUsd: 0,
    liquidityUsd: 0,
    ...over,
  }) as never;

describe("supplyView", () => {
  it("never reports a market cap above FDV, even when the feed's own FDV disagrees", () => {
    // fdvUsd here is deliberately STALE and low, the shape of the live bug.
    const v = supplyView(market({ fdvUsd: 1 }), 376.64);
    expect(v.marketCapUsd).not.toBeNull();
    expect(v.fdvUsd).not.toBeNull();
    expect(v.marketCapUsd!).toBeLessThanOrEqual(v.fdvUsd!);
  });

  it("prices both figures off the same quote and supply", () => {
    const price = 376.64;
    const v = supplyView(market(), price);
    expect(v.fdvUsd).toBeCloseTo(price * 10419.73, 6);
    expect(v.marketCapUsd).toBeCloseTo(
      price * (10419.73 - LOCKED_SUPPLY_PEA),
      6,
    );
  });

  it("subtracts the locked allocation from circulating supply", () => {
    const v = supplyView(market(), 100);
    expect(v.totalSupply).toBe(10419.73);
    expect(v.circulating).toBeCloseTo(10419.73 - LOCKED_SUPPLY_PEA, 6);
    // The lock is real, so the two figures must actually differ.
    expect(v.circulating!).toBeLessThan(v.totalSupply!);
  });

  it("never reports negative circulating supply", () => {
    // Guards the window where the locked constant outruns a stale supply read.
    const v = supplyView(market({ totalSupply: 1 }), 100);
    expect(v.circulating).toBe(0);
    expect(v.marketCapUsd).toBe(0);
  });

  it("returns nulls rather than zeros when the price is unknown", () => {
    const v = supplyView(market(), null);
    expect(v.marketCapUsd).toBeNull();
    expect(v.fdvUsd).toBeNull();
  });
});
