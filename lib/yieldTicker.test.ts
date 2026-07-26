/**
 * Ticker math pins. The honesty rules under test: closed-form display (a
 * hidden tab catches up exactly), truth always re-anchors, the rate runs
 * CONSERVATIVE so snaps land upward, and a downward truth (claim) is a
 * reset, never a rate.
 */

import { describe, expect, it } from "vitest";
import {
  anchorFromTruth,
  aprRatePerSec,
  ratePerSecFromDelta,
  TICK_RATE_FACTOR,
  tickedValue,
} from "@/lib/yieldTicker";

describe("tickedValue", () => {
  const anchor = { value: 5, atMs: 1_000_000, ratePerSec: 0.1 };

  it("is closed-form from the anchor and the clock", () => {
    expect(tickedValue(anchor, 1_000_000)).toBe(5);
    expect(tickedValue(anchor, 1_010_000)).toBeCloseTo(6, 12); // +10s
    // A tab hidden for a minute lands exactly where continuous ticking would.
    expect(tickedValue(anchor, 1_060_000)).toBeCloseTo(11, 12);
  });

  it("never runs backwards on a clock that does", () => {
    expect(tickedValue(anchor, 999_000)).toBe(5);
  });
});

describe("aprRatePerSec", () => {
  it("converts an APR to PEA per second exactly", () => {
    // 3153.6 PEA at 100% APR = 3153.6/365/86400 = 0.0001 PEA per second.
    expect(aprRatePerSec(3_153.6, 100)).toBeCloseTo(0.0001, 15);
  });

  it("is 0 for empty stakes or dead APR, never NaN", () => {
    expect(aprRatePerSec(0, 500)).toBe(0);
    expect(aprRatePerSec(100, 0)).toBe(0);
    expect(aprRatePerSec(Number.NaN, 500)).toBe(0);
  });
});

describe("ratePerSecFromDelta", () => {
  it("derives the observed rate between two readings", () => {
    const r = ratePerSecFromDelta(
      { value: 1, atMs: 0 },
      { value: 2, atMs: 20_000 },
    );
    expect(r).toBeCloseTo(0.05, 12);
  });

  it("a flat pool observes rate 0, which stops the ticking honestly", () => {
    expect(
      ratePerSecFromDelta({ value: 3, atMs: 0 }, { value: 3, atMs: 30_000 }),
    ).toBe(0);
  });

  it("a claim (value dropped) and a same-instant pair yield no rate", () => {
    expect(
      ratePerSecFromDelta({ value: 5, atMs: 0 }, { value: 0, atMs: 10_000 }),
    ).toBeNull();
    expect(
      ratePerSecFromDelta({ value: 1, atMs: 500 }, { value: 2, atMs: 500 }),
    ).toBeNull();
  });
});

describe("anchorFromTruth", () => {
  it("prefers the observed rate over the APR estimate", () => {
    const a = anchorFromTruth(
      { value: 1, atMs: 0 },
      { value: 2, atMs: 10_000 }, // observed 0.1/s
      1_000_000, // stake so large the APR rate would dwarf it
      1_000,
    );
    expect(a.ratePerSec).toBeCloseTo(0.1 * TICK_RATE_FACTOR, 12);
  });

  it("falls back to the APR rate until two readings exist", () => {
    const a = anchorFromTruth(null, { value: 5, atMs: 0 }, 3_153.6, 100);
    expect(a.ratePerSec).toBeCloseTo(0.0001 * TICK_RATE_FACTOR, 15);
    expect(a.value).toBe(5);
  });

  it("ticks conservatively: the factor is strictly below 1", () => {
    // Snaps must land UPWARD; a display that ticks past truth and corrects
    // downward reads as funds vanishing.
    expect(TICK_RATE_FACTOR).toBeLessThan(1);
    expect(TICK_RATE_FACTOR).toBeGreaterThan(0);
  });

  it("a claim resets the anchor to the new low value", () => {
    const a = anchorFromTruth(
      { value: 5, atMs: 0 },
      { value: 0, atMs: 10_000 }, // claim: observed is null
      100,
      500,
    );
    expect(a.value).toBe(0);
    // Rate falls back to APR, so ticking resumes from zero.
    expect(a.ratePerSec).toBeGreaterThan(0);
  });
});
