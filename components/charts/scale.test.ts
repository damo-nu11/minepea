/**
 * Axis-scale pins. These exist because the helpers were written when every
 * series was order-1 or larger (round counts, ETH totals). Real price data is
 * sub-dollar, and the failures it triggers are silent: a chart still renders,
 * it just renders something untrue.
 */

import { describe, expect, it } from "vitest";
import { extent, niceTicks } from "@/components/charts/scale";

describe("extent", () => {
  it("pads a flat series proportionally, never into negative dollars", () => {
    // A young pool can report the same close for every candle in the window.
    // A fixed +/-1 pad turned a $0.00579 token into a [-1, 1] domain: a
    // negative price axis with the line flattened onto the zero gridline.
    const v = 0.00579;
    const [lo, hi] = extent([v, v, v]);
    expect(lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(v);
    expect(hi).toBeGreaterThan(v);
    const ticks = niceTicks(lo, hi);
    expect(ticks.every((t) => t >= 0)).toBe(true);
    // The axis must actually resolve the value, not collapse to one label.
    expect(new Set(ticks).size).toBeGreaterThan(1);
  });

  it("still pads a flat ZERO series by a unit, since 0 has no scale", () => {
    expect(extent([0, 0])).toEqual([-1, 1]);
  });

  it("leaves a normal range untouched", () => {
    expect(extent([2, 9, 4])).toEqual([2, 9]);
  });

  it("returns a usable domain for an empty series", () => {
    expect(extent([])).toEqual([0, 1]);
  });

  it("keeps large domains working (regression guard for non-price charts)", () => {
    const [lo, hi] = extent([1200, 8400]);
    expect([lo, hi]).toEqual([1200, 8400]);
    expect(niceTicks(lo, hi).length).toBeGreaterThan(1);
  });
});
