/**
 * PriceChart range-chip pins.
 *
 * The first version of this control computed "is this window available?" from
 * the ALREADY-SLICED series, so the test fed on its own output: selecting a
 * window shrank the measured span, which then disabled the longer chips, and
 * the selected chip could render as active and disabled at the same time.
 * Nothing caught it, so these pin the invariants rather than the arithmetic.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricePointWire } from "@/lib/prices/geckoTerminal";

const marketData = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/hooks/usePriceChart", () => ({
  usePriceChart: () => marketData.current,
  useMarketData: () => ({ data: undefined, status: "loading" }),
}));

import { PriceChart } from "@/components/explore/PriceChart";

const HOUR = 3_600_000;

/** `hours` hourly candles ending now. */
function series(hours: number): PricePointWire[] {
  const end = 1_800_000_000_000;
  return Array.from({ length: hours }, (_, i) => ({
    t: end - (hours - 1 - i) * HOUR,
    v: 0.005 + i * 1e-6,
  }));
}

function setData(points: PricePointWire[] | undefined) {
  marketData.current = {
    data: points,
    status: points ? "live" : "error",
    poolAddress: points ? "0xpool" : null,
  };
}

function chips() {
  return screen
    .getAllByRole("button")
    .filter((b) => /^(\d+D|ALL)$/.test(b.textContent ?? ""));
}

describe("PriceChart range chips", () => {
  beforeEach(() => setData(undefined));

  it("never renders the selected chip as disabled", () => {
    // Two days of data with a 30D default: the active chip must stay usable,
    // or it paints as selected and greyed out simultaneously.
    setData(series(48));
    render(<PriceChart />);
    const active = chips().find(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    expect(active).toBeDefined();
    expect(active).not.toBeDisabled();
  });

  it("always leaves ALL selectable when there is a chart", () => {
    setData(series(48));
    render(<PriceChart />);
    const all = chips().find((b) => b.textContent === "ALL");
    expect(all).toBeDefined();
    expect(all).not.toBeDisabled();
  });

  it("keeps every range clickable, even when the pool is younger than the window", () => {
    // 2 hours of history. Gating chips on available history left a freshly
    // listed token with only ALL clickable for days.
    setData(series(2));
    render(<PriceChart />);
    const cs = chips();
    expect(cs.length).toBe(3);
    for (const c of cs) expect(c).not.toBeDisabled();
  });

  it("describes the span it actually drew, not the one the chip claims", () => {
    setData(series(48));
    render(<PriceChart />);
    // 2 days of data under a 30D chip must not be announced as 30 days.
    const label = screen.getByLabelText(/PEA price over the last/i);
    expect(label.getAttribute("aria-label")).not.toMatch(/30 days/);
    expect(label.getAttribute("aria-label")).toMatch(/\b[12] days?\b/);
  });

  it("shows the awaiting state, not a chart, when there is no market", () => {
    setData(undefined);
    render(<PriceChart />);
    expect(screen.getByText(/Awaiting market listing/i)).toBeInTheDocument();
    for (const c of chips()) expect(c).toBeDisabled();
  });
});
