/**
 * WheelBoard wiring pins: the rAF loop writes real transforms, mid-join
 * renders an in-flight frame, the ball lands in the parked winner and
 * announces, the flip is clock-anchored, and reduced motion skips the
 * spin. The spin MATH is pinned separately in lib/wheel.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WheelBoard } from "@/components/mine/WheelBoard";
import {
  BALL_REST_R,
  CX,
  CY,
  T_LANDED,
  TAU,
  wedgeCenterRad,
} from "@/lib/wheel/spin";
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
    <WheelBoard
      round={round}
      selected={new Set()}
      deployedTiles={[]}
      interactive={round.phase === "active"}
      onToggle={() => {}}
    />,
  );
}

describe("WheelBoard", () => {
  it("renders the full wheel: 25 pod buttons, the ball, the hub clock", () => {
    mount(fixtureRound({ phase: "active", winningTile: null }));
    expect(screen.getAllByLabelText(/^Pod \d+,/)).toHaveLength(25);
    expect(document.querySelector("[data-ball]")).not.toBeNull();
    expect(document.querySelector(".wheel-breathe")).not.toBeNull();
  });

  it("mid-join: mounting mid-spin writes a rotated wheel on the first frame", () => {
    mount(fixtureRound({ endsAt: Date.now() - 3000 }));
    pumpFrames(1);
    const wheel = document.querySelector("g[transform*='rotate']");
    expect(wheel).not.toBeNull();
    const deg = Number(wheel!.getAttribute("transform")!.match(/rotate\((-?[\d.]+)/)![1]);
    expect(deg).toBeGreaterThan(90); // well into the spin, not at rest
  });

  it("landing: past T_SETTLED the winner is parked at 6 o'clock with the ball seated", () => {
    mount(fixtureRound({ endsAt: Date.now() - 10_000, winningTile: 13 as TileId }));
    pumpFrames(2);
    const ball = document.querySelector("[data-ball]") as SVGGElement;
    const m = ball.getAttribute("transform")!.match(/translate\(([\d.]+) ([\d.]+)\)/)!;
    expect(Number(m[1])).toBe(CX);
    expect(Number(m[2])).toBeCloseTo(CY + BALL_REST_R, 0);
    const wheel = document.querySelector("g[transform*='rotate']")!;
    const deg = Number(wheel.getAttribute("transform")!.match(/rotate\((-?[\d.]+)/)![1]);
    const parked = (((wedgeCenterRad(13) + (deg * Math.PI) / 180) % TAU) + TAU) % TAU;
    expect(parked).toBeCloseTo(Math.PI, 1);
    expect(screen.getByText("Pod 14 wins the round.")).toBeInTheDocument();
  });

  it("drag sweep wraps the short way around 12 o'clock", () => {
    const onToggle = vi.fn();
    render(
      <WheelBoard
        round={fixtureRound({ phase: "active", winningTile: null })}
        selected={new Set()}
        deployedTiles={[]}
        interactive
        onToggle={onToggle}
      />,
    );
    const surface = document.querySelector(".touch-none") as HTMLElement;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 1048,
      right: 1000, bottom: 1048, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const at = (i: number) => {
      const a = (i + 0.5) * ((2 * Math.PI) / 25);
      return {
        clientX: 500 + 332.5 * Math.sin(a),
        clientY: 500 - 332.5 * Math.cos(a),
        pointerId: 1,
      };
    };
    // Pod 24 (index 23) swept to pod 2 (index 1): the short way crosses
    // 12 o'clock — pods 25, 1, 2 paint, never the long way round.
    fireEvent.pointerDown(surface, at(23));
    fireEvent.pointerMove(surface, at(1));
    expect(onToggle.mock.calls.map((c) => c[0])).toEqual([23, 24, 0, 1]);
    expect(onToggle.mock.calls.every((c) => c[1] === "add")).toBe(true);
  });

  it("ignite ring exists and expands at the landing (regression: art passes must not delete it)", () => {
    mount(fixtureRound({ endsAt: Date.now() - (T_LANDED + 200) }));
    pumpFrames(2);
    // WINNER_POCKET_Y = CY + (HUB_R + RIM_R) / 2 = 832.5 — unique to the ring.
    const ring = document.querySelector(
      'circle[cy="832.5"]',
    ) as SVGCircleElement;
    expect(ring).not.toBeNull();
    expect(Number(ring.getAttribute("r"))).toBeGreaterThan(40);
    expect(Number(ring.style.opacity)).toBeGreaterThan(0);
  });

  it("clock-anchored landed flip: announces even if no frame ever runs (hidden tab)", () => {
    vi.useFakeTimers();
    try {
      mount(fixtureRound({ endsAt: Date.now() - (T_LANDED + 500) }));
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.getByText("Pod 14 wins the round.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reduced motion: no spin, ball seated in the winner in place, announced", () => {
    reducedMotion = true;
    mount(fixtureRound({ endsAt: Date.now() }));
    const ball = document.querySelector("[data-ball]") as SVGGElement;
    const m = ball.getAttribute("transform")!.match(/translate\(([\d.]+) ([\d.]+)\)/)!;
    // Seated at the winner's canonical centroid (the wheel never moved).
    expect(Number(m[1])).not.toBe(CX);
    expect(screen.getByText("Pod 14 wins the round.")).toBeInTheDocument();
  });
});
