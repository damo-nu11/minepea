/**
 * Ticker math pins. The honesty rules under test: closed-form display (a
 * hidden tab catches up exactly), truth always re-anchors, the rate runs
 * CONSERVATIVE so snaps land upward, and the rate is measured across a
 * rolling window — never a consecutive pair, which on a stepwise chain
 * value reads 0 inside a flat step (frozen display) and several times the
 * true rate across a step (sprint then downward snap).
 */

import { describe, expect, it } from "vitest";
import {
  anchorFromTruth,
  aprRatePerSec,
  FLAT_SPAN_MS,
  observedRate,
  pruneTruths,
  RATE_MIN_SPAN_MS,
  RATE_WINDOW_MS,
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

describe("observedRate", () => {
  it("measures the average rate across a window spanning distributions", () => {
    const r = observedRate([
      { value: 10, atMs: 0 },
      { value: 10.2, atMs: 30_000 },
      { value: 10.7, atMs: 70_000 },
    ]);
    expect(r).toBeCloseTo(0.01, 12); // 0.7 PEA over 70s
  });

  it("refuses a rate from a window too short to trust", () => {
    // A short window straddling ONE step reads several times the true
    // rate: the display would sprint, then snap DOWNWARD at the next
    // truth. That is noise, not a rate.
    const r = observedRate([
      { value: 1, atMs: 0 },
      { value: 2, atMs: RATE_MIN_SPAN_MS - 1_000 },
    ]);
    expect(r).toBeNull();
  });

  it("a briefly flat window is the gap between distributions, not a rate", () => {
    // Null (fall back to the APR rate, keep ticking) — NOT 0, which froze
    // the display every time two readings landed inside one flat step.
    const r = observedRate([
      { value: 3, atMs: 0 },
      { value: 3, atMs: FLAT_SPAN_MS - 10_000 },
    ]);
    expect(r).toBeNull();
  });

  it("a sustained flat window is a genuinely idle pool: rate 0", () => {
    const r = observedRate([
      { value: 3, atMs: 0 },
      { value: 3, atMs: FLAT_SPAN_MS + 10_000 },
    ]);
    expect(r).toBe(0);
  });

  it("yields nothing without two readings or on a decrease", () => {
    expect(observedRate([])).toBeNull();
    expect(observedRate([{ value: 1, atMs: 0 }])).toBeNull();
    expect(
      observedRate([
        { value: 5, atMs: 0 },
        { value: 4, atMs: 70_000 },
      ]),
    ).toBeNull();
  });
});

describe("pruneTruths", () => {
  it("drops readings older than the window, keeps the rest in order", () => {
    const now = 130_000;
    expect(
      pruneTruths(
        [
          { value: 1, atMs: now - RATE_WINDOW_MS - 1 },
          { value: 2, atMs: now - 30_000 },
          { value: 3, atMs: now },
        ],
        now,
      ),
    ).toEqual([
      { value: 2, atMs: now - 30_000 },
      { value: 3, atMs: now },
    ]);
  });
});

describe("anchorFromTruth", () => {
  it("prefers the observed window rate over the APR estimate", () => {
    const a = anchorFromTruth(
      0.1, // observed across the window
      { value: 2, atMs: 10_000 },
      1_000_000, // stake so large the APR rate would dwarf it
      1_000,
    );
    expect(a.ratePerSec).toBeCloseTo(0.1 * TICK_RATE_FACTOR, 12);
  });

  it("falls back to the APR rate while the window is untrusted", () => {
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
    // The component clears the window on a claim, so observed is null and
    // ticking resumes from zero at the APR rate.
    const a = anchorFromTruth(null, { value: 0, atMs: 10_000 }, 100, 500);
    expect(a.value).toBe(0);
    expect(a.ratePerSec).toBeGreaterThan(0);
  });
});
