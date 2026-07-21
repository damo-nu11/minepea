"use client";

/**
 * THE Mine board, rendered unconditionally by MinePage at "/" (2026-07-19,
 * user decision: the pentagon replaced the 5x5 grid; the grid, wheel and
 * plinko boards are retired — kept on disk, imported by nothing).
 *
 * Anatomy (unit space 1000x1000):
 * - THE RING: 25 tilted tiles riding the five edges of a point-up
 *   pentagon (5 per edge, numbered 1..25 clockwise from the top-right
 *   edge) — the bet surface, in the square grid's visual language:
 *   rounded near-black tiles, hairline lime borders, upright tnum
 *   numerals.
 * - THE FIELD: a staggered peg lattice fills the pentagon's interior,
 *   quiet structure below line-slate brightness. At the center a
 *   sprout stands with the pea glowing at its base.
 * - THE REVEAL: the sprout charges for a beat, then the vine grows —
 *   peg-walking outward with seeded wander toward the winning tile,
 *   the pea riding its tip, each struck peg lighting as it passes.
 *   On arrival the tile floods lime (flash + expanding ring) and the
 *   losers ripple out around the pentagon.
 *
 * LIGHT RULE: the lit things are the selection, the winner, and the
 * pea with its growing vine trail (the reveal's own light). Everything
 * else — pegs (body #1C2404) and tiles at rest (material to #10140A,
 * border line-slate) — stays at or under line-slate brightness, and no
 * accent element sits above 0.5 opacity outside those states. The
 * SPROUT is the bounded exception: it is lit BY the pea through the
 * vn-plantlit radial, so its stem runs bright near the pea and falls to
 * roughly a third of line-slate at the leaf tips. That is the pea's own
 * light spilling onto what it touches, not a fourth light source — do
 * not "correct" it to line-slate, and do not let it out-shine the pea.
 *
 * MATERIALITY (user spec 2026-07-19, exact numbers; the tile
 * material went NEUTRAL black on 2026-07-19 pm — the user's rest state
 * is "premium black per block", and lime belongs to selection and the
 * winner alone, so the crowd-heat wash was deleted and the hairline is
 * white-0.08 instead of lime): tiles are a
 * 3-stop vertical material (#10140A/#0C0F06/#080A04) lit from
 * PAGE-above (each gradient axis counter-rotated out of the tile's
 * rotation), with a 1px white-0.07 catchlight on the light-facing
 * edge, a two-layer cast shadow, lower-corner AO to black-0.25, and
 * engraved numerals (near-black copy 1px up, face weight 300 muted /
 * 700 white backlit-lime when selected). Pegs are watch-stud spheres
 * (upper-left catchlight, #1C2404→#0D1101 body, under-shadow, 0.9→0.45
 * center-to-rim falloff, two sizes by row, the 4 nearest the pea
 * lime-tinted); a strike flares accent 0.5 with a tight glow then
 * decays back. The pentagon itself is a surface (#0A0B05→#060704)
 * seated with blurred shadows, never outlined. The pea stays the
 * brightest thing at rest.
 *
 * Every frame comes from lib/vine/grow.ts as a pure function of
 * (now - endsAt); per-frame writes are imperative via refs (React style
 * props would be clobbered by the ~3/s engine re-renders). The landed
 * flip is CLOCK-ANCHORED via setTimeout (hidden tabs suspend rAF).
 * Static geometry is a module-scope table. Reduced motion skips the
 * growth: the winner ignites in place, announced via the live region.
 *
 * Known gap on the live board: the mobile bet pad is not built yet
 * (load-bearing at small widths per the moodboard).
 *
 * Input: pointer hits resolve to the nearest tile within a generous
 * radius, drag-paint sweeps the pointer's whole path so fast drags
 * cannot skip tiles, pointer capture holds the gesture; deployed is
 * byte-identical to selected (user decree); hover lifts the tile
 * outward a half-step; keyboard = roving tabindex around the ring
 * (arrows orbit, Home/End jump) with deployed/winner state in the
 * labels.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { PeaGradientDef, PeaSprite } from "@/components/mine/peaArt";
import {
  BOARD_W,
  compileVine,
  CX,
  CY,
  evaluate,
  N_TILES,
  PEGS,
  PEA_R,
  SPROUT_X,
  SPROUT_Y,
  PENT_V,
  strikeTimes,
  TILE_ROT,
  TILE_W,
  TILE_XY,
  VIEW_W,
  VIEW_X,
  VIEW_Y,
} from "@/lib/vine/grow";
import type { RoundVM, TileId } from "@/lib/types";

interface VineBoardProps {
  round: RoundVM;
  selected: Set<TileId>;
  deployedTiles: TileId[];
  interactive: boolean;
  onToggle(id: TileId, forceOp?: "add" | "remove"): void;
}

const N = N_TILES;
/** Pointer hit radius around each tile center. */
const HIT_R = 52;
/** Loser ripple: how long the wave takes to cross the whole board. */
const RIPPLE_SPAN_MS = 520;
/** The beat the impact gets alone before the board answers it. */
const RIPPLE_LEAD_MS = 60;
/** The board's edge language, matched to the sidebar cards: their border
 * is line-slate at 55% all round with an accent top edge at 22%. */
const TILE_EDGE =
  "color-mix(in srgb, var(--color-line-slate) 55%, transparent)";
const TILE_TOP_EDGE =
  "color-mix(in srgb, var(--color-accent) 22%, transparent)";
/** The wet growing point is fully out this far from the winning tile,
 * and fully lit beyond the second radius — so the last stretch is the
 * pea alone and the white never enters the block. */
const WET_OUT_R = 250;
const WET_LIT_R = 430;
/** What the vine fades to once it has delivered the pea. */
const VINE_SPENT = 0.22;
/** The pea's centre in the sprout's local frame — the pivot the
 * plant compresses about, so the bead itself never moves. */
const SPROUT_LOCAL_Y = 30;
/** The winning tile's recoil after it takes the hit. */
const RECOIL_MS = 220;
/** The pulse from the strike. Deliberately LOCAL: studs sit 39.4 units
 * apart, so a 237-unit reach is about six deep and the crack stays an
 * event at the winning tile rather than a wave washing the whole board.
 * Faded, too — it is a pulse, not a flare. WAVE_MAX_R is a hard stop so
 * it can never travel further than that however the timing is tuned. */
const WAVE_MS = 320;
const WAVE_SPEED = 0.74;
const WAVE_MAX_R = 237;
const WAVE_BAND = 42;
const WAVE_PEAK_PEG = 0.5;
const WAVE_PEAK_TILE = 0.22;
/** How near the pea has to be for a tile to feel brushed by it. */
const BRUSH_R = 155;
/** Contact IS the cue: the instant the pea meets the tile it is absorbed
 * into the face while the tile ignites, rather than resting on top of the
 * numeral. Short enough to read as one event, not two. */
const TIP_OUT_MS = 130;

const IDX = Array.from({ length: N }, (_, i) => i);
/** Outward unit normal per tile (for the hover lift). */
const OUT_XY = IDX.map((i) => {
  const [tx, ty] = TILE_XY[i];
  const d = Math.hypot(tx - CX, ty - CY) || 1;
  return [(tx - CX) / d, (ty - CY) / d] as const;
});

// ── Materiality tables (user spec 2026-07-19: numbers are not
// suggestions). The single implied light comes from PAGE-above, so
// every per-tile gradient axis is counter-rotated out of the tile's
// own rotation. ─────────────────────────────────────────────────────────
const ROT_RAD = TILE_ROT.map((r) => (r * Math.PI) / 180);
/** ONE light for the whole scene, from upper-LEFT — the azimuth the pegs
 * (fx 34% fy 28%), the pea (cx 32% cy 27%) and the stem's lit left flank
 * were already using. The tiles used to be lit from dead overhead, which
 * has no horizontal component and so produced no modelling at all. */
