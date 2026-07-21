/**
 * Round-end reveal + stats-strip hover swaps (user spec 2026-07-13).
 *
 * - MineGrid: when a round settles with a winner, the 24 losers fade out
 *   one by one over ELIMINATION_MS (random order), then the winner lights
 *   up alone; a new active round clears everything. Winnerless rounds skip
 *   the animation.
 * - StatsStrip: hovering swaps captions in place — DEPLOYED ⇄ USD value,
 *   PEAPOT ⇄ USD value, TIME ⇄ round id (CSS group-hover: both spans are
 *   in the DOM, visibility toggled by class).
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MineGrid } from "@/components/mine/MineGrid";
import { StatsStrip } from "@/components/mine/StatsStrip";
import { toRoundVM } from "@/lib/mappers";
import type { RoundWire, TileId } from "@/lib/types";

function roundWire(overrides: Partial<RoundWire> = {}): RoundWire {
  return {
    roundId: 1234,
    startedAt: 1_900_000_000_000,
    endsAt: 1_900_000_060_000,
    phase: "active",
    tiles: Array.from({ length: 25 }, (_, id) => ({
      id: id as TileId,
      deployedWei: "100000000000000000", // 0.1 ETH
      minerCount: 3,
    })),
    totalDeployedWei: "2500000000000000000",
    motherlodePea: "10000000000000000000", // 10 PEA
    winningTile: null,
    winner: null,
    isSplit: false,
    ...overrides,
  };
}

const gridProps = {
  selected: new Set<TileId>(),
  deployedTiles: [] as TileId[],
  interactive: false,
  onToggle: () => {},
};

describe("MineGrid round-end reveal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const eliminatedCount = () =>
    document.querySelectorAll("[data-eliminated]").length;

  it("eliminates the 24 losers one by one, then reveals the winner", () => {
    const settling = toRoundVM(
      roundWire({ phase: "settling", winningTile: 7 as TileId }),
    );
    render(<MineGrid round={settling} {...gridProps} />);

    // Nothing eliminated at settle; winner not yet revealed.
    expect(eliminatedCount()).toBe(0);
    expect(screen.queryByLabelText(/winning tile/)).toBeNull();

    // Mid-animation: some (not all) losers are gone, and the winner must
    // NOT be lit yet — it lights up ALONE only after every loser fades.
    act(() => vi.advanceTimersByTime(2_600));
    const mid = eliminatedCount();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(24);
    expect(screen.queryByLabelText(/winning tile/)).toBeNull();

    // After the full window: all 24 losers out, winner lit, never eliminated.
    act(() => vi.advanceTimersByTime(2_800));
    expect(eliminatedCount()).toBe(24);
    const winner = screen.getByLabelText(/winning tile/);
    expect(winner).not.toHaveAttribute("data-eliminated");
  });

  it("clears the animation when the next round goes active — even mid-run", () => {
    const settling = toRoundVM(
      roundWire({ phase: "settling", winningTile: 7 as TileId }),
    );
    const { rerender } = render(<MineGrid round={settling} {...gridProps} />);
    // Swap rounds MID-animation while elimination timers are still pending —
    // this is what pins timer cleanup (at 6s every timer had already fired,
    // which made the old version of this assertion vacuous; review finding).
    act(() => vi.advanceTimersByTime(2_600));
    expect(eliminatedCount()).toBeGreaterThan(0);

    rerender(
      <MineGrid
        round={toRoundVM(roundWire({ roundId: 1235 }))}
        {...gridProps}
        interactive
      />,
    );
    expect(eliminatedCount()).toBe(0);
    expect(screen.queryByLabelText(/winning tile/)).toBeNull();
    // No stale timers fire into the new round.
    act(() => vi.advanceTimersByTime(10_000));
    expect(eliminatedCount()).toBe(0);
    expect(screen.queryByLabelText(/winning tile/)).toBeNull();
  });

  it("skips the animation entirely on a winnerless round", () => {
    const settling = toRoundVM(
      roundWire({ phase: "settling", winningTile: null }),
    );
    render(<MineGrid round={settling} {...gridProps} />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(eliminatedCount()).toBe(0);
    expect(screen.queryByLabelText(/winning tile/)).toBeNull();
  });
});

// ─── StatsStrip hover swaps ──────────────────────────────────────────────────

vi.mock("@/lib/hooks/useGame", () => ({
  useRound: () => ({
    data: toRoundVM(roundWire()),
    status: "live" as const,
  }),
  useRoundTimer: () => ({
    data: {
      remainingSec: 42,
      endsAt: 1_900_000_060_000,
      roundId: 1234,
      phase: "active" as const,
    },
    status: "live" as const,
  }),
  usePrices: () => ({
    data: {
      peaUsd: 12.5,
      peaUsdFormatted: "$12.50",
      ethUsd: 1800,
      ethUsdFormatted: "$1,800.00",
    },
    status: "live" as const,
  }),
}));

describe("StatsStrip caption hover swaps", () => {
  it("renders default captions plus hover twins with the USD/round values", () => {
    render(<StatsStrip />);

    // Default captions (PEAPOT replaces MOTHERLODE — user decision 2026-07-13).
    // group-hover variants are inert without a `.group` ancestor, so that
    // ancestor is the third leg of the pin (review finding: mutation-proven).
    for (const caption of ["Deployed", "Peapot", "Time"]) {
      expect(screen.getByText(caption)).toHaveClass("group-hover:hidden");
      expect(screen.getByText(caption).closest(".group")).not.toBeNull();
    }

    // Hover twins: 2.5 ETH × $1,800 and 10 PEA × $12.50; round id for TIME.
    expect(screen.getByText("≈$4,500.00")).toHaveClass("group-hover:inline");
    expect(screen.getByText("≈$125.00")).toHaveClass("group-hover:inline");
    expect(screen.getByText("Round #1,234")).toHaveClass("group-hover:inline");
  });
});
