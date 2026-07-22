/**
 * Axis-scale pins. These exist because the helpers were written when every
 * series was order-1 or larger (round counts, ETH totals). Real price data is
 * sub-dollar, and the failures it triggers are silent: a chart still renders,
 * it just renders something untrue.
 */

import { describe, expect, it } from "vitest";
import {
  AXIS_FONT_PX,
  axisPadLeft,
  extent,
  niceTicks,
} from "@/components/charts/scale";

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

/**
 * The y gutter has clipped a leading glyph twice in production ("$280.00"
 * losing its "$", "15000.0%" rendering as "5000.0%"). That is not cosmetic:
 * the reader sees a different number. jsdom has no canvas, so measureText
 * returns nothing here and these pin the per-glyph ESTIMATE, which is exactly
 * the path that has to hold on the server and before the webfont loads.
 */
describe("axisPadLeft", () => {
  /** Labels are right-aligned, ending 8px inside the gutter. */
  const roomFor = (label: string) => axisPadLeft([label], AXIS_FONT_PX, 0) - 8;
  /** Conservative lower bound on real width: a third of an em per glyph. */
  const atLeast = (label: string) => label.length * AXIS_FONT_PX * 0.33;

  it("never returns less than the caller's floor", () => {
    expect(axisPadLeft(["0"], AXIS_FONT_PX, 46)).toBeGreaterThanOrEqual(46);
    expect(axisPadLeft([], AXIS_FONT_PX, 46)).toBe(46);
  });

  it("fits the labels that clipped in production", () => {
    expect(roomFor("15000.0%")).toBeGreaterThan(atLeast("15000.0%"));
    expect(roomFor("$280.00")).toBeGreaterThan(atLeast("$280.00"));
  });

  it("sizes to the widest label, not the last", () => {
    const wide = axisPadLeft(["0.0%", "15000.0%", "5000.0%"], AXIS_FONT_PX, 0);
    expect(wide).toBe(axisPadLeft(["15000.0%"], AXIS_FONT_PX, 0));
    expect(wide).toBeGreaterThan(axisPadLeft(["0.0%"], AXIS_FONT_PX, 0));
  });

  it("prices % wider than a digit", () => {
    // The old estimate charged % a digit's width, which is what came up short.
    expect(axisPadLeft(["100%"], AXIS_FONT_PX, 0)).toBeGreaterThan(
      axisPadLeft(["1000"], AXIS_FONT_PX, 0),
    );
  });

  it("scales with font size", () => {
    expect(axisPadLeft(["15000.0%"], 21, 0)).toBeGreaterThan(
      axisPadLeft(["15000.0%"], 10.5, 0),
    );
  });
});
