/**
 * VineBoard wiring pins: the rAF loop writes real growth, mid-join
 * renders an in-flight vine, arrival ignites and announces, the flip is
 * clock-anchored, reduced motion skips the growth, and drag-paint
 * sweeps without skipping. The vine MATH is pinned in lib/vine.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VineBoard } from "@/components/mine/VineBoard";
import {
  compileVine,
  evaluate,
  strikeTimes,
  TILE_XY,
  VIEW_W,
  VIEW_X,
  VIEW_Y,
} from "@/lib/vine/grow";
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

// Every reveal frame is a pure function of (Date.now() - endsAt). These
// tests build endsAt from Date.now() and then read opacities after
// pumping a frame, so ANY wall-clock time that elapses between the two
// calls shifts the animation — and under parallel-suite load that gap
// can be 100ms+, which drifts a boundary-sensitive assertion off its
// mark and fails only on a busy machine. Freeze the clock so `elapsed`
// is exactly the offset the fixture chose, on any machine, every run.
const FIXED_NOW = 1_800_000_000_000;

beforeEach(() => {
  rafQueue = [];
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
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
  vi.restoreAllMocks();
});

function mount(round: RoundVM) {
  return render(
    <VineBoard
      round={round}
      selected={new Set()}
      deployedTiles={[]}
      interactive={round.phase === "active"}
      onToggle={() => {}}
    />,
  );
}

describe("VineBoard", () => {
  it("renders the full pentagon: 25 tile buttons, the peg field, the sprout", () => {
    mount(fixtureRound({ phase: "active", winningTile: null }));
    expect(screen.getAllByLabelText(/^Tile \d+,/)).toHaveLength(25);
    // Stud pegs: gradient bodies (incl. the 4 lime-tinted near the pea).
    const studs = document.querySelectorAll(
      "circle[fill='url(#vn-peg)'], circle[fill='url(#vn-peg-lit4)']",
    );
    expect(studs.length).toBeGreaterThan(100);
    expect(
      document.querySelectorAll("circle[fill='url(#vn-peg-lit4)']").length,
    ).toBe(4);
    // The board is a seated surface, not an outline.
    expect(
      document.querySelector("path[fill='url(#vn-surface)']"),
    ).not.toBeNull();
    expect(document.querySelector("[data-tip]")).not.toBeNull();
    expect(document.querySelector(".wheel-breathe")).not.toBeNull();
  });

  it("renders the bet surface itself: 25 tile faces and 25 numerals", () => {
    mount(fixtureRound({ phase: "active", winningTile: null }));
    // The tile faces carry the per-tile material gradient.
    expect(document.querySelectorAll("rect[fill^='url(#vn-tg']")).toHaveLength(
      25,
    );
    // Every tile shows its number (engraved copy + face = 2 nodes each).
    const numerals = [...document.querySelectorAll("text")].filter((t) =>
      /^\d+$/.test(t.textContent ?? ""),
    );
    expect(new Set(numerals.map((t) => t.textContent)).size).toBe(25);
  });

  it("selected and winner tiles get their own treatment on the face", () => {
    // Selected: surface-active fill plus the one permitted accent halo.
    render(
      <VineBoard
        round={fixtureRound({ phase: "active", winningTile: null })}
        selected={new Set([4 as TileId])}
        deployedTiles={[]}
        interactive
        onToggle={() => {}}
      />,
    );
    expect(
      document.querySelectorAll("rect[fill='var(--color-surface-active)']")
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      document.querySelectorAll("rect[filter='url(#vn-halo)']").length,
    ).toBeGreaterThanOrEqual(1);
    cleanup();

    // Winner: it LIGHTS UP without deleting its own material. The
    // emissive layer rides over the tile; the material gradient, the
    // occlusion and the engraving all survive, which is what keeps it a
    // lit block rather than a flat sticker.
    const g = compileVine(13, 500);
    mount(fixtureRound({ endsAt: Date.now() - (g.tLanded + 400) }));
    pumpFrames(2);
    const win = document.querySelector(
      "rect[fill='url(#vn-win)']",
    ) as SVGRectElement;
    expect(win).not.toBeNull();
    expect(Number(win.getAttribute("opacity"))).toBeGreaterThan(0.5);
    // All 25 faces still carry their material, the winner included.
    expect(document.querySelectorAll("rect[fill^='url(#vn-tg']")).toHaveLength(
      25,
    );
    expect(document.querySelectorAll("rect[fill^='url(#vn-ao']")).toHaveLength(
      25,
    );
  });

  it("mid-join: mounting mid-growth draws a partial vine with the tip in flight", () => {
    const g = compileVine(13, 500);
    mount(fixtureRound({ endsAt: Date.now() - (g.tLanded - 800) }));
    pumpFrames(1);
    const vine = document.querySelector(
      "path[stroke-dasharray]",
    ) as SVGPathElement;
    const offset = Number(vine.getAttribute("stroke-dashoffset"));
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(g.total);
    const tip = document.querySelector("[data-tip]") as SVGGElement;
    expect(tip.style.opacity).toBe("1");
  });

  it("arrival: past tLanded the winner announces and the tip has landed on the tile", () => {
    const g = compileVine(13, 500);
    mount(fixtureRound({ endsAt: Date.now() - (g.tLanded + 400) }));
    pumpFrames(2);
    expect(screen.getByText("Tile 14 wins the round.")).toBeInTheDocument();
    const tip = document.querySelector("[data-tip]") as SVGGElement;
    // It lands on the tile's EDGE and sinks in, never resting on the
    // numeral at the centre.
    const m = tip
      .getAttribute("transform")!
      .match(/translate\(([\d.]+) ([\d.]+)\)/)!;
    const end = g.verts[g.verts.length - 1];
    expect(
      Math.hypot(Number(m[1]) - end[0], Number(m[2]) - end[1]),
    ).toBeLessThanOrEqual(11); // at most the sink distance
    expect(
      Math.hypot(Number(m[1]) - TILE_XY[13][0], Number(m[2]) - TILE_XY[13][1]),
    ).toBeGreaterThan(18); // clear of the numeral
  });

  it("clock-anchored landed flip: announces even if no frame ever runs (hidden tab)", () => {
    const g = compileVine(13, 500);
    vi.useFakeTimers();
    try {
      mount(fixtureRound({ endsAt: Date.now() - (g.tLanded + 500) }));
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(screen.getByText("Tile 14 wins the round.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reduced motion: no growth, and it rests on the animated end state", () => {
    reducedMotion = true;
    const g = compileVine(13, 500);
    mount(fixtureRound({ endsAt: Date.now() }));
    expect(screen.getByText("Tile 14 wins the round.")).toBeInTheDocument();
    // Wheel-parity rule: same rest state a motion user sees.
    const vine = document.querySelector(
      "path[stroke-dasharray]",
    ) as SVGPathElement;
    expect(vine.getAttribute("stroke-dashoffset")).toBe("0");
    expect(Number(vine.getAttribute("stroke-dasharray"))).toBeCloseTo(
      g.total,
      0,
    );
    expect(
      (document.querySelector("[data-tip]") as SVGGElement).style.opacity,
    ).toBe("0");
    for (const pegIdx of g.hits) {
      const el = document.querySelectorAll(
        "circle[fill='var(--color-accent)']",
      )[pegIdx] as SVGCircleElement;
      expect(Number(el.style.opacity || "0")).toBe(0);
    }
  });

  it("strike lights: pegs flare as the vine passes and decay back, on compiled times", () => {
    const g = compileVine(13, 500);
    const times = strikeTimes(g);
    // Join just after the FIRST peg is struck: it burns, later ones dark.
    mount(fixtureRound({ endsAt: Date.now() - (times[0] + 40) }));
    pumpFrames(1);
    const flare = (pegIdx: number) => {
      const el = document.querySelectorAll(
        "circle[fill='var(--color-accent)']",
      )[pegIdx] as SVGCircleElement | undefined;
      return el ? Number(el.style.opacity || "0") : -1;
    };
    // Near the flare's 0.5 peak: assert "clearly lit", not an exact frame
    // value, so a few ms of scheduling drift can never tip it.
    expect(flare(g.hits[0])).toBeGreaterThan(0.4);
    expect(flare(g.hits[g.hits.length - 1])).toBe(0);
    cleanup();

    // Well past every strike AND past the arrival's own light, the field
    // is dark again.
    mount(fixtureRound({ endsAt: Date.now() - (g.tLanded + 700) }));
    pumpFrames(2);
    for (const pegIdx of g.hits) expect(flare(pegIdx)).toBe(0);
  });

  it("brush light: tiles near the pea lift, yours lift harder, all clear on landing", () => {
    const g = compileVine(13, 500);
    // Deploy on the tile the vine passes closest to, mid-flight.
    const mid = evaluate(g, g.tLanded * 0.6);
    let nearest = 0;
    let nd = Infinity;
    for (let i = 0; i < 25; i++) {
      if (i === 13) continue;
      const d = Math.hypot(mid.tipX - TILE_XY[i][0], mid.tipY - TILE_XY[i][1]);
      if (d < nd) {
        nd = d;
        nearest = i;
      }
    }
    const brushOf = (i: number) =>
      Number(
        (
          document.querySelectorAll(
            "rect[stroke='var(--color-accent)'][stroke-width='5']",
          )[i] as SVGRectElement
        )?.getAttribute("opacity") ?? "0",
      );

    render(
      <VineBoard
        round={fixtureRound({ endsAt: Date.now() - g.tLanded * 0.6 })}
        selected={new Set()}
        deployedTiles={[nearest as TileId]}
        interactive={false}
        onToggle={() => {}}
      />,
    );
    pumpFrames(1);
    // A deployed tile within reach reacts; the far side of the board does not.
    if (nd < 155) expect(brushOf(nearest)).toBeGreaterThan(0);
    const far = (nearest + 12) % 25;
    expect(brushOf(far)).toBe(0);
    cleanup();

    // Past the landing every brush light is out — it must never compete
    // with the winner.
    mount(fixtureRound({ endsAt: Date.now() - (g.tLanded + 300) }));
    pumpFrames(2);
    for (let i = 0; i < 25; i++) expect(brushOf(i)).toBe(0);
  });

  it("arrival impact: tile-shaped waves, the tile recoils, the board catches light", () => {
    const g = compileVine(13, 500);
    mount(fixtureRound({ endsAt: Date.now() - (g.tLanded + 40) }));
    pumpFrames(1);
    // Two waves, in the TILE's shape (rects), expanded past the tile.
    const waveEls = () => [...document.querySelectorAll("[data-wave]")];
    const live = waveEls().filter(
      (r) => Number(r.getAttribute("opacity") ?? "0") > 0.05,
    );
    expect(live.length).toBeGreaterThanOrEqual(1);
    // Expanded past the tile's own 72 units, and still a RECT (the
    // board's shape language), not a circle.
    expect(live.some((r) => Number(r.getAttribute("width")) > 72)).toBe(true);
    expect(
      document.querySelector("circle[stroke='var(--color-accent)']"),
    ).toBeNull();
    // The winning tile takes the hit: it is scaled up (recoiling). Match
    // any recoil frame, not one specific scale, so drift within the
    // 220ms recoil window cannot lose it.
    const slot = [...document.querySelectorAll("g")].find((n) =>
      /scale\(1\.\d/.test(n.style.transform ?? ""),
    );
    expect(slot).toBeDefined();
    cleanup();

    // Well past the impact everything has settled back.
    mount(fixtureRound({ endsAt: Date.now() - (g.tSettled + 600) }));
    pumpFrames(2);
    expect(
      waveEls().every((r) => Number(r.getAttribute("opacity") ?? "0") === 0),
    ).toBe(true);
    expect(
      [...document.querySelectorAll("g")].every(
        (n) => !/scale\(/.test(n.style.transform ?? ""),
      ),
    ).toBe(true);
  });

  it("mounting past the celebration pins the rest state, not a blank board", () => {
    const g = compileVine(13, 500);
    // The dead window the audit found: past tSettled+800, still settling.
    mount(fixtureRound({ endsAt: Date.now() - (g.tSettled + 1200) }));
    pumpFrames(1);
    const vine = document.querySelector(
      "path[stroke-dasharray]",
    ) as SVGPathElement;
    expect(vine.getAttribute("stroke-dashoffset")).toBe("0"); // full vine
    expect(vine.getAttribute("d")).not.toBe("");
    const tip = document.querySelector("[data-tip]") as SVGGElement;
    expect(tip.style.opacity).toBe("0"); // tip absorbed
    expect(screen.getByText("Tile 14 wins the round.")).toBeInTheDocument();
  });

  it("a settling round with no winner yet clears the previous reveal", () => {
    // A live backend can replace one settling snapshot with ANOTHER
    // round's settling snapshot whose VRF has not landed. That path
    // never passes through an active phase, so the reset effect has to
    // be the reveal's complement, not the complement of `settling`.
    const g = compileVine(13, 500);
    const view = render(
      <VineBoard
        round={fixtureRound({ endsAt: Date.now() - (g.tLanded + 400) })}
        selected={new Set()}
        deployedTiles={[]}
        interactive={false}
        onToggle={() => {}}
      />,
    );
    pumpFrames(2);
    expect(
      (
        document.querySelector("path[stroke-dasharray]") as SVGPathElement
      ).getAttribute("d"),
    ).not.toBe("");

    view.rerender(
      <VineBoard
        round={fixtureRound({
          roundId: 501,
          phase: "settling",
          winningTile: null,
        })}
        selected={new Set()}
        deployedTiles={[]}
        interactive={false}
        onToggle={() => {}}
      />,
    );
    const vine = document.querySelector(
      "path[stroke-dasharray]",
    ) as SVGPathElement;
    expect(vine.getAttribute("d")).toBe(""); // stale winner path gone
    // No loser is left dimmed, and the pea is back at the sprout.
    const dimmed = [...document.querySelectorAll("g")].filter(
      (n) => n.style.opacity === "0.25",
    );
    expect(dimmed).toHaveLength(0);
    expect(screen.queryByText(/wins the round/)).toBeNull();
  });

  it("the vine is masked at the winning tile so the numeral stays readable", () => {
    const g = compileVine(13, 500);
    mount(fixtureRound({ endsAt: Date.now() - (g.tLanded + 400) }));
    pumpFrames(2);
    const vine = document.querySelector(
      "path[stroke-dasharray]",
    ) as SVGPathElement;
    // The mask now wraps all four vine layers as a group.
    expect(vine.closest("g[mask]")?.getAttribute("mask")).toBe(
      "url(#vn-vinemask)",
    );
    // The mask punches the winning tile out of the vine's paint.
    const hole = document.querySelector("mask#vn-vinemask rect[fill='#000']");
    expect(hole).not.toBeNull();
    // Inset by 2 so the cut lands ON the tile face rather than several
    // units outside it, which used to leave the vine unterminated.
    expect(Number(hole!.getAttribute("x"))).toBeCloseTo(
      TILE_XY[13][0] - 36 + 2,
      0,
    );

    // No winner yet: nothing to mask.
    cleanup();
    mount(fixtureRound({ phase: "active", winningTile: null }));
    expect(document.querySelector("g[mask]")).toBeNull();
    expect(document.querySelector("mask#vn-vinemask")).toBeNull();
  });

  it("drag-paint sweeps tiles without skipping along an edge", () => {
    const onToggle = vi.fn();
    render(
      <VineBoard
        round={fixtureRound({ phase: "active", winningTile: null })}
        selected={new Set()}
        deployedTiles={[]}
        interactive
        onToggle={onToggle}
      />,
    );
    const surface = document.querySelector(
      "[data-board-surface]",
    ) as HTMLElement;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // The board renders a cropped window of the 1000-unit space, so client
    // coords are the INVERSE of that mapping — not raw board coords.
    const at = (i: number) => ({
      clientX: ((TILE_XY[i][0] - VIEW_X) / VIEW_W) * 1000,
      clientY: ((TILE_XY[i][1] - VIEW_Y) / VIEW_W) * 1000,
      pointerId: 1,
    });
    // One fast move from tile 1 to tile 3 (same edge) must paint tile 2.
    fireEvent.pointerDown(surface, at(0));
    fireEvent.pointerMove(surface, at(2));
    const ids = onToggle.mock.calls.map((c) => c[0]);
    expect(ids).toContain(0);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(onToggle.mock.calls.every((c) => c[1] === "add")).toBe(true);
  });
});
