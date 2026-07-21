/**
 * PlinkoBoard wiring pins: the rAF loop writes real transforms, mid-join
 * renders the correct frame, the landing announces, and reduced motion
 * skips the flight. The path MATH is pinned separately in lib/plinko.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlinkoBoard } from "@/components/mine/PlinkoBoard";
import { podX, T_LANDED } from "@/lib/plinko/path";
import type { RoundVM, TileId, TileVM } from "@/lib/types";

function fixtureRound(overrides: Partial<RoundVM>): RoundVM {
  const tiles: TileVM[] = Array.from({ length: 25 }, (_, i) => ({
    id: i as TileId,
    label: `#${i + 1}`,
    eth: 0.1 * (i % 5),
    ethFormatted: (0.1 * (i % 5)).toFixed(1),
    minerCount: i % 3,
  }));
  return {
    roundId: 500,
    phase: "settling",
    endsAt: Date.now(),
    winningTile: 13 as TileId,
    tiles,
    totalDeployedEth: 5,
    totalDeployedFormatted: "5",
    minerCount: 10,
    motherlodePea: 100,
    motherlodeFormatted: "100.0",
    roundIdFormatted: "#500",
    ...overrides,
  } as RoundVM;
}

let rafQueue: FrameRequestCallback[] = [];
function pumpFrames(n = 1) {
  for (let i = 0; i < n; i++) {
    const cbs = rafQueue;
    rafQueue = [];
    act(() => cbs.forEach((cb) => cb(performance.now())));
  }
}

let reducedMotion = false;

beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("prefers-reduced-motion") ? reducedMotion : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  reducedMotion = false;
  vi.unstubAllGlobals();
});

function mount(round: RoundVM) {
  return render(
    <PlinkoBoard
      round={round}
      selected={new Set()}
      deployedTiles={[]}
      interactive={round.phase === "active"}
      onToggle={() => {}}
    />,
  );
}

describe("PlinkoBoard", () => {
  it("renders the full board: 25 pod buttons, 7 peg rows, the stalk", () => {
    mount(fixtureRound({ phase: "active", winningTile: null }));
    expect(screen.getAllByLabelText(/^Pod \d+,/)).toHaveLength(25);
    expect(document.querySelectorAll("[data-peg]").length).toBeGreaterThan(70);
    expect(document.querySelector(".plinko-sway")).not.toBeNull();
  });

  it("mid-join: mounting mid-flight writes an in-flight pea transform on the first frame", () => {
    // Joined 3s after settle start — the pea is mid-field.
    mount(fixtureRound({ endsAt: Date.now() - 3000 }));
    pumpFrames(1);
    const peaG = document.querySelector("[data-pea]") as SVGGElement;
    expect(peaG).not.toBeNull();
    const tf = peaG.getAttribute("transform")!;
    expect(tf).toMatch(/translate\(/);
    expect(peaG.style.opacity).toBe("1");
  });

  it("landing: past T_SETTLED the pea rests dead-center in the winning pod and announces", () => {
    mount(fixtureRound({ endsAt: Date.now() - 10_000, winningTile: 13 as TileId }));
    pumpFrames(2);
    const peaG = document.querySelector("[data-pea]") as SVGGElement;
    const x = Number(peaG.getAttribute("transform")!.match(/translate\(([\d.]+)/)![1]);
    expect(x).toBe(podX(13));
    expect(screen.getByText("Pod 14 wins the round.")).toBeInTheDocument();
  });

  it("clock-anchored landed flip: announces even if no frame ever runs (hidden tab)", () => {
    vi.useFakeTimers();
    try {
      mount(fixtureRound({ endsAt: Date.now() - (T_LANDED + 500) }));
      // No pumpFrames at all — only the timeout path.
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.getByText("Pod 14 wins the round.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reduced motion: no flight, pea seated instantly, winner announced", () => {
    reducedMotion = true;
    mount(fixtureRound({ endsAt: Date.now() }));
    const peaG = document.querySelector("[data-pea]") as SVGGElement;
    const x = Number(peaG.getAttribute("transform")!.match(/translate\(([\d.]+)/)![1]);
    expect(x).toBe(podX(13));
    expect(peaG.style.opacity).toBe("1");
    expect(screen.getByText("Pod 14 wins the round.")).toBeInTheDocument();
  });
});
