/**
 * Market-open math pins: exact epochs across DST (summer 13:30 UTC,
 * winter 14:30 UTC), the weekend skip, and the countdown format.
 */

import { describe, expect, it } from "vitest";
import {
  fmtOpenCountdown,
  nextMarketOpenMs,
} from "@/lib/stockpot/marketHours";

describe("nextMarketOpenMs", () => {
  it("same-day open before 9:30 ET in summer (13:30 UTC)", () => {
    // Tuesday 2026-07-28, 11:00 UTC = 7:00am EDT.
    expect(nextMarketOpenMs(Date.UTC(2026, 6, 28, 11, 0))).toBe(
      Date.UTC(2026, 6, 28, 13, 30),
    );
  });

  it("rolls to the next day once today's open has passed", () => {
    // Tuesday 18:00 UTC = 2:00pm EDT, market already open.
    expect(nextMarketOpenMs(Date.UTC(2026, 6, 28, 18, 0))).toBe(
      Date.UTC(2026, 6, 29, 13, 30),
    );
  });

  it("skips the weekend from Friday evening to Monday", () => {
    // Friday 2026-07-31, 20:00 UTC → Monday 2026-08-03.
    expect(nextMarketOpenMs(Date.UTC(2026, 6, 31, 20, 0))).toBe(
      Date.UTC(2026, 7, 3, 13, 30),
    );
  });

  it("winter open is 14:30 UTC (EST)", () => {
    // Tuesday 2026-12-01, 10:00 UTC = 5:00am EST.
    expect(nextMarketOpenMs(Date.UTC(2026, 11, 1, 10, 0))).toBe(
      Date.UTC(2026, 11, 1, 14, 30),
    );
  });
});

describe("fmtOpenCountdown", () => {
  it("hours format under a day, day-prefixed past it", () => {
    expect(fmtOpenCountdown(4 * 3_600_000 + 23 * 60_000 + 11_000)).toBe(
      "04:23:11",
    );
    expect(
      fmtOpenCountdown(2 * 86_400_000 + 17 * 3_600_000 + 23 * 60_000 + 11_000),
    ).toBe("2d 17:23:11");
    expect(fmtOpenCountdown(-5)).toBe("00:00:00");
  });
});
