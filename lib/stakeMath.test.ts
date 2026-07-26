/**
 * Calculator math pins. The projection is SIMPLE interest by decision
 * (APR never APY, user 2026-07-17): a formula that quietly compounded
 * would overstate what holding still actually earns.
 */

import { describe, expect, it } from "vitest";
import { PROJECTION_WINDOWS, projectYield } from "@/lib/stakeMath";

describe("projectYield", () => {
  it("computes simple interest exactly", () => {
    // 100 PEA at 36.5% for 10 days = 100 x 0.365 x 10/365 = 1 PEA exactly.
    expect(projectYield(100, 36.5, 10)).toBeCloseTo(1, 12);
    // A full year returns the APR itself.
    expect(projectYield(100, 36.5, 365)).toBeCloseTo(36.5, 12);
  });

  it("scales linearly with the window, no compounding", () => {
    const one = projectYield(50, 500, 1);
    expect(projectYield(50, 500, 30)).toBeCloseTo(one * 30, 9);
    expect(projectYield(50, 500, 365)).toBeCloseTo(one * 365, 9);
  });

  it("returns 0 for anything unprojectable rather than NaN", () => {
    expect(projectYield(0, 500, 30)).toBe(0);
    expect(projectYield(-5, 500, 30)).toBe(0);
    expect(projectYield(100, 0, 30)).toBe(0);
    expect(projectYield(100, Number.NaN, 30)).toBe(0);
    expect(projectYield(100, 500, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("PROJECTION_WINDOWS", () => {
  it("keeps the four windows the chips render, 1Y last", () => {
    expect(PROJECTION_WINDOWS.map((w) => w.days)).toEqual([1, 7, 30, 365]);
  });
});