const LIGHT_PHI = (16 * Math.PI) / 180;
/** Page-space vector pointing AWAY from the light. */
const LP = [Math.sin(LIGHT_PHI), Math.cos(LIGHT_PHI)] as const;
/** That vector expressed in each tile's own rotated frame. */
const LIGHT_V = ROT_RAD.map(
  (t) =>
    [
      LP[0] * Math.cos(t) + LP[1] * Math.sin(t),
      -LP[0] * Math.sin(t) + LP[1] * Math.cos(t),
    ] as const,
);
/** The tile edge facing PAGE-up, as an inset hairline in page space. */
const HILITE_D = IDX.map((i) => {
  const [tx, ty] = TILE_XY[i];
  const t = ROT_RAD[i];
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const h = TILE_W / 2;
  // Four inset edges in local coords (shortened past the 10px corners).
  const edges: [number, number, number, number][] = [
    [-h + 11, -h + 1.5, h - 11, -h + 1.5],
    [-h + 11, h - 1.5, h - 11, h - 1.5],
    [-h + 1.5, -h + 11, -h + 1.5, h - 11],
    [h - 1.5, -h + 11, h - 1.5, h - 11],
  ];
  let best: [number, number, number, number] | null = null;
  let bestY = Infinity;
  for (const [x0, y0, x1, y1] of edges) {
    const px0 = tx + x0 * cos - y0 * sin;
    const py0 = ty + x0 * sin + y0 * cos;
    const px1 = tx + x1 * cos - y1 * sin;
    const py1 = ty + x1 * sin + y1 * cos;
    // Which edge faces the light, measured ALONG the light direction.
    const score = ((px0 + px1) / 2) * LP[0] + ((py0 + py1) / 2) * LP[1];
    if (score < bestY) {
      bestY = score;
      best = [px0, py0, px1, py1];
    }
  }
  const [ax, ay, bx, by] = best!;
  return `M${ax.toFixed(1)} ${ay.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`;
});
/** Peg row parity (two sizes alternating by row) + distance falloff. */
const PEG_ROW = PEGS.map(([, y]) => Math.round((y - (CY - 315)) / 34) % 2);
const PEG_R_TBL = PEG_ROW.map((p) => (p ? 6.25 : 5));
const PEG_MAX_D = Math.max(...PEGS.map(([x, y]) => Math.hypot(x - CX, y - CY)));
const PEG_FALL = PEGS.map(([x, y]) => {
  const d = Math.hypot(x - CX, y - CY) / PEG_MAX_D;
  return (0.9 - 0.45 * d).toFixed(3);
});
/** The 4 studs nearest the pea catch a faint lime tint. */
const PEG_NEAR_PEA: ReadonlySet<number> = new Set(
  PEGS.map(([x, y], i) => ({ i, d: Math.hypot(x - CX, y - (CY + 30)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4)
    .map((p) => p.i),
);
/** The five corner keystones: where the tile runs break at each vertex.
 * Seated on the corner bisector at the same edge distance the tiles use
 * (39 units, divided by sin 54 to keep that distance at the corner). */
const KEYSTONES = PENT_V.map(([vx, vy]) => {
  const d = Math.hypot(vx - CX, vy - CY) || 1;
  const ux = (vx - CX) / d;
  const uy = (vy - CY) / d;
  const inset = (TILE_W / 2 + 3) / Math.sin((54 * Math.PI) / 180);
  return {
    x: vx - ux * inset,
    y: vy - uy * inset,
    rot: (Math.atan2(uy, ux) * 180) / Math.PI + 90,
  };
});

/** The pentagon surface silhouette. */
const PENT_PATH =
  PENT_V.map(
    ([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`,
  ).join(" ") + " Z";

export function VineBoard({
  round,
  selected,
  deployedTiles,
  interactive,
  onToggle,
}: VineBoardProps) {
  const { roundId, winningTile, endsAt, phase } = round;
  const settling = phase !== "active";
  const animating = settling && winningTile !== null;

  const [hoverIdx, setHoverIdx] = useState<TileId | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const dragOp = useRef<"add" | "remove" | null>(null);
  const visited = useRef<Set<TileId>>(new Set());
  const lastDragPt = useRef<[number, number] | null>(null);

  const [landed, setLanded] = useState(false);
  // Round identity: a live backend can replace one settling snapshot
  // with ANOTHER round's settling snapshot — landed must reset on the
  // round change itself, not only on the settled->active transition.
  const [seenRoundId, setSeenRoundId] = useState(roundId);
  if (roundId !== seenRoundId) {
    setSeenRoundId(roundId);
    setLanded(false);
  }
  if (!settling && landed) setLanded(false);
  if (!interactive && hoverIdx !== null) setHoverIdx(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const vineRef = useRef<SVGPathElement>(null);
  const wetRef = useRef<SVGPathElement>(null);
  const woodRef = useRef<SVGPathElement>(null);
  const bloomRef = useRef<SVGPathElement>(null);
  const tipRef = useRef<SVGGElement>(null);
  const sproutPeaRef = useRef<SVGGElement>(null);
  const sproutRef = useRef<SVGGElement>(null);
  const chargeRef = useRef<SVGGElement>(null);
  const flashRef = useRef<SVGRectElement>(null);
  const winFaceRef = useRef<SVGRectElement>(null);
  const winGradRef = useRef<SVGRadialGradientElement>(null);
  const vineGradRef = useRef<SVGLinearGradientElement>(null);
  const brushGradRef = useRef<SVGRadialGradientElement>(null);
  const waveARef = useRef<SVGRectElement>(null);
  const waveBRef = useRef<SVGRectElement>(null);
  const pegRefs = useRef<Map<number, SVGCircleElement>>(new Map());
  const slotRefs = useRef<Map<number, SVGGElement>>(new Map());
  const brushRefs = useRef<Map<number, SVGRectElement>>(new Map());
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ── The reveal (layout effect: cleanup precedes the reset below) ────────
  useLayoutEffect(() => {
    if (!animating || winningTile === null) return;
    const g = compileVine(winningTile, roundId);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Delays by REAL distance from the winner, not by index: on a
    // pentagon, index distance runs around the perimeter and reads as a
    // marquee chase rather than a wave leaving the impact.
    const maxD = Math.max(
      ...IDX.map((i) =>
        Math.hypot(
          TILE_XY[i][0] - TILE_XY[winningTile][0],
          TILE_XY[i][1] - TILE_XY[winningTile][1],
        ),
      ),
    );
    const rippleDelay = IDX.map(
      (i) =>
        (Math.hypot(
          TILE_XY[i][0] - TILE_XY[winningTile][0],
          TILE_XY[i][1] - TILE_XY[winningTile][1],
        ) /
          maxD) *
        RIPPLE_SPAN_MS,
    );
    const lastPod: number[] = IDX.map(() => -1);
    const applyPodStates = (elapsed: number) => {
      for (let i = 0; i < N; i++) {
        const node = slotRefs.current.get(i);
        if (!node) continue;
        if (i === winningTile) {
          if (lastPod[i] !== 1) {
            node.style.opacity = "1";
            lastPod[i] = 1;
          }
          continue;
        }
        // The 60ms lead-in is load-bearing: the contact lands alone for a
        // few frames, so the dimming reads as CAUSED by it.
        const u = Math.max(
          0,
          Math.min(
            1,
            (elapsed - g.tLanded - RIPPLE_LEAD_MS - rippleDelay[i]) / 280,
          ),
        );
        const o = 1 - 0.75 * (1 - Math.pow(1 - u, 3));
        if (Math.abs(o - lastPod[i]) > 0.004) {
          node.style.opacity = o.toFixed(3);
          lastPod[i] = o;
        }
      }
    };

    // This reveal owns every peg: restore the previous round's strikes
    // (a settling->settling snapshot jump never passes through the
    // active-phase reset).
    for (const el of pegRefs.current.values()) {
      el.style.opacity = "0";
      el.removeAttribute("filter");
    }

    // Anchor the win's light where the vine actually strikes the tile.
    {
      const end = g.verts[g.verts.length - 1];
      winGradRef.current?.setAttribute("cx", end[0].toFixed(1));
      winGradRef.current?.setAttribute("cy", end[1].toFixed(1));
    }

    // The vine's geometry for this round.
    const d = g.verts
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");

    // The rest state the growth settles into. Reduced motion, a mount
    // past the celebration, and a resumed hidden tab all land HERE —
    // one definition, so the three paths cannot drift apart.
    const pinEndState = () => {
      for (const el of [vineRef, bloomRef, woodRef]) {
        el.current?.setAttribute("d", d);
        el.current?.setAttribute("stroke-dasharray", `${g.total}`);
        el.current?.setAttribute("stroke-dashoffset", "0");
      }
      // The wet tip has nothing left to grow into once it has arrived.
      wetRef.current?.setAttribute("d", d);
      wetRef.current?.setAttribute("stroke-dasharray", `0 ${g.total}`);
      tipRef.current?.style.setProperty("opacity", "0");
      sproutPeaRef.current?.style.setProperty("opacity", "0");
      chargeRef.current?.setAttribute("transform", "");
      for (const el of pegRefs.current.values()) {
        if (el.style.opacity !== "0") {
          el.style.opacity = "0";
          el.removeAttribute("filter");
        }
      }
      for (const el of brushRefs.current.values())
        el.setAttribute("opacity", "0");
      if (flashRef.current) flashRef.current.style.opacity = "0";
      winFaceRef.current?.setAttribute("opacity", "0");
      winFaceRef.current?.setAttribute("opacity", "0");
      waveARef.current?.setAttribute("opacity", "0");
      waveBRef.current?.setAttribute("opacity", "0");
      for (const node of slotRefs.current.values()) node.style.transform = "";
      winFaceRef.current?.setAttribute("opacity", "0.88");
      for (const el of [vineRef, woodRef, wetRef])
        el.current?.setAttribute("stroke-opacity", `${VINE_SPENT}`);
      bloomRef.current?.setAttribute("stroke-opacity", "0");
      applyPodStates(Number.POSITIVE_INFINITY);
    };

    if (reduced) {
      pinEndState();
      setLanded(true);
      return;
    }

    for (const el of [vineRef, bloomRef, woodRef]) {
      el.current?.setAttribute("d", d);
      el.current?.setAttribute("stroke-dasharray", `${g.total}`);
      el.current?.setAttribute("stroke-dashoffset", `${g.total}`);
    }
    // Only the leading 40 units of the wet tip ever paint.
    wetRef.current?.setAttribute("d", d);
    wetRef.current?.setAttribute("stroke-dasharray", `40 ${g.total}`);
    wetRef.current?.setAttribute("stroke-dashoffset", `${g.total}`);
    // Each strike flares at 0.5 with a tight glow then decays back to the
    // dark stud. The times are COMPILED from the inverted growth ease, so
    // a mid-join or a resumed tab sees the same instants a continuous
    // viewer did instead of igniting every passed peg at once.
    const strikes = strikeTimes(g);

    let raf = 0;
    let live = true;
    let announced = false;
    const landTimer = setTimeout(
      () => setLanded(true),
      Math.max(0, endsAt + g.tLanded - Date.now()),
    );
    let lastKey = "";
    let nearestWin = Number.POSITIVE_INFINITY;
    const tick = () => {
      if (!live) return;
      const elapsed = Date.now() - endsAt;
      // Everything is static once the celebration finishes: pin the end
      // state once and stop scheduling frames (the clock-anchored timer
      // already owns the landed flip). The gate sits just past the last
      // animated quantity — the final peg's decay, the ripple and the
      // ring all end before tSettled — and must stay inside SETTLING_MS
      // so it is reachable for the longest walks too.
      if (elapsed > g.tSettled + 200) {
        pinEndState();
        if (!announced) {
          announced = true;
          setLanded(true);
        }
        return;
      }
      const f = evaluate(g, elapsed);

      // The sprout charges by compressing the PLANT onto the pea, pivoted
      // at the pea's own centre. The pea must not move: the vine tip
      // appears at exactly that point, and any drift here is a visible
      // snap at the handoff.
      if (chargeRef.current) {
        // Squash down and out, the way a spring-loaded organism loads.
        const c = f.charge;
        const sx = (1 - 0.045 * c).toFixed(4);
        const sy = (1 + 0.06 * c).toFixed(4);
        chargeRef.current.setAttribute(
          "transform",
          `translate(0 ${SPROUT_LOCAL_Y}) scale(${sx} ${sy}) translate(0 ${-SPROUT_LOCAL_Y})`,
        );
      }
      const growing = f.phase !== "idle" && f.phase !== "arm";
      sproutPeaRef.current?.style.setProperty("opacity", growing ? "0" : "1");

      const key = `${f.vineLen.toFixed(1)}|${f.charge.toFixed(3)}`;
      if (key !== lastKey) {
        lastKey = key;
        const off = (g.total - f.vineLen).toFixed(1);
        vineRef.current?.setAttribute("stroke-dashoffset", off);
        bloomRef.current?.setAttribute("stroke-dashoffset", off);
        wetRef.current?.setAttribute("stroke-dashoffset", off);
        // The wet point telegraphs the answer, so it burns out on
        // APPROACH — measured by real distance to the winning tile, not
        // by progress along a path whose run-in length varies per round.
        // Tracked as a running minimum so it can never relight once out.
        const dWin = Math.hypot(
          f.tipX - TILE_XY[winningTile][0],
          f.tipY - TILE_XY[winningTile][1],
        );
        if (dWin < nearestWin) nearestWin = dWin;
        const wet = Math.max(
          0,
          Math.min(1, (nearestWin - WET_OUT_R) / (WET_LIT_R - WET_OUT_R)),
        );
        wetRef.current?.setAttribute("stroke-opacity", (wet * wet).toFixed(3));
        // The wood trails the tip, which is what tapers the growing end.
        woodRef.current?.setAttribute(
          "stroke-dashoffset",
          `${(g.total - Math.max(0, f.vineLen - 90)).toFixed(1)}`,
        );
        // The light travels with the tip rather than sitting on the whole
        // run: the pea carries it.
        vineGradRef.current?.setAttribute("x2", f.tipX.toFixed(1));
        vineGradRef.current?.setAttribute("y2", f.tipY.toFixed(1));
      }

      const tip = tipRef.current;
      if (tip) {
        const dtLand = elapsed - g.tLanded;
        if (dtLand >= 0) {
          // Absorbed: it sinks a few units into the face as it shrinks,
          // so the block reads as taking the pea rather than the pea
          // blinking out on top of it.
          const u = Math.min(1, dtLand / TIP_OUT_MS);
          const s = Math.max(0, 1 - u * u);
          const [wx, wy] = TILE_XY[winningTile];
          const end = g.verts[g.verts.length - 1];
          const nx = wx - end[0];
          const ny = wy - end[1];
          const nd = Math.hypot(nx, ny) || 1;
          const sink = 10 * u;
          tip.style.opacity = s > 0 ? "1" : "0";
          tip.setAttribute(
            "transform",
            `translate(${(end[0] + (nx / nd) * sink).toFixed(1)} ${(
              end[1] +
              (ny / nd) * sink
            ).toFixed(1)}) scale(${s.toFixed(3)})`,
          );
        } else {
          tip.style.opacity = growing ? "1" : "0";
          tip.setAttribute(
            "transform",
            `translate(${f.tipX.toFixed(1)} ${f.tipY.toFixed(1)}) scale(${growing ? 1 : 0})`,
          );
        }
      }

      // The impact lights the studs around the winning tile as well —
      // whichever is brighter, a peg's own strike or the arrival.
      // The shock front: a ring of light expanding from the strike point.
      const dtImp = elapsed - g.tLanded;
      const waveLive = dtImp >= 0 && dtImp < WAVE_MS;
      const front = dtImp * WAVE_SPEED;
      // Everything dims as the wave spends itself, so it cannot outstay
      // the moment it belongs to.
      const envelope = waveLive ? 1 - Math.pow(dtImp / WAVE_MS, 2) : 0;
      const [sx, sy] = g.verts[g.verts.length - 1];
      const waveAt = (x: number, y: number, peak: number) => {
        if (!waveLive) return 0;
        const d = Math.hypot(x - sx, y - sy);
        // Hard stop: the pulse is local to the tile it belongs to.
        if (d > WAVE_MAX_R) return 0;
        // Gaussian band centred on the front: brightest exactly as it
        // arrives, dark ahead of it and behind it. It also thins with
        // distance, so the outermost studs only catch the edge of it.
        const k = (d - front) / WAVE_BAND;
        const falloff = 1 - (d / WAVE_MAX_R) * 0.55;
        return peak * Math.exp(-k * k) * envelope * falloff;
      };
      const impactOn = (pegIdx: number) =>
        waveAt(PEGS[pegIdx][0], PEGS[pegIdx][1], WAVE_PEAK_PEG);
      const struck = new Set(g.hits);
      for (const [pegIdx, el] of pegRefs.current) {
        if (struck.has(pegIdx)) continue; // handled with its own strike
        const o = impactOn(pegIdx);
        const s = o > 0.004 ? o.toFixed(3) : "0";
        if (el.style.opacity !== s) {
          el.style.opacity = s;
          if (o > 0.004) el.setAttribute("filter", "url(#vn-pegglow)");
          else el.removeAttribute("filter");
        }
      }
      for (let k = 0; k < strikes.length; k++) {
        const el = pegRefs.current.get(g.hits[k]);
        if (!el) continue;
        const dt = elapsed - strikes[k];
        const strike =
          dt < 0
            ? 0
            : dt < 140
              ? 0.5
              : Math.max(0, 0.5 * (1 - (dt - 140) / 520));
        const o = Math.max(strike, impactOn(g.hits[k]));
        if (o > 0) {
          el.setAttribute("filter", "url(#vn-pegglow)");
          el.style.opacity = o.toFixed(3);
        } else if (el.style.opacity !== "0") {
          el.style.opacity = "0";
          el.removeAttribute("filter");
        }
      }

      // Brush light: how close is the pea to each tile right now? Fades
      // out once it has landed, so it never competes with the winner.
      {
        const dtImpact = elapsed - g.tLanded;
        // Move the light itself: in flight it rides the pea, on arrival it
        // sits on the winner and the board is lit BY the win.
        const [lx, ly] =
          dtImpact < 0
            ? [f.tipX, f.tipY]
            : [TILE_XY[winningTile][0], TILE_XY[winningTile][1]];
        brushGradRef.current?.setAttribute("cx", lx.toFixed(1));
        brushGradRef.current?.setAttribute("cy", ly.toFixed(1));
        for (let i = 0; i < N; i++) {
          const el = brushRefs.current.get(i);
          if (!el) continue;
          let o = 0;
          if (i !== winningTile) {
            if (dtImpact < 0) {
              // The gradient supplies the falloff; this only carries the
              // weighting that makes YOUR tiles answer harder.
              const dd = Math.hypot(
                f.tipX - TILE_XY[i][0],
                f.tipY - TILE_XY[i][1],
              );
              if (dd < BRUSH_R)
                o = deployedTiles.includes(i as TileId) ? 1 : 0.42;
            } else if (waveLive) {
              o = waveAt(TILE_XY[i][0], TILE_XY[i][1], WAVE_PEAK_TILE);
            }
          }
          const s = o.toFixed(2);
          if (el.getAttribute("opacity") !== s) el.setAttribute("opacity", s);
        }
      }

      // ── Arrival. An impact is sold by the object RECOILING and its
      //    surroundings reacting, not by a hoop travelling away from it.
      //    Flash, tile punch, two tile-shaped waves, and the board taking
      //    the light — all inside half a second. ──
      const dtLand = elapsed - g.tLanded;
      if (flashRef.current) {
        flashRef.current.style.opacity =
          dtLand >= 0 && dtLand < 90
            ? (0.8 * (1 - dtLand / 90)).toFixed(2)
            : "0";
      }

      // The face lights over 260ms. Driven here, not from React state, so
      // it can never land a frame apart from the flash it belongs to.
      if (winFaceRef.current) {
        const u = dtLand < 0 ? 0 : Math.min(1, dtLand / 260);
        const o = dtLand < 0 ? 0 : 0.88 * (1 - Math.pow(1 - u, 3));
        const s = o.toFixed(3);
        if (winFaceRef.current.getAttribute("opacity") !== s)
          winFaceRef.current.setAttribute("opacity", s);
      }

      // The winning tile takes the hit and settles: instant punch, decay.
      {
        const slot = slotRefs.current.get(winningTile);
        if (slot) {
          if (dtLand >= 0 && dtLand < RECOIL_MS) {
            const u = dtLand / RECOIL_MS;
            const k = 1 + 0.11 * Math.pow(1 - u, 1.7);
            const [wx, wy] = TILE_XY[winningTile];
            slot.style.transform = `translate(${wx}px, ${wy}px) scale(${k.toFixed(4)}) translate(${-wx}px, ${-wy}px)`;
          } else if (slot.style.transform) {
            slot.style.transform = "";
          }
        }
      }

      // Two waves in the tile's own shape. A leads tight and bright, B
      // blooms wider and softer behind it.
      const wave = (
        el: SVGRectElement | null,
        delay: number,
        dur: number,
        toScale: number,
        w0: number,
        w1: number,
        o0: number,
      ) => {
        if (!el) return;
        const dt = dtLand - delay;
        if (dt < 0 || dt >= dur) {
          if (el.getAttribute("opacity") !== "0")
            el.setAttribute("opacity", "0");
          return;
        }
        const u = dt / dur;
        const ease = 1 - Math.pow(1 - u, 3.2);
        const s = 1 + (toScale - 1) * ease;
        const size = TILE_W * s;
        const [wx, wy] = TILE_XY[winningTile];
        el.setAttribute("x", (wx - size / 2).toFixed(1));
        el.setAttribute("y", (wy - size / 2).toFixed(1));
        el.setAttribute("width", size.toFixed(1));
        el.setAttribute("height", size.toFixed(1));
        el.setAttribute("rx", (10 * s).toFixed(1));
        el.setAttribute("stroke-width", (w0 + (w1 - w0) * u).toFixed(2));
        // Energy collapses fast, so opacity falls quicker than the travel.
        el.setAttribute("opacity", (o0 * Math.pow(1 - u, 2.1)).toFixed(3));
      };
      wave(waveARef.current, 0, 360, 1.75, 5.5, 1.2, 0.85);
      wave(waveBRef.current, 60, 520, 2.5, 13, 4, 0.3);

      // The vine spends itself once it has delivered: still the round's
      // record, no longer a light source competing with the winner.
      if (vineRef.current) {
        const dtSpend = dtLand - 80;
        const o =
          dtSpend <= 0
            ? 1
            : dtSpend >= 440
              ? VINE_SPENT
              : 1 - (1 - VINE_SPENT) * (1 - Math.pow(1 - dtSpend / 440, 3));
        const s = o.toFixed(3);
        if (vineRef.current.getAttribute("stroke-opacity") !== s) {
          vineRef.current.setAttribute("stroke-opacity", s);
          woodRef.current?.setAttribute("stroke-opacity", s);
          wetRef.current?.setAttribute("stroke-opacity", s);
          // The bloom is light, so it goes out entirely.
          bloomRef.current?.setAttribute(
            "stroke-opacity",
            (0.1 * Math.max(0, (o - VINE_SPENT) / (1 - VINE_SPENT))).toFixed(3),
          );
        }
      }

      applyPodStates(elapsed);
      if (!announced && elapsed >= g.tLanded) {
        announced = true;
        setLanded(true);
      }
      raf = requestAnimationFrame(tick);
    };
    // Paint the true frame NOW, then keep it running.
    tick();
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      clearTimeout(landTimer);
    };
  }, [animating, winningTile, roundId, endsAt]);

  // ── Idle board: everything back to rest BEFORE paint. Guarded on
  //    `animating`, NOT `settling`, so it is the exact complement of the
  //    reveal effect — a settling round whose winner has not landed yet
  //    (live backend, VRF pending) must not keep the previous round's
  //    vine, dimmed losers and hidden pea on screen. ──────────────────────
  useLayoutEffect(() => {
    if (animating) return;
    for (const el of [vineRef, bloomRef, woodRef, wetRef]) {
      el.current?.setAttribute("d", "");
      el.current?.setAttribute("stroke-opacity", "1");
    }
    tipRef.current?.style.setProperty("opacity", "0");
    sproutPeaRef.current?.style.setProperty("opacity", "1");
    sproutRef.current?.setAttribute("transform", `translate(${CX} ${CY})`);
    chargeRef.current?.setAttribute("transform", "");
    for (const el of pegRefs.current.values()) {
      el.style.opacity = "0";
      el.removeAttribute("filter");
    }
    for (const el of brushRefs.current.values())
      el.setAttribute("opacity", "0");
    for (const node of slotRefs.current.values()) node.style.opacity = "1";
    if (flashRef.current) flashRef.current.style.opacity = "0";
    waveARef.current?.setAttribute("opacity", "0");
    waveBRef.current?.setAttribute("opacity", "0");
    for (const node of slotRefs.current.values()) node.style.transform = "";
  }, [animating, roundId]);

  // ── Nearest-tile hit testing + swept drag-paint ─────────────────────────
  const toBoard = (clientX: number, clientY: number): [number, number] => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const scale = VIEW_W / rect.width;
    return [
      VIEW_X + (clientX - rect.left) * scale,
      VIEW_Y + (clientY - rect.top) * scale,
    ];
  };

  const tileAtPt = (x: number, y: number): TileId | null => {
    let best: TileId | null = null;
    let bestD = HIT_R;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(x - TILE_XY[i][0], y - TILE_XY[i][1]);
      if (d < bestD) {
        bestD = d;
        best = i as TileId;
      }
    }
    return best;
  };

  const paint = (idx: TileId) => {
    if (dragOp.current === null || visited.current.has(idx)) return;
    visited.current.add(idx);
    onToggle(idx, dragOp.current);
  };

  const sweepTo = (x: number, y: number) => {
    const from = lastDragPt.current ?? [x, y];
    const dx = x - from[0];
    const dy = y - from[1];
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (HIT_R / 2)));
    for (let s = 1; s <= steps; s++) {
      const idx = tileAtPt(
        from[0] + (dx * s) / steps,
        from[1] + (dy * s) / steps,
      );
      if (idx !== null) paint(idx);
    }
    lastDragPt.current = [x, y];
  };

  const endDrag = () => {
    dragOp.current = null;
    visited.current.clear();
    lastDragPt.current = null;
  };

  const moveFocus = (to: number) => {
    setFocusIdx(to);
    btnRefs.current[to]?.focus();
  };

  const tiles = round.tiles;
  const hovering = interactive && hoverIdx !== null;

  return (
    <div className="w-full select-none">
      <div
        ref={surfaceRef}
        className={`relative mx-auto w-full touch-none ${hovering ? "cursor-pointer" : ""}`}
        style={{
          aspectRatio: "1 / 1",
          maxWidth: "calc(100dvh - 160px)",
        }}
        onPointerDown={(e) => {
          if (!interactive) return;
          const [x, y] = toBoard(e.clientX, e.clientY);
          const idx = tileAtPt(x, y);
          if (idx === null) return;
          e.preventDefault();
          try {
            surfaceRef.current?.setPointerCapture?.(e.pointerId);
          } catch {
            // Pointer already gone — the drag ends on pointerup.
          }
          dragOp.current = selected.has(idx) ? "remove" : "add";
          visited.current = new Set();
          lastDragPt.current = [x, y];
          paint(idx);
        }}
        onPointerMove={(e) => {
          if (!interactive) return;
          const [x, y] = toBoard(e.clientX, e.clientY);
          const idx = tileAtPt(x, y);
          if (idx !== hoverIdx) setHoverIdx(idx);
          if (dragOp.current === null) return;
          sweepTo(x, y);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <svg
          viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_W}`}
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <PeaGradientDef id="vn-pea" />
            {/* Sprout foliage lit by its own pea. */}
            {/* Local coords: every consumer sits inside the sprout's
                translate, where userSpaceOnUse resolves post-transform
                (the wheel's absolute-coordinate variant does not apply
                here — audit finding). */}
            <radialGradient
              id="vn-plantlit"
              gradientUnits="userSpaceOnUse"
              cx={0}
              cy={30}
              r="120"
            >
              <stop offset="8%" stopColor="#A9C43E" />
              <stop offset="30%" stopColor="#5F7A1E" />
              <stop offset="70%" stopColor="#22300C" />
              <stop offset="100%" stopColor="#101707" />
            </radialGradient>
            {/* Leaf shading: the pea lights the foliage from below, so the
                tips fall into shadow. Local sprout coords. */}
            <linearGradient
              id="vn-leafshade"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="-4"
              x2="0"
              y2="-50"
            >
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="55%" stopColor="rgba(0,0,0,0.20)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.52)" />
            </linearGradient>
            {/* A keystone is a recess, so its gradient runs the opposite
                way to a tile's: darkest at the top where the lip
                overhangs, lifting toward the lit far rim. */}
            <linearGradient id="vn-keystone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050507" />
              <stop offset="60%" stopColor="#08080B" />
              <stop offset="100%" stopColor="#0C0D11" />
            </linearGradient>
            {/* The node's material: lit upper-left like every other round
                object in the scene, falling to deep shade on the far side. */}
            <radialGradient id="vn-node" cx="34%" cy="26%" r="76%">
              <stop offset="0%" stopColor="#B4CF46" />
              <stop offset="42%" stopColor="#5F7A1E" />
              <stop offset="100%" stopColor="#1B2607" />
            </radialGradient>
            {/* The crease under the swelling, as a gradient rather than a
                hard stroke across the middle of it. */}
            <linearGradient
              id="vn-nodeshade"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="23"
              x2="0"
              y2="38"
            >
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="58%" stopColor="rgba(0,0,0,0.08)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
            </linearGradient>
            {/* The pea's own light, following it around the board. Used as
                the FILL on every brush rect, so all 25 are lit by their
                real distance AND direction from it — two writes a frame
                instead of twenty-five, and no per-tile blur regions on
                the animating path. */}
            <radialGradient
              id="vn-brush"
              ref={brushGradRef}
              gradientUnits="userSpaceOnUse"
              cx={SPROUT_X}
              cy={SPROUT_Y}
              r="170"
            >
              <stop
                offset="0%"
                stopColor="var(--color-accent)"
                stopOpacity="0.5"
              />
              <stop
                offset="55%"
                stopColor="var(--color-accent)"
                stopOpacity="0.16"
              />
              <stop
                offset="100%"
                stopColor="var(--color-accent)"
                stopOpacity="0"
              />
            </radialGradient>
            {/* The vine is lit from its growing end, not uniformly on
                fire. Both endpoints are written per frame. */}
            <linearGradient
              id="vn-vinegrad"
              ref={vineGradRef}
              gradientUnits="userSpaceOnUse"
              x1={SPROUT_X}
              y1={SPROUT_Y}
              x2={SPROUT_X}
              y2={SPROUT_Y}
            >
              <stop
                offset="0%"
                stopColor="var(--color-accent)"
                stopOpacity="0.55"
              />
              <stop offset="100%" stopColor="var(--color-accent)" />
            </linearGradient>
            {/* The win's own light, anchored where the vine struck rather
                than at the tile's centre — the face is hottest at the
                point of contact. Its centre is written per round. */}
            {winningTile !== null && (
              <radialGradient
                id="vn-win"
                ref={winGradRef}
                gradientUnits="userSpaceOnUse"
                cx={TILE_XY[winningTile][0]}
                cy={TILE_XY[winningTile][1]}
                r={TILE_W * 1.15}
              >
                <stop offset="0%" stopColor="#F6FFC2" />
                <stop offset="22%" stopColor="#E4FF6E" />
                <stop offset="55%" stopColor="var(--color-accent)" />
                <stop offset="100%" stopColor="#9FC800" />
              </radialGradient>
            )}
            {/* Softens the mask's cut so the vine fades into the tile's
                edge instead of ending on a hard line. */}
            <filter
              id="vn-maskfade"
              x="-40%"
              y="-40%"
              width="180%"
              height="180%"
            >
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
            <filter id="vn-soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Two-layer page shadow every tile casts (0 1px 2px + 0 5px 12px). */}
            <filter
              id="vn-tileshadow"
              x="-60%"
              y="-60%"
              width="220%"
              height="240%"
            >
              <feDropShadow
                dx="0.33"
                dy="1"
                stdDeviation="1"
                floodColor="#000000"
                floodOpacity="0.6"
              />
              <feDropShadow
                dx="1.6"
                dy="5"
                stdDeviation="6"
                floodColor="#000000"
                floodOpacity="0.5"
              />
            </filter>
            {/* The one soft selection glow (blur ~12; opacity set per state). */}
            <filter id="vn-halo" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            {/* Tight 4-6px strike glow on a passed peg. */}
            <filter
              id="vn-pegglow"
              x="-150%"
              y="-150%"
              width="400%"
              height="400%"
            >
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* The stud's own 1px soft under-shadow (0 1px 1px black 0.6). */}
            <filter
              id="vn-pegdrop"
              x="-120%"
              y="-120%"
              width="340%"
              height="340%"
            >
              <feDropShadow
                dx="0.33"
                dy="1"
                stdDeviation="0.5"
                floodColor="#000000"
                floodOpacity="0.6"
              />
            </filter>
            {/* Watch-face stud: lit upper-left, falling to a dark lower rim. */}
            <radialGradient
              id="vn-peg"
              cx="50%"
              cy="50%"
              r="70%"
              fx="34%"
              fy="28%"
            >
              <stop offset="0%" stopColor="#1C2404" />
              <stop offset="100%" stopColor="#0D1101" />
            </radialGradient>
            {/* The same stud with a tenth of accent mixed in (the pea's neighbors). */}
            <radialGradient
              id="vn-peg-lit4"
              cx="50%"
              cy="50%"
              r="70%"
              fx="34%"
              fy="28%"
            >
              <stop offset="0%" stopColor="#2E3A04" />
              <stop offset="100%" stopColor="#202901" />
            </radialGradient>
            {/* The pentagon surface material (center barely lighter than edge). */}
            <radialGradient
              id="vn-surface"
              gradientUnits="userSpaceOnUse"
              cx={CX}
              cy={CY}
              r="430"
            >
              <stop offset="0%" stopColor="#0A0B05" />
              <stop offset="100%" stopColor="#060704" />
            </radialGradient>
            {/* The board obeys the same light its tiles do: its lower half
                falls into shadow, seating the slab on the page. */}
            <linearGradient
              id="vn-seat-rim"
              gradientUnits="userSpaceOnUse"
              x1={CX - LP[0] * 340}
              y1={CY - LP[1] * 340}
              x2={CX + LP[0] * 345}
              y2={CY + LP[1] * 345}
            >
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="46%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.5)" />
            </linearGradient>
            <filter
              id="vn-seat-ambient"
              x="-30%"
              y="-30%"
              width="160%"
              height="170%"
            >
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <clipPath id="vn-seat-clip">
              <path d={PENT_PATH} />
            </clipPath>
            <filter
              id="vn-seat-lip"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="7" />
            </filter>
            {/* The slab's catchlight fades out as its edges turn away from
                the light — a clip would end the stroke in a hard cut. */}
            <linearGradient
              id="vn-seat-edge"
              gradientUnits="userSpaceOnUse"
              x1={CX - LP[0] * 420}
              y1={CY - LP[1] * 420}
              x2={CX + LP[0] * 120}
              y2={CY + LP[1] * 120}
            >
              <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="55%" stopColor="rgba(255,255,255,0.035)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            {/* Per-tile material: the light axis is counter-rotated out of the
                tile's own rotation so every tile reads lit from PAGE-above,
                plus a lower-corner ambient-occlusion pool on the same axis. */}
            {IDX.map((i) => {
              const [tx, ty] = TILE_XY[i];
              const [vx, vy] = LIGHT_V[i];
              const h = TILE_W / 2;
              return (
                <linearGradient
                  key={i}
                  id={`vn-tg${i}`}
                  gradientUnits="userSpaceOnUse"
                  x1={(tx - vx * h).toFixed(1)}
                  y1={(ty - vy * h).toFixed(1)}
                  x2={(tx + vx * h).toFixed(1)}
                  y2={(ty + vy * h).toFixed(1)}
                >
                  <stop offset="0%" stopColor="#121214" />
                  <stop offset="50%" stopColor="#0D0D0F" />
                  <stop offset="100%" stopColor="#08080A" />
                </linearGradient>
              );
            })}
            {IDX.map((i) => {
              const [tx, ty] = TILE_XY[i];
              const [vx, vy] = LIGHT_V[i];
              return (
                <radialGradient
                  key={i}
                  id={`vn-ao${i}`}
                  gradientUnits="userSpaceOnUse"
                  cx={(tx + vx * 12).toFixed(1)}
                  cy={(ty + vy * 12).toFixed(1)}
                  r="64"
                >
                  <stop offset="55%" stopColor="rgba(0,0,0,0)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.25)" />
                </radialGradient>
              );
            })}
          </defs>

          {/* ── The board surface: a material seated on the page. Its
              silhouette comes from surface-vs-page contrast and shading —
              never a stroke.

              A literal black drop shadow is invisible here (black over a
              pure-black page composites to black — probe-verified: zero
              non-black pixels), so the seating is built the only way it
              can read on #000: the material itself bleeds a soft, darker
              halo past the silhouette (softening the cut), and its own
              rim falls into shadow so the surface sits in a recess
              rather than lying flat. ── */}
          <path
            d={PENT_PATH}
            fill="#0A0B05"
            opacity="0.35"
            transform={`translate(0 6) scale(1.01) translate(${(-CX * 0.01).toFixed(2)} ${(-CY * 0.01).toFixed(2)})`}
            filter="url(#vn-seat-ambient)"
          />
          <path d={PENT_PATH} fill="url(#vn-surface)" />
          {/* The boundary is a shadowed lip, so the slab has thickness
              rather than being a flat cut-out. */}
          <g clipPath="url(#vn-seat-clip)">
            <path
              d={PENT_PATH}
              fill="none"
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="16"
              filter="url(#vn-seat-lip)"
            />
          </g>
          {/* The slab's lower half falls away, and its upper edges catch
              the same light every tile does. */}
          <path d={PENT_PATH} fill="url(#vn-seat-rim)" />
          <path
            d={PENT_PATH}
            fill="none"
            stroke="url(#vn-seat-edge)"
            strokeWidth="1"
          />

          {/* ── The peg field: grounded studs, brighter toward the pea's
              home and fading to the rim; the accent overlay is the reveal's
              strike light (opacity + glow written imperatively, decaying). ── */}
          {PEGS.map(([px, py], i) => {
            const r = PEG_R_TBL[i];
            return (
              <g key={i} opacity={PEG_FALL[i]} filter="url(#vn-pegdrop)">
                <circle
                  cx={px}
                  cy={py}
                  r={r}
                  fill={
                    PEG_NEAR_PEA.has(i) ? "url(#vn-peg-lit4)" : "url(#vn-peg)"
                  }
                />
                <circle
                  cx={px - r * 0.32}
                  cy={py - r * 0.36}
                  r={r * 0.25}
                  fill="rgba(255,255,255,0.22)"
                />
              </g>
            );
          })}
          {/* Strike lights live OUTSIDE the falloff groups: a flare is the
              reveal's own light and burns at full strength anywhere. */}
          {PEGS.map(([px, py], i) => (
            <circle
              key={i}
              ref={(n) => {
                if (n) pegRefs.current.set(i, n);
              }}
              cx={px}
              cy={py}
              r={PEG_R_TBL[i] + 0.5}
              fill="var(--color-accent)"
              opacity="0"
            />
          ))}

          {/* ── The corner keystones. Decoration only: no number, no hit
              target, not in the tab order — the mechanic is 25 tiles and
              these must never read as a 26th. ── */}
          {KEYSTONES.map((k, i) => (
            <g key={i} transform={`rotate(${k.rot.toFixed(2)} ${k.x} ${k.y})`}>
              <path
                d={`M${k.x} ${k.y - 19} L${(k.x + 17).toFixed(1)} ${(k.y + 12).toFixed(1)} Q${k.x} ${(k.y + 19).toFixed(1)} ${(k.x - 17).toFixed(1)} ${(k.y + 12).toFixed(1)} Z`}
                fill="url(#vn-keystone)"
              />
              {/* Inverted lighting: the near lip is in shadow and the far
                  lower rim catches the light, which is what makes it read
                  as cut INTO the surface rather than sitting on it. */}
              <path
                d={`M${(k.x - 15).toFixed(1)} ${(k.y + 9).toFixed(1)} L${k.x} ${(k.y - 16.5).toFixed(1)} L${(k.x + 15).toFixed(1)} ${(k.y + 9).toFixed(1)}`}
                fill="none"
                stroke="rgba(0,0,0,0.55)"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <path
                d={`M${(k.x - 14).toFixed(1)} ${(k.y + 11).toFixed(1)} Q${k.x} ${(k.y + 16.5).toFixed(1)} ${(k.x + 14).toFixed(1)} ${(k.y + 11).toFixed(1)}`}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
              {/* A debossed pea: the maker's mark, stamped not lit. */}
              <circle
                cx={k.x}
                cy={k.y + 3.5}
                r="3.6"
                fill="none"
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="1.4"
              />
              <circle
                cx={k.x}
                cy={k.y + 4.6}
                r="3.6"
                fill="none"
                stroke="rgba(255,255,255,0.045)"
                strokeWidth="0.9"
              />
            </g>
          ))}

          {/* ── The 25 tiles riding the pentagon's edges ── */}
          {tiles.map((tile, i) => {
            const [tx, ty] = TILE_XY[i];
            const isSel = selected.has(i as TileId);
            const isDeployed = deployedTiles.includes(i as TileId);
            const isWinner = landed && winningTile === i;
            const isHover = hovering && hoverIdx === i && !isWinner;
            const hot = isSel || isDeployed;
            const [ox, oy] = OUT_XY[i];
            return (
              <g
                key={i}
                ref={(n) => {
                  if (n) slotRefs.current.set(i, n);
                }}
              >
                <g
                  className="vn-lift"
                  style={{
                    transform: isHover
                      ? `translate(${(ox * 6).toFixed(1)}px, ${(oy * 6).toFixed(1)}px)`
                      : "translate(0px, 0px)",
                  }}
                >
                  {/* The one permitted glow: selection (0.35), hover at half
                    strength (0.175), winner as a light source. */}
                  {(isWinner || hot || isHover) && (
                    <g
                      transform={`rotate(${TILE_ROT[i].toFixed(2)} ${tx} ${ty})`}
                    >
                      <rect
                        x={tx - TILE_W / 2}
                        y={ty - TILE_W / 2}
                        width={TILE_W}
                        height={TILE_W}
                        rx="10"
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="8"
                        filter="url(#vn-halo)"
                        className={isHover && !hot ? "vn-fade-on" : "vn-fade"}
                        opacity={isWinner ? 0.5 : hot ? 0.35 : 0.175}
                      />
                    </g>
                  )}
                  {/* Brush light: written per frame from the pea's distance
                    while the vine is growing. Your own tiles react harder
                    than the rest, which is what turns a near miss into a
                    personal one. Reset to 0 whenever the reveal is not
                    running. */}
                  <g
                    transform={`rotate(${TILE_ROT[i].toFixed(2)} ${tx} ${ty})`}
                  >
                    <rect
                      ref={(n) => {
                        if (n) brushRefs.current.set(i, n);
                      }}
                      x={tx - TILE_W / 2}
                      y={ty - TILE_W / 2}
                      width={TILE_W}
                      height={TILE_W}
                      rx="10"
                      fill="url(#vn-brush)"
                      opacity="0"
                    />
                  </g>
                  {/* The cast shadow hangs off an UNROTATED wrapper: a
                    filter applied to a rotated group rotates its offsets
                    with the tile, which would give the board five
                    different light directions (probe-verified). */}
                  <g filter="url(#vn-tileshadow)">
                    <g
                      transform={`rotate(${TILE_ROT[i].toFixed(2)} ${tx} ${ty})`}
                    >
                      <rect
                        x={tx - TILE_W / 2}
                        y={ty - TILE_W / 2}
                        width={TILE_W}
                        height={TILE_W}
                        rx="10"
                        fill={
                          hot
                            ? "var(--color-surface-active)"
                            : `url(#vn-tg${i})`
                        }
                        stroke={
                          isWinner
                            ? "#F6FFC2"
                            : hot || isHover
                              ? "var(--color-accent)"
                              : TILE_EDGE
                        }
                        strokeOpacity={isHover && !hot ? 0.5 : 1}
                        strokeWidth={isWinner ? 1.5 : 1.5}
                      />
                      {/* Hover: the selection fill at half strength. */}
                      {isHover && !hot && !isWinner && (
                        <rect
                          x={tx - TILE_W / 2}
                          y={ty - TILE_W / 2}
                          width={TILE_W}
                          height={TILE_W}
                          rx="10"
                          fill="var(--color-surface-active)"
                          fillOpacity="0.5"
                        />
                      )}
                      {/* Ambient occlusion pools in the lower corners — on
                        EVERY tile including the winner, whose material is
                        what makes it read as a lit block rather than a
                        lime sticker. */}
                      <rect
                        x={tx - TILE_W / 2}
                        y={ty - TILE_W / 2}
                        width={TILE_W}
                        height={TILE_W}
                        rx="10"
                        fill={`url(#vn-ao${i})`}
                        opacity={isWinner ? 0.4 : 1}
                      />
                      {/* The win, painted OVER the material rather than
                        replacing it: hottest at the point the vine struck,
                        ramped in by the tick so it cannot land a frame
                        apart from the flash. */}
                      {isWinner && (
                        <rect
                          ref={winFaceRef}
                          x={tx - TILE_W / 2}
                          y={ty - TILE_W / 2}
                          width={TILE_W}
                          height={TILE_W}
                          rx="10"
                          fill="url(#vn-win)"
                          opacity="0"
                        />
                      )}
                    </g>
                  </g>
                  {/* The catchlight hairline on whichever edge faces the
                    light — brighter on the winner, never absent. */}
                  <path
                    d={HILITE_D[i]}
                    fill="none"
                    stroke={isWinner ? "rgba(255,255,255,0.30)" : TILE_TOP_EDGE}
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                  {/* Engraved numeral: near-black copy a hair up, backlit lime
                    when selected, the face on top. */}
                  {/* The engraving survives the win — inverted, because a
                    lit face is lit from above and its cut catches light
                    on the lower lip instead of the upper. */}
                  <text
                    x={tx}
                    y={ty + (isWinner ? 11 : 9)}
                    textAnchor="middle"
                    fontSize="29"
                    fill={isWinner ? "#F6FFC2" : "#050700"}
                    fontWeight={hot || isWinner ? 700 : 300}
                    opacity={isWinner ? 0.55 : 1}
                    className="tnum"
                  >
                    {i + 1}
                  </text>
                  {hot && !isWinner && (
                    <text
                      x={tx}
                      y={ty + 10}
                      textAnchor="middle"
                      fontSize="29"
                      fill="var(--color-accent)"
                      fontWeight={700}
                      filter="url(#vn-soft)"
                      opacity="0.55"
                      className="tnum"
                    >
                      {i + 1}
                    </text>
                  )}
                  <text
                    x={tx}
                    y={ty + 10}
                    textAnchor="middle"
                    fontSize="29"
                    fill={
                      isWinner
                        ? "var(--color-on-light)"
                        : hot
                          ? "var(--color-fg)"
                          : isHover
                            ? "var(--color-fg-body)"
                            : "var(--color-fg-muted)"
                    }
                    fontWeight={isWinner ? 800 : hot ? 700 : 300}
                    className="tnum"
                  >
                    {i + 1}
                  </text>
                </g>
              </g>
            );
          })}

          {/* The vine stops at the winning tile's edge: its final segment
              aims at the tile CENTER and it paints above the tiles, so
              without this it would lie across the numeral. */}
          {winningTile !== null && (
            <mask
              id="vn-vinemask"
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={BOARD_W}
              height={BOARD_W}
            >
              <rect x="0" y="0" width={BOARD_W} height={BOARD_W} fill="#FFF" />
              <g
                transform={`rotate(${TILE_ROT[winningTile].toFixed(2)} ${TILE_XY[winningTile][0]} ${TILE_XY[winningTile][1]})`}
              >
                <rect
                  x={TILE_XY[winningTile][0] - TILE_W / 2 + 2}
                  y={TILE_XY[winningTile][1] - TILE_W / 2 + 2}
                  width={TILE_W - 4}
                  height={TILE_W - 4}
                  rx="9"
                  fill="#000"
                  filter="url(#vn-maskfade)"
                />
              </g>
            </mask>
          )}

          {/* Arrival celebration at the winning tile. */}
          {winningTile !== null && (
            <>
              <g
                transform={`rotate(${TILE_ROT[winningTile].toFixed(2)} ${TILE_XY[winningTile][0]} ${TILE_XY[winningTile][1]})`}
              >
                <rect
                  ref={flashRef}
                  x={TILE_XY[winningTile][0] - TILE_W / 2}
                  y={TILE_XY[winningTile][1] - TILE_W / 2}
                  width={TILE_W}
                  height={TILE_W}
                  rx="10"
                  fill="#F6FFC2"
                  opacity="0"
                />
              </g>
              {/* The shockwave takes the TILE's shape, not a circle: a
                  perfect circle expanding out of a rotated square reads as
                  a stock impact effect. Two waves, offset in time — a
                  soft bloom trailing a tight bright edge — because a
                  single constant-width hoop is what makes an impact look
                  cheap. */}
              <g
                transform={`rotate(${TILE_ROT[winningTile].toFixed(2)} ${TILE_XY[winningTile][0]} ${TILE_XY[winningTile][1]})`}
              >
                <rect
                  ref={waveBRef}
                  data-wave="b"
                  x={TILE_XY[winningTile][0] - TILE_W / 2}
                  y={TILE_XY[winningTile][1] - TILE_W / 2}
                  width={TILE_W}
                  height={TILE_W}
                  rx="10"
                  fill="none"
                  stroke="var(--color-accent)"
                  filter="url(#vn-halo)"
                  opacity="0"
                />
                <rect
                  ref={waveARef}
                  data-wave="a"
                  x={TILE_XY[winningTile][0] - TILE_W / 2}
                  y={TILE_XY[winningTile][1] - TILE_W / 2}
                  width={TILE_W}
                  height={TILE_W}
                  rx="10"
                  fill="none"
                  stroke="var(--color-accent)"
                  opacity="0"
                />
              </g>
            </>
          )}

          {/* ── The vine (grows at settle; the pea rides its tip) ── */}
          <g mask={winningTile !== null ? "url(#vn-vinemask)" : undefined}>
            {/* BLOOM — the light the runner carries, composited over #000
                rather than blurred (cheaper and cleaner than a filter). */}
            <path
              ref={bloomRef}
              d=""
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="13"
              strokeOpacity="0.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* WOOD — lags 90 units behind the tip, so the growing end is
                thin and the base matches the stem it left. Taper for
                free, with no variable-width geometry. */}
            <path
              ref={woodRef}
              d=""
              fill="none"
              stroke="#3E5210"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* BODY — brightest at the tip: the PEA carries the light,
                the vine behind it is only lit by where it has been. */}
            <path
              ref={vineRef}
              d=""
              fill="none"
              stroke="url(#vn-vinegrad)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* TIP — the wet growing point, only the leading 40 units. */}
            <path
              ref={wetRef}
              d=""
              fill="none"
              stroke="#F6FFC2"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g ref={tipRef} opacity="0" data-tip>
            <PeaSprite r={PEA_R} gradientId="vn-pea" filter="url(#vn-soft)" />
          </g>

          {/* ── The sprout: the pea's home at the field's heart ── */}
          <g ref={sproutRef} transform={`translate(${CX} ${CY})`}>
            <g
              className={
                settling ? "board-sway-rooted board-hold" : "board-sway-rooted"
              }
            >
              <g ref={chargeRef}>
                {/* Stem: a TAPERED body, not a uniform stroke — thick where
                  it leaves the pea, drawn to a point at the tip, with a
                  lit left flank and a shaded right one so it reads round
                  rather than as a drawn line. */}
                <path
                  d="M-3.1 25 C -6 7 -4.4 -10 -0.7 -25.5 L0.7 -25.5 C 0.5 -10 0.4 7 3.1 25 Z"
                  fill="url(#vn-plantlit)"
                />
                <path
                  d="M-3.1 25 C -6 7 -4.4 -10 -0.7 -25.5"
                  fill="none"
                  stroke="rgba(214,255,140,0.34)"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
                <path
                  d="M3.1 25 C 0.4 7 0.5 -10 0.7 -25.5"
                  fill="none"
                  stroke="rgba(0,0,0,0.38)"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
                {/* The node the leaves spring from — without a swelling here
                  the leaves look pasted onto the stem. */}
                <ellipse
                  cx="0"
                  cy="-8.5"
                  rx="3.6"
                  ry="2.6"
                  fill="url(#vn-plantlit)"
                />

                {/* Leaf pair. Each is a silhouette + a midrib + a shade that
                  deepens toward the tip + a rim light on the edge facing
                  the pea. Deliberately unequal: the left leaf is larger
                  and rides higher, which is what stops a symmetrical pair
                  from reading as a logo. */}
                {/* Left leaf. */}
                <path
                  d="M0 -9 Q -33 -13.5 -33 -47 Q -4.3 -38.6 0 -9 Z"
                  fill="url(#vn-plantlit)"
                />
                <path
                  d="M0 -9 Q -33 -13.5 -33 -47 Q -4.3 -38.6 0 -9 Z"
                  fill="url(#vn-leafshade)"
                />
                <path
                  d="M0 -9 Q -14 -25 -32.4 -46"
                  fill="none"
                  stroke="rgba(0,0,0,0.34)"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                />
                <path
                  d="M0 -9 Q -33 -13.5 -33 -47"
                  fill="none"
                  stroke="rgba(206,255,128,0.30)"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
                {/* Right leaf: smaller, seated lower. */}
                <path
                  d="M0 -6 Q 30.3 -11.2 30 -42 Q 4.3 -32.9 0 -6 Z"
                  fill="url(#vn-plantlit)"
                />
                <path
                  d="M0 -6 Q 30.3 -11.2 30 -42 Q 4.3 -32.9 0 -6 Z"
                  fill="url(#vn-leafshade)"
                />
                <path
                  d="M0 -6 Q 13 -22 29.5 -41"
                  fill="none"
                  stroke="rgba(0,0,0,0.34)"
                  strokeWidth="1.05"
                  strokeLinecap="round"
                />
                <path
                  d="M0 -6 Q 30.3 -11.2 30 -42"
                  fill="none"
                  stroke="rgba(206,255,128,0.28)"
                  strokeWidth="0.85"
                  strokeLinecap="round"
                />
              </g>
              {/* The node the runner grows from. Hidden beneath the pea at
                  rest; once the pea detaches this is what the vine visibly
                  emerges out of, instead of a bare stroke cap floating
                  beside the stem. Drawn before the pea so the pea covers
                  it, and the whole sprout paints above the vine. */}
              <g filter="url(#vn-pegdrop)">
                <path
                  d="M-6.6 27.5 C -7.6 33.4 -4.2 37.4 0 37.4 C 4.2 37.4 7.6 33.4 6.6 27.5 C 4.4 23.6 -4.4 23.6 -6.6 27.5 Z"
                  fill="url(#vn-node)"
                />
              </g>
              {/* Rim on the lit flank, and the crease where the runner
                  leaves — shading, not a drawn line. */}
              <path
                d="M-6.3 26.9 C -5.2 24.1 -2.5 23.2 0.3 23.3"
                fill="none"
                stroke="rgba(214,255,140,0.34)"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
              <path
                d="M-6.6 27.5 C -7.6 33.4 -4.2 37.4 0 37.4 C 4.2 37.4 7.6 33.4 6.6 27.5 C 4.4 23.6 -4.4 23.6 -6.6 27.5 Z"
                fill="url(#vn-nodeshade)"
              />
              {/* The pea at the sprout's base (leaves with the vine). */}
              <g ref={sproutPeaRef}>
                <g transform="translate(0 30)">
                  <PeaSprite
                    r={PEA_R}
                    gradientId="vn-pea"
                    filter="url(#vn-soft)"
                    circleClassName={
                      settling ? "wheel-breathe board-hold" : "wheel-breathe"
                    }
                  />
                </g>
              </g>
            </g>
          </g>
        </svg>

        {/* Keyboard + assistive layer: one roving tab stop around the
            pentagon; focus lights the tile like hover. */}
        <div role="group" aria-label="Choose tiles">
          {tiles.map((tile, i) => (
            <button
              key={i}
              ref={(n) => {
                btnRefs.current[i] = n;
              }}
              type="button"
              aria-disabled={!interactive}
              tabIndex={i === focusIdx ? 0 : -1}
              aria-pressed={
                selected.has(i as TileId) || deployedTiles.includes(i as TileId)
              }
              aria-label={`Tile ${i + 1}, ${tile.ethFormatted} ETH deployed${
                deployedTiles.includes(i as TileId) ? ", your deploy" : ""
              }${landed && winningTile === i ? ", winning tile" : ""}`}
              className="focus-ring pointer-events-none absolute h-[9%] w-[9%] -translate-x-1/2 -translate-y-1/2 rounded-xl"
              style={{
                left: `${((TILE_XY[i][0] - VIEW_X) / VIEW_W) * 100}%`,
                top: `${((TILE_XY[i][1] - VIEW_Y) / VIEW_W) * 100}%`,
              }}
              onClick={() => {
                // Guarded, not natively disabled: keeps keyboard focus on
                // the board when the round settles instead of dropping it
                // to <body> twice a minute.
                if (interactive) onToggle(i as TileId);
              }}
              onFocus={() => setHoverIdx(i as TileId)}
              onBlur={() =>
                setHoverIdx((h) => (h === (i as TileId) ? null : h))
              }
              onKeyDown={(e) => {
                const next =
                  e.key === "ArrowRight" || e.key === "ArrowDown"
                    ? (i + 1) % N
                    : e.key === "ArrowLeft" || e.key === "ArrowUp"
                      ? (i + N - 1) % N
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? N - 1
                          : null;
                if (next !== null) {
                  e.preventDefault();
                  moveFocus(next);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Result announcement for assistive tech. */}
      <span aria-live="polite" className="sr-only">
        {landed && winningTile !== null
          ? `Tile ${winningTile + 1} wins the round.`
          : ""}
      </span>
    </div>
  );
}
