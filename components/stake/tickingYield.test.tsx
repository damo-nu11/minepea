/**
 * Ticker leaf pins: renders truth at fixed 6dp, actually ticks upward
 * between truths, and a claim (downward truth) snaps instantly. Chain
 * polling stays off (pollChain=false) so no network is involved.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TickingYield } from "./TickingYield";

const tickerText = () => screen.getByTitle(/live estimate/).textContent!;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TickingYield", () => {
  it("shows a dash while the position is unknown", () => {
    render(
      <TickingYield
        pendingYield={undefined}
        stakedPea={0}
        aprPct={null}
        address={null}
        pollChain={false}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the truth at a FIXED six decimals", () => {
    render(
      <TickingYield
        pendingYield={0.01}
        stakedPea={100}
        aprPct={null}
        address={null}
        pollChain={false}
      />,
    );
    // Fixed-width tail: trimming would jitter the columns while ticking.
    expect(tickerText()).toBe("0.010000");
  });

  it("ticks upward between truths at the conservative APR rate", () => {
    render(
      <TickingYield
        pendingYield={5}
        stakedPea={3_153.6} // 100% APR => 0.0001 PEA/s before the 0.9 factor
        aprPct={100}
        address={null}
        pollChain={false}
      />,
    );
    expect(tickerText()).toBe("5.000000");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // +10s at 0.00009/s (factored) = +0.0009
    expect(tickerText()).toBe("5.000900");
  });

  it("a claim snaps the display down instantly", () => {
    const { rerender } = render(
      <TickingYield
        pendingYield={5}
        stakedPea={3_153.6}
        aprPct={100}
        address={null}
        pollChain={false}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(tickerText()).toBe("5.000900");
    rerender(
      <TickingYield
        pendingYield={0}
        stakedPea={3_153.6}
        aprPct={100}
        address={null}
        pollChain={false}
      />,
    );
    expect(tickerText()).toBe("0.000000");
  });
});
