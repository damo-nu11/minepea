"use client";

/**
 * The Wheel board — RETIRED 2026-07-19: the /wheel route and ?wheel flag
 * are deleted and nothing mounts this board. Kept on disk with its tests
 * (its spin compiler and materiality set the bar the vine board follows);
 * VineBoard is the live board.
 *
 * Anatomy (unit space 1000x1048 — the extra height carries the drop
 * chevron and floor reflection below the bezel):
 * - THE RING: 25 pocket wedges around a full circle — each an OPEN-
 *   MOUTHED pocket (two radial walls + a rounded rim floor, the inner
 *   edge open toward the hub), numerals held upright at every angle.
 *   Three brightness tiers: full line-slate walls over alternating
 *   near-black fills, numerals at fg-muted minimum. Crowd ETH renders
 *   as heat in the wedge FILL only (0.02 floor to 0.14 cap).
 *   LIGHT RULE: exactly three permitted light sources — the pea, the
 *   selection, the winner. Everything else is structure and stays at or
 *   under line-slate brightness.
 * - THE HUB: a clean recessed bowl, no readouts. A vine curls down from
 *   its top rim and the pea hangs off the stem at the center, swaying
 *   and breathing while the round runs. The hub ring is permanently
 *   OPEN at 6 o'clock, and a fixed chevron + spotlight anchor the drop
 *   zone below it.
 * - THE REVEAL: at settle the wheel eases into its spin, cruises, and
 *   decays smoothly until the winning pocket parks under the mouth;
 *   the pea detaches from the stem, free-falls through the opening into
 *   the pocket, bounces, ignites. At the next round the wheel UNWINDS
 *   forward to canonical over a short tween (never a teleport).
 *
 * Every frame comes from lib/wheel/spin.ts as a pure function of
 * (now - endsAt); per-frame writes are imperative via refs (React style
 * props would be clobbered by the ~3/s engine re-renders). The landed
 * flip is CLOCK-ANCHORED via setTimeout (hidden tabs suspend rAF).
 * All static geometry (paths, anchors, ticks) is precomputed at module
 * scope — render and the rAF loop only read tables.
 * Reduced motion skips both spin and unwind; the winner ignites in
 * place with the pea seated, announced via the live region.
 *
 * Input: pointer hits resolve on angle + radius across the whole ring
 * with pointer capture for the full drag gesture; hovered pockets
 * highlight with a pointer cursor; drag-paint sweeps by angle so fast
 * flicks cannot skip wedges (wraparound takes the short way); keyboard
 * gets a roving tabindex — arrows orbit the ring, Home/End jump to the
 * ends, focus lights the wedge exactly like hover.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PeaGradientDef, PeaSprite } from "@/components/mine/peaArt";
import {
  BALL_R,
  BALL_REST_R,
  BEZEL_R,
  compileSpin,
  CX,
  CY,
  evaluate,
  HIT_R_MAX,
  HIT_R_MIN,
  HUB_R,
  NUMERAL_R,
  POCKET_MOUTH_R,
  RIM_R,
  RIPPLE_STEP_MS,
  T_FALL,
  T_LANDED,
  TAU,
  WEDGE_COUNT,
  WEDGE_RAD,
  wedgeCenterRad,
  WHEEL_VB,
} from "@/lib/wheel/spin";
import type { RoundVM, TileId } from "@/lib/types";

interface WheelBoardProps {
  round: RoundVM;
  selected: Set<TileId>;
  deployedTiles: TileId[];
  interactive: boolean;
  onToggle(id: TileId, forceOp?: "add" | "remove"): void;
}

const DEG = 180 / Math.PI;
/** Angular half-gap between pocket walls (the pods' slight-gap rule). */
const POCKET_INSET = 0.012;
/** ViewBox height: extra room below the bezel for the drop chevron and
 * the floor reflection that grounds the wheel in the page. */
const VB_H = 1048;
/** Alternating near-black wedge fills: adjacent wedges separate without
 * labels (two close lime-tinted tones, both well under the walls). */
const FILL_EVEN = "rgba(204,255,0,0.030)";
const FILL_ODD = "rgba(204,255,0,0.012)";
/** The wrap wedge (25 beside 1, both even) takes a mid tone so the
 * alternation never doubles at the 12 o'clock seam. */
const FILL_MID = "rgba(204,255,0,0.021)";
/** Round-roll unwind: finish the lap back to canonical, eased. */
const UNWIND_MS = 700;

const pol = (r: number, a: number): [number, number] => [
  CX + r * Math.sin(a),
  CY - r * Math.cos(a),
];

// ── Static geometry, computed ONCE at module scope (the component
// re-renders ~3x/sec on engine ticks and on every hover change; nothing
// below ever changes with state) ─────────────────────────────────────────
function sectorFillPath(i: number): string {
  const a0 = i * WEDGE_RAD + POCKET_INSET;
  const a1 = (i + 1) * WEDGE_RAD - POCKET_INSET;
  const [x00, y00] = pol(POCKET_MOUTH_R, a0);
  const [x01, y01] = pol(RIM_R, a0);
  const [x11, y11] = pol(RIM_R, a1);
  const [x10, y10] = pol(POCKET_MOUTH_R, a1);
  return (
    `M${x01.toFixed(1)} ${y01.toFixed(1)} A${RIM_R} ${RIM_R} 0 0 1 ${x11.toFixed(1)} ${y11.toFixed(1)} ` +
    `L${x10.toFixed(1)} ${y10.toFixed(1)} A${POCKET_MOUTH_R} ${POCKET_MOUTH_R} 0 0 0 ${x00.toFixed(1)} ${y00.toFixed(1)} Z`
  );
}

function pocketStrokePath(i: number): string {
  const a0 = i * WEDGE_RAD + POCKET_INSET;
  const a1 = (i + 1) * WEDGE_RAD - POCKET_INSET;
  const [mx0, my0] = pol(POCKET_MOUTH_R, a0);
  const [fx0, fy0] = pol(RIM_R, a0);
  const [fx1, fy1] = pol(RIM_R, a1);
  const [mx1, my1] = pol(POCKET_MOUTH_R, a1);
  return (
    `M${mx0.toFixed(1)} ${my0.toFixed(1)} L${fx0.toFixed(1)} ${fy0.toFixed(1)} ` +
    `A${RIM_R} ${RIM_R} 0 0 1 ${fx1.toFixed(1)} ${fy1.toFixed(1)} ` +
    `L${mx1.toFixed(1)} ${my1.toFixed(1)}`
  );
}

const IDX = Array.from({ length: WEDGE_COUNT }, (_, i) => i);
const SECTOR_PATHS = IDX.map(sectorFillPath);
const POCKET_PATHS = IDX.map(pocketStrokePath);
const NUMERAL_XY = IDX.map((i) => pol(NUMERAL_R, wedgeCenterRad(i)));
const BTN_XY = IDX.map((i) => pol((HUB_R + RIM_R) / 2, wedgeCenterRad(i)));
/** Short boundary ticks INSIDE the rim-to-bezel band, line-slate only. */
const TICKS = IDX.map((j) => {
  const [tx0, ty0] = pol(RIM_R + 4, j * WEDGE_RAD);
  const [tx1, ty1] = pol(RIM_R + 11, j * WEDGE_RAD);
  return [tx0, ty0, tx1, ty1] as const;
});

const SPOTLIGHT_D = (() => {
  const a0 = Math.PI - WEDGE_RAD / 2;
  const a1 = Math.PI + WEDGE_RAD / 2;
  const [x00, y00] = pol(POCKET_MOUTH_R, a0);
  const [x01, y01] = pol(RIM_R, a0);
  const [x11, y11] = pol(RIM_R, a1);
  const [x10, y10] = pol(POCKET_MOUTH_R, a1);
  return `M${x01.toFixed(1)} ${y01.toFixed(1)} A${RIM_R} ${RIM_R} 0 0 1 ${x11.toFixed(1)} ${y11.toFixed(1)} L${x10.toFixed(1)} ${y10.toFixed(1)} A${POCKET_MOUTH_R} ${POCKET_MOUTH_R} 0 0 0 ${x00.toFixed(1)} ${y00.toFixed(1)} Z`;
})();
const CHEVRON_D = `M${CX} ${CY + BEZEL_R + 4} l -9 15 h 18 Z`;
const hubArc = (r: number, halfGap: number) => {
  const [x0, y0] = pol(r, Math.PI + halfGap);
  const [x1, y1] = pol(r, Math.PI - halfGap);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 1 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
/** Mouth half-angle: a hair past the wedge's own half-angle (0.1257),
 * so the opening hugs the parked pocket's walls. */
const MOUTH_HALF = 0.135;
const HUB_ARC_OUTER_D = hubArc(HUB_R, MOUTH_HALF);
const HUB_ARC_INNER_D = hubArc(HUB_R - 12, MOUTH_HALF + 0.04);
/** Fret studs at every separator's rim end (ride the wheel). */
const STUD_XY = IDX.map((j) => pol(RIM_R - 2, j * WEDGE_RAD));
/** The flapper hangs at the right edge of the mouth, clear of the
 * pea's fall line, and gets kicked by each passing separator. */
const FLAPPER_PIVOT = pol(HUB_R + 3, Math.PI - MOUTH_HALF);
/** Rest pose: the blade hangs RADIALLY (parallel to the parked
 * pocket's wall), not screen-down. */
const FLAPPER_REST_DEG = -(MOUTH_HALF * 180) / Math.PI;
const FLAPPER_D = "M0 0 L4.5 2.5 L2 32 L-3.5 31 Z";
/** When the falling pea passes the mouth and brushes the flapper. */
const FLAPPER_BRUSH_T = T_LANDED - Math.round(0.34 * T_FALL);
/** Where the winning pocket's center sits once parked. */
const WINNER_POCKET_Y = CY + (HUB_R + RIM_R) / 2;
/** Hover lift: the pocket rises 6 units outward along its bisector. */
const LIFT_XY = IDX.map((i) => [
  Math.sin(wedgeCenterRad(i)) * 6,
  -Math.cos(wedgeCenterRad(i)) * 6,
]);
// ── The stalk illustration (hand-authored in unit space; the hub is
// fixed at 500,500 r195). Design rule: NO outlines — every part is
// painted by ONE radial gradient centered on the glowing pea, so
// surfaces near the pea catch its light and everything else falls to
// silhouette. Geometry is deliberately asymmetric (real plants droop). ──
/** Tapering vine ribbon, one smooth S. The crown starts at y320,
 * inside the bowl, clear of the hub's neon boundary. */
const VINE_D =
  "M496 320 C 508 350, 488 388, 496 420 C 501 442, 496 460, 499 473 " +
  "L 504 473 C 500 459, 506 441, 501 418 C 492 387, 516 351, 504 320 Z";
/** A pea tendril coiling up-right, kept inside the bowl. */
const TENDRIL_D =
  "M500 356 C 522 348, 535 336, 528 324 C 523 314, 514 315, 515 322 " +
  "C 516 328, 523 327, 525 321";
/** Upper-right leaflet + a small bud opposite (asymmetric node). */
const LEAF_UR_D =
  "M500.5 374 C 518 365, 536 366, 545 376 C 535 385, 517 384, 500.5 377 Z";
const BUD_UL_D =
  "M500.5 345 C 487 340, 478 342, 473 348 C 479 353, 489 352, 500.5 348 Z";
/** Main pair: each leaf is built like a real blade — a midrib splits
 * it into a lit lower half (facing the pea) and a shadowed upper half,
 * with pinnate veins curving toward the tip. */
const LEAF_L_MIDRIB_D = "M503 440 C 476 442, 450 448, 424 454";
const LEAF_L_TOP_D =
  "M503 440 C 487 430, 465 423, 448 424 C 436 426, 427 441, 424 454 " +
  "C 450 448, 476 442, 503 440 Z";
const LEAF_L_BOT_D =
  "M503 440 C 476 442, 450 448, 424 454 C 429 462, 441 469, 456 468 " +
  "C 473 466, 492 457, 503 447 L 503 440 Z";
const LEAF_L_VEINS_LIT = [
  "M478 444 Q 470 452 463 461",
  "M462 448 Q 455 455 449 462",
  "M446 451 Q 440 456 435 460",
];
const LEAF_L_VEINS_SHADE = [
  "M478 441 Q 468 436 459 431",
  "M460 445 Q 450 440 442 436",
];
const LEAF_R_MIDRIB_D = "M499 452 C 522 454, 548 460, 571 468";
const LEAF_R_TOP_D =
  "M499 452 C 512 443, 533 438, 550 442 C 562 446, 569 457, 571 468 " +
  "C 548 460, 522 454, 499 452 Z";
const LEAF_R_BOT_D =
  "M499 452 C 522 454, 548 460, 571 468 C 564 476, 550 481, 535 479 " +
  "C 518 477, 505 468, 499 459 L 499 452 Z";
const LEAF_R_VEINS_LIT = [
  "M521 456 Q 528 464 534 472",
  "M537 460 Q 543 466 549 472",
  "M553 464 Q 558 468 562 471",
];
const LEAF_R_VEINS_SHADE = [
  "M523 452 Q 532 447 541 445",
  "M539 456 Q 548 452 556 452",
];
/** The calyx GRIPS the pea: a pedicel and cap above the crown, then
 * three sepals wrapping down over the sphere itself, each rim-lit by
 * the pea behind it. Drawn after the pea so they sit on it. */
const PEDICEL_D = "M500 473 C 499 476, 499 478, 500 481";
const SEPAL_FRONT_M_D =
  "M500 482 C 496 489, 495 498, 499 508 C 500 510, 501 510, 502 508 " +
  "C 505 498, 504 489, 500 482 Z";
const SEPAL_FRONT_L_D =
  "M497 483 C 488 487, 483 495, 485 504 C 486 506, 488 506, 489 504 " +
  "C 492 497, 495 490, 497 483 Z";
const SEPAL_FRONT_R_D =
  "M503 483 C 512 487, 517 495, 515 504 C 514 506, 512 506, 511 504 " +
  "C 508 497, 505 490, 503 483 Z";

export function WheelBoard({
  round,
  selected,
  deployedTiles,
  interactive,
  onToggle,
}: WheelBoardProps) {
  const { roundId, winningTile, endsAt, phase } = round;
  const settling = phase !== "active";
  const animating = settling && winningTile !== null;

  // Hover (pointer affordance; keyboard focus drives it too) + roving
  // focus + drag-paint by angular sweep.
  const [hoverIdx, setHoverIdx] = useState<TileId | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const dragOp = useRef<"add" | "remove" | null>(null);
  const lastIdx = useRef<number | null>(null);
  const visited = useRef<Set<TileId>>(new Set());

  const [landed, setLanded] = useState(false);
  if (!settling && landed) setLanded(false);
  if (!interactive && hoverIdx !== null) setHoverIdx(null);

  const wheelRef = useRef<SVGGElement>(null);
  const ballRef = useRef<SVGGElement>(null);
  const stalkPeaRef = useRef<SVGGElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const flapperRef = useRef<SVGGElement>(null);
  const flashRef = useRef<SVGPathElement>(null);
  const igniteRingRef = useRef<SVGCircleElement>(null);
  const numeralRefs = useRef<Map<number, SVGGElement>>(new Map());
  const slotRefs = useRef<Map<number, SVGGElement>>(new Map());
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** Where the wheel stopped last round (feeds the unwind tween). */
  const parkedRad = useRef(0);
  /** The rotation currently painted on the wheel: hit-testing must
   * subtract it (during the unwind the board is interactive while the
   * wheel is still visibly rotated). */
  const appliedRad = useRef(0);

  /** Write the wheel pose + upright numeral counter-rotations. */
  const applyWheelPose = (rad: number) => {
    appliedRad.current = rad;
    const deg = (rad * DEG).toFixed(2);
    wheelRef.current?.setAttribute("transform", `rotate(${deg} ${CX} ${CY})`);
    for (const [i, node] of numeralRefs.current) {
      const [nx, ny] = NUMERAL_XY[i];
      node.setAttribute(
        "transform",
        `rotate(${-Number(deg)} ${nx.toFixed(1)} ${ny.toFixed(1)})`,
      );
    }
  };

  // ── The reveal ───────────────────────────────────────────────────────────
  // LAYOUT effect deliberately: at round roll React runs layout cleanups
  // before layout setups, so this cleanup (cancel the rAF, record the
  // parked angle) is guaranteed to precede the reset effect below. As a
  // plain effect its cleanup ran AFTER the reset, letting one stray tick
  // from the dead round re-hide the stalk pea for the whole next round
  // (the "pea disappears from the hub" bug) and feeding the unwind a
  // stale parked angle.
  useLayoutEffect(() => {
    if (!animating || winningTile === null) return;
    const spin = compileSpin(winningTile, roundId);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const wheel = wheelRef.current;
    const ball = ballRef.current;
    if (!wheel || !ball) return;

    const applyPodStates = (elapsed: number) => {
      for (let i = 0; i < WEDGE_COUNT; i++) {
        const node = slotRefs.current.get(i);
        if (!node) continue;
        if (i === winningTile) {
          node.style.opacity = "1";
          continue;
        }
        const d = Math.abs(i - winningTile);
        const delay = Math.min(d, WEDGE_COUNT - d) * RIPPLE_STEP_MS;
        node.style.opacity = elapsed >= T_LANDED + delay ? "0.25" : "1";
      }
    };

    if (reduced) {
      // No spin: seat the pea in the winner where it stands.
      const [bx, by] = pol(BALL_REST_R, wedgeCenterRad(winningTile));
      ball.setAttribute("transform", `translate(${bx} ${by})`);
      ball.style.opacity = "1";
      if (stalkPeaRef.current) stalkPeaRef.current.style.opacity = "0";
      applyPodStates(Number.POSITIVE_INFINITY);
      setLanded(true);
      return;
    }

    let raf = 0;
    let live = true;
    let announced = false;
    let lastDeg = "";
    const landTimer = setTimeout(
      () => setLanded(true),
      Math.max(0, endsAt + T_LANDED - Date.now()),
    );
    const tick = () => {
      if (!live) return;
      const elapsed = Date.now() - endsAt;
      const f = evaluate(spin, elapsed);

      // Once parked, the 26 rotate writes are skipped (deg unchanged).
      const deg = (f.wheelRad * DEG).toFixed(2);
      if (deg !== lastDeg) {
        lastDeg = deg;
        appliedRad.current = f.wheelRad;
        wheel.setAttribute("transform", `rotate(${deg} ${CX} ${CY})`);
        for (const [i, node] of numeralRefs.current) {
          const [nx, ny] = NUMERAL_XY[i];
          node.setAttribute(
            "transform",
            `rotate(${-Number(deg)} ${nx.toFixed(1)} ${ny.toFixed(1)})`,
          );
        }
      }

      // The pea leaves the stem the moment the fall begins.
      const flight =
        f.phase === "fall" || f.phase === "bounce" || f.phase === "rest";
      ball.style.opacity = flight ? "1" : "0";
      if (stalkPeaRef.current)
        stalkPeaRef.current.style.opacity = flight ? "0" : "1";
      ball.setAttribute(
        "transform",
        `translate(${CX} ${(CY + f.ballR).toFixed(1)}) scale(${f.scaleX.toFixed(3)} ${f.scaleY.toFixed(3)})`,
      );

      // The flapper answers every separator crossing. The wheel turns
      // clockwise, so at the mouth the separators sweep LEFT: each strike
      // knocks the blade left (positive rotation in y-down SVG space),
      // then it springs back. During the fast laps the hits overlap into
      // a held flutter; through the crawl they resolve into single clacks.
      if (flapperRef.current) {
        let ang = 0;
        for (let k = spin.impacts.length - 1; k >= 0; k--) {
          const dt = elapsed - spin.impacts[k].t;
          if (dt >= 0) {
            if (dt < 600) ang = 34 * Math.exp(-dt / 110) * Math.sin(dt / 40);
            break;
          }
        }
        // The falling pea brushes the flapper on its way into the pocket.
        const dtBrush = elapsed - FLAPPER_BRUSH_T;
        if (dtBrush >= 0 && dtBrush < 600)
          ang += -22 * Math.exp(-dtBrush / 110) * Math.sin(dtBrush / 40);
        flapperRef.current.setAttribute(
          "transform",
          `translate(${FLAPPER_PIVOT[0].toFixed(1)} ${FLAPPER_PIVOT[1].toFixed(1)}) rotate(${(FLAPPER_REST_DEG + ang).toFixed(2)})`,
        );
      }

      // Landing: one near-white flash frame + one expanding stroke ring,
      // then the ignite glow the winner already has.
      const dtLand = elapsed - T_LANDED;
      if (flashRef.current) {
        flashRef.current.style.opacity =
          dtLand >= 0 && dtLand < 90
            ? (0.85 * (1 - dtLand / 90)).toFixed(2)
            : "0";
      }
      if (igniteRingRef.current) {
        const ring = igniteRingRef.current;
        if (dtLand >= 0 && dtLand < 520) {
          const u = dtLand / 520;
          const ease = 1 - Math.pow(1 - u, 3);
          ring.setAttribute("r", (40 + 300 * ease).toFixed(1));
          ring.setAttribute("stroke-width", (3 - 2 * u).toFixed(2));
          ring.style.opacity = (0.5 * (1 - u)).toFixed(2);
        } else {
          ring.style.opacity = "0";
        }
      }

      applyPodStates(elapsed);
      if (!announced && elapsed >= T_LANDED) {
        announced = true;
        setLanded(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      clearTimeout(landTimer);
      // Remember where the wheel parked for the round-roll unwind.
      parkedRad.current = spin.totalRad % TAU;
    };
  }, [animating, winningTile, roundId, endsAt]);

  // Fresh round: reset BEFORE paint (a plain effect runs post-paint and
  // painted one stale rotated frame — MineGrid's documented lesson), then
  // UNWIND the wheel forward to canonical instead of teleporting.
  useLayoutEffect(() => {
    if (settling) return;
    ballRef.current?.setAttribute("transform", `translate(${CX} ${CY})`);
    ballRef.current?.style.setProperty("opacity", "0");
    stalkPeaRef.current?.style.setProperty("opacity", "1");
    for (const node of slotRefs.current.values()) node.style.opacity = "1";
    flapperRef.current?.setAttribute(
      "transform",
      `translate(${FLAPPER_PIVOT[0].toFixed(1)} ${FLAPPER_PIVOT[1].toFixed(1)}) rotate(${FLAPPER_REST_DEG.toFixed(2)})`,
    );
    if (flashRef.current) flashRef.current.style.opacity = "0";
    if (igniteRingRef.current) igniteRingRef.current.style.opacity = "0";

    const start = parkedRad.current % TAU;
    parkedRad.current = 0;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (start < 1e-6 || reduced) {
      applyWheelPose(0);
      return;
    }
    // Paint continuity: first frame matches the parked pose, then finish
    // the lap forward (never reverse) on an eased tween.
    applyWheelPose(start);
    const residual = TAU - start;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / UNWIND_MS);
      const eased = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      applyWheelPose((start + residual * eased) % TAU);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [settling, roundId]);

  // ── Angular hit-testing (whole-ring pointer surface) ─────────────────────
  const wedgeAt = (clientX: number, clientY: number): TileId | null => {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const scale = WHEEL_VB / rect.width;
    const x = (clientX - rect.left) * scale - CX;
    const y = (clientY - rect.top) * scale - CY;
    const r = Math.hypot(x, y);
    if (r < HIT_R_MIN || r > HIT_R_MAX) return null;
    const theta =
      (Math.atan2(x, -y) - (appliedRad.current % TAU) + 2 * TAU) % TAU;
    return Math.min(WEDGE_COUNT - 1, Math.floor(theta / WEDGE_RAD)) as TileId;
  };

  const paint = (idx: TileId) => {
    if (dragOp.current === null || visited.current.has(idx)) return;
    visited.current.add(idx);
    onToggle(idx, dragOp.current);
  };

  const endDrag = () => {
    dragOp.current = null;
    lastIdx.current = null;
    visited.current.clear();
  };

  const moveFocus = (to: number) => {
    setFocusIdx(to);
    btnRefs.current[to]?.focus();
  };

  const tiles = round.tiles;
  const maxEth = Math.max(...tiles.map((t) => t.eth), 1e-9);
  const hovering = interactive && hoverIdx !== null;

  return (
    <div className="w-full select-none">
      {/* Width double-capped by pane and viewport height. */}
      <div
        ref={surfaceRef}
        className={`relative mx-auto w-full touch-none ${hovering ? "cursor-pointer" : ""}`}
        style={{
          aspectRatio: `${WHEEL_VB} / ${VB_H}`,
          maxWidth: `calc((100dvh - 160px) * ${(WHEEL_VB / VB_H).toFixed(3)})`,
        }}
        onPointerDown={(e) => {
          if (!interactive) return;
          const idx = wedgeAt(e.clientX, e.clientY);
          if (idx === null) return;
          e.preventDefault();
          // Capture the pointer: the angular sweep keeps receiving moves
          // for the whole gesture no matter where the finger wanders.
          try {
            surfaceRef.current?.setPointerCapture?.(e.pointerId);
          } catch {
            // Pointer already gone — the drag simply ends on pointerup.
          }
          dragOp.current = selected.has(idx) ? "remove" : "add";
          lastIdx.current = idx;
          visited.current = new Set();
          paint(idx);
        }}
        onPointerMove={(e) => {
          if (!interactive) return; // nothing can happen; skip the math
          const idx = wedgeAt(e.clientX, e.clientY);
          if (idx !== hoverIdx) setHoverIdx(idx);
          if (dragOp.current === null || idx === null) return;
          // Sweep every wedge between the last position and this one so a
          // fast flick cannot skip any (wraparound takes the short way).
          const from = lastIdx.current ?? idx;
          let d = idx - from;
          if (d > WEDGE_COUNT / 2) d -= WEDGE_COUNT;
          if (d < -WEDGE_COUNT / 2) d += WEDGE_COUNT;
          const step = d >= 0 ? 1 : -1;
          for (let k = from; k !== idx; k = (k + step + WEDGE_COUNT) % WEDGE_COUNT) {
            paint(((k + step + WEDGE_COUNT) % WEDGE_COUNT) as TileId);
          }
          lastIdx.current = idx;
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <svg
          viewBox={`0 0 ${WHEEL_VB} ${VB_H}`}
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <PeaGradientDef id="wl-pea" />
            {/* Floor reflection pool beneath the wheel. */}
            <radialGradient id="wl-floor" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(204,255,0,0.06)" />
              <stop offset="70%" stopColor="rgba(204,255,0,0.015)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            {/* Warm material base: lighter at the heart, darkening
                toward the rim (kills the flat-vector read). */}
            <radialGradient
              id="wl-base"
              gradientUnits="userSpaceOnUse"
              cx={CX}
              cy={CY}
              r={RIM_R}
            >
              <stop offset="0%" stopColor="#0D1005" />
              <stop offset="72%" stopColor="#0A0C04" />
              <stop offset="100%" stopColor="#060803" />
            </radialGradient>
            {/* Faint environmental light from 12 o'clock (does not
                rotate with the wheel — light stays put). */}
            <linearGradient id="wl-toplight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
              <stop offset="42%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            {/* Machined stud material (shared look with the peg field). */}
            <radialGradient id="wl-stud" cx="34%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#6B7D30" />
              <stop offset="45%" stopColor="#39461A" />
              <stop offset="100%" stopColor="#121707" />
            </radialGradient>
            {/* Static blur for the elevation shadows (never animated). */}
            <filter id="wl-blur7" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            {/* Hub bowl: recessed, falling to black at the center. */}
            <radialGradient id="wl-hub" cx="50%" cy="46%" r="60%">
              <stop offset="0%" stopColor="#0C1005" />
              <stop offset="72%" stopColor="#070903" />
              <stop offset="100%" stopColor="#101505" />
            </radialGradient>
            {/* The plant's light model: ONE radial gradient centered on
                the pea paints every part of the stalk, so surfaces near
                the glowing pea catch lime and the rest falls away to
                silhouette. */}
            <radialGradient
              id="wl-plantlit"
              gradientUnits="userSpaceOnUse"
              cx={CX}
              cy={CY}
              r="210"
            >
              <stop offset="7%" stopColor="#A9C43E" />
              <stop offset="15%" stopColor="#5F7A1E" />
              <stop offset="32%" stopColor="#2E3E10" />
              <stop offset="62%" stopColor="#161F0A" />
              <stop offset="100%" stopColor="#0C1106" />
            </radialGradient>
            {/* Shadowed upper leaf halves (the lit halves use the
                pea-centred plant light). */}
            <linearGradient id="wl-leafshade" x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="#232F0D" />
              <stop offset="100%" stopColor="#121A07" />
            </linearGradient>
            {/* Winner ignition wash rising from the pocket floor. */}
            <linearGradient id="wl-ignite" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(204,255,0,0.32)" />
              <stop offset="70%" stopColor="rgba(204,255,0,0.06)" />
              <stop offset="100%" stopColor="rgba(204,255,0,0)" />
            </linearGradient>
            <filter id="wl-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="wl-soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ambient depth behind the wheel. */}
          <radialGradient id="wl-ambient" cx="50%" cy="50%" r="60%">
            <stop offset="55%" stopColor="rgba(204,255,0,0.045)" />
            <stop offset="85%" stopColor="rgba(204,255,0,0.01)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <circle cx={CX} cy={CY} r={BEZEL_R + 12} fill="url(#wl-ambient)" />

          {/* Floor reflection: seats the wheel in the page. */}
          <ellipse cx={CX} cy={BEZEL_R + CY + 32} rx="340" ry="24" fill="url(#wl-floor)" />

          {/* The outer glow ring: the wheel's neon frame (sanctioned
              frame light, outside all play surfaces). */}
          <circle
            cx={CX}
            cy={CY}
            r={BEZEL_R + 3}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="14"
            opacity="0.3"
            filter="url(#wl-glow)"
          />
          <circle
            cx={CX}
            cy={CY}
            r={BEZEL_R + 3}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.6"
            opacity="0.95"
            filter="url(#wl-soft)"
          />

          {/* Outer bezel: crisp double ring + tick marks at every wedge
              boundary (the fixed chassis the wheel spins inside). */}
          <circle cx={CX} cy={CY} r={BEZEL_R} fill="none" stroke="var(--color-line-slate)" strokeWidth="1.5" />
          <circle cx={CX} cy={CY} r={BEZEL_R - 7} fill="none" stroke="var(--color-line-faint)" strokeWidth="1.5" />
          {TICKS.map(([tx0, ty0, tx1, ty1], j) => (
            <line
              key={`tick-${j}`}
              x1={tx0}
              y1={ty0}
              x2={tx1}
              y2={ty1}
              stroke="var(--color-line-slate)"
              strokeWidth="1.5"
            />
          ))}

          {/* Warm base + top light: the surface the wedges tint. */}
          <circle cx={CX} cy={CY} r={RIM_R} fill="url(#wl-base)" />
          <circle cx={CX} cy={CY} r={RIM_R} fill="url(#wl-toplight)" />

          {/* ── The wheel: everything that rotates ── */}
          <g ref={wheelRef}>
            {tiles.map((tile, i) => {
              const isSel = selected.has(i as TileId);
              const isDeployed = deployedTiles.includes(i as TileId);
              const isWinner = landed && winningTile === i;
              const isHover = hovering && hoverIdx === i && !isWinner;
              const [nx, ny] = NUMERAL_XY[i];
              const heat = tile.eth / maxEth;
              return (
                <g
                  key={i}
                  ref={(n) => {
                    if (n) slotRefs.current.set(i, n);
                  }}
                  transform={
                    isHover
                      ? `translate(${LIFT_XY[i][0].toFixed(1)} ${LIFT_XY[i][1].toFixed(1)})`
                      : undefined
                  }
                >
                  {/* Tier 3: near-black fill (alternating tones; voltage
                      fills for selection, ignition for the winner). */}
                  <path
                    d={SECTOR_PATHS[i]}
                    fill={
                      isWinner
                        ? "url(#wl-ignite)"
                        : isSel || isDeployed
                          ? "var(--color-surface-active)"
                          : isHover
                            ? "rgba(204,255,0,0.08)"
                            : i === WEDGE_COUNT - 1
                              ? FILL_MID
                              : i % 2
                                ? FILL_ODD
                                : FILL_EVEN
                    }
                  />
                  {/* The money: heat lives in the FILL only — a solid
                      accent wash whose opacity tracks the wedge's share
                      (0.02 floor, 0.14 cap). Background: it can never
                      collide with structure or numerals. */}
                  {!isWinner && (
                    <path
                      d={SECTOR_PATHS[i]}
                      fill="var(--color-accent)"
                      fillOpacity={Math.min(0.14, 0.02 + 0.12 * heat).toFixed(3)}
                    />
                  )}
                  {(isSel || isDeployed) && !isWinner && (
                    <path d={SECTOR_PATHS[i]} fill="rgba(204,255,0,0.10)" />
                  )}
                  {/* Tier 1: the pocket structure — open mouth toward
                      the hub, uniform line-slate at rest; only the three
                      permitted light sources change it. */}
                  <path
                    d={POCKET_PATHS[i]}
                    fill="none"
                    stroke={
                      isWinner || isSel || isDeployed
                        ? "var(--color-accent)"
                        : isHover
                          ? "#B7E62E"
                          : "var(--color-line-slate)"
                    }
                    strokeWidth={
                      isWinner ? 3.2 : isSel || isDeployed ? 2.6 : isHover ? 2.4 : 1.6
                    }
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={
                      isWinner || isSel || isDeployed || isHover
                        ? "url(#wl-soft)"
                        : undefined
                    }
                  />
                  {/* Tier 2: the numeral IS the bet surface. */}
                  <g
                    ref={(n) => {
                      if (n) numeralRefs.current.set(i, n);
                    }}
                  >
                    <text
                      x={nx}
                      y={ny + 10 - 1.4}
                      textAnchor="middle"
                      fontSize="28"
                      fill={
                        isSel || isDeployed || isWinner
                          ? "var(--color-accent)"
                          : "#040502"
                      }
                      opacity={isSel || isDeployed || isWinner ? 0.65 : 1}
                      filter={
                        isSel || isDeployed || isWinner
                          ? "url(#wl-soft)"
                          : undefined
                      }
                      fontWeight={isWinner ? 800 : isSel || isDeployed ? 700 : 400}
                      className="tnum"
                      aria-hidden
                    >
                      {i + 1}
                    </text>
                    <text
                      x={nx}
                      y={ny + 10}
                      textAnchor="middle"
                      fontSize="28"
                      fill={
                        isWinner ? "var(--color-accent)" : "var(--color-fg)"
                      }
                      fontWeight={isWinner ? 800 : isSel || isDeployed ? 700 : 400}
                      filter={isWinner ? "url(#wl-soft)" : undefined}
                      className="tnum"
                    >
                      {i + 1}
                    </text>
                  </g>
                </g>
              );
            })}
            {/* Fret studs at every separator's rim end. */}
            {STUD_XY.map(([sx, sy], j) => (
              <g key={`stud-${j}`}>
                <circle cx={sx} cy={sy} r="5" fill="url(#wl-stud)" stroke="#1A2100" strokeWidth="0.8" />
                <circle cx={sx - 1.5} cy={sy - 1.6} r="1.3" fill="#fff" opacity="0.38" />
              </g>
            ))}
            {/* Winner flash: one near-white frame at the landing. */}
            {winningTile !== null && (
              <path
                ref={flashRef}
                d={SECTOR_PATHS[winningTile]}
                fill="#F6FFC2"
                opacity="0"
              />
            )}
          </g>

          {/* Elevation: the bezel throws a soft shadow inward onto the
              ring and the hub throws one outward (static blurred rings,
              nothing animates). */}
          <circle
            cx={CX}
            cy={CY}
            r={RIM_R - 7}
            fill="none"
            stroke="rgba(0,0,0,0.38)"
            strokeWidth="16"
            filter="url(#wl-blur7)"
          />
          <circle
            cx={CX}
            cy={CY}
            r={HUB_R + 14}
            fill="none"
            stroke="rgba(0,0,0,0.42)"
            strokeWidth="16"
            filter="url(#wl-blur7)"
          />

          {/* The drop zone: a fixed spotlight over whatever wedge sits
              above the mouth — the wheel rotates beneath it, so at rest
              and at the park it brightens the wedge that matters. */}
          <path d={SPOTLIGHT_D} fill="rgba(204,255,0,0.03)" />
          {/* The chevron: the permanent tell for where the pea lands —
              small, tight to the bezel, no glow. */}
          <path d={CHEVRON_D} fill="var(--color-accent)" />

          {/* ── The hub: clean bowl with a permanently open mouth at
              6 o'clock — the gap in the circle the pea exits through ── */}
          <circle cx={CX} cy={CY} r={HUB_R} fill="url(#wl-hub)" />
          {/* The hub's neon: the SAME two-layer recipe as the outer
              frame (wide halo + crisp bright line), nothing drawn on
              top of it. */}
          <path
            d={HUB_ARC_OUTER_D}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="14"
            opacity="0.3"
            strokeLinecap="round"
            filter="url(#wl-glow)"
          />
          <path
            d={HUB_ARC_OUTER_D}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.6"
            opacity="0.95"
            strokeLinecap="round"
            filter="url(#wl-soft)"
          />
          <path
            d={HUB_ARC_INNER_D}
            fill="none"
            stroke="var(--color-line-faint)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* The flapper: kicked backward by every separator that sweeps
              past the mouth, springing forward as the wheel slows — the
              game-feel beat, driven off the compiled clack times. */}
          <g
            ref={flapperRef}
            transform={`translate(${FLAPPER_PIVOT[0].toFixed(1)} ${FLAPPER_PIVOT[1].toFixed(1)}) rotate(${FLAPPER_REST_DEG.toFixed(2)})`}
          >
            <path
              d={FLAPPER_D}
              fill="url(#wl-stud)"
              stroke="var(--color-line-slate)"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* The hinge: a lit pin seated in a machined collar at the
                neon ring's end-cap. */}
            <circle r="6.5" fill="var(--color-accent)" opacity="0.28" filter="url(#wl-glow)" />
            <circle r="4.6" fill="url(#wl-stud)" stroke="#1A2100" strokeWidth="0.9" />
            <circle r="2" fill="var(--color-accent)" filter="url(#wl-soft)" />
            <circle cx="-0.7" cy="-0.8" r="0.7" fill="#F6FFC2" opacity="0.8" />
          </g>

          {/* The stalk: a pea plant silhouette lit entirely by its own
              fruit — no outlines, one light. Leaves draw first so the
              vine lays over their joints; the calyx caps the pea and
              stays behind as the husk after the drop. */}
          <g className={settling ? "board-sway board-hold" : "board-sway"}>
            {/* Mounting collar where the vine exits the hub ring. */}
            <ellipse cx="500" cy="323" rx="7.5" ry="3.2" fill="url(#wl-plantlit)" />
            {/* Tendril, coiling for a grip that is not there. */}
            <path
              d={TENDRIL_D}
              fill="none"
              stroke="url(#wl-plantlit)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            {/* Foliage (behind the vine so the joints stay clean). Each
                blade: shadowed upper half, pea-lit lower half, midrib
                groove + ridge, pinnate veins curving to the tip. */}
            <path d={BUD_UL_D} fill="url(#wl-plantlit)" />
            <path d={LEAF_UR_D} fill="url(#wl-plantlit)" />
            {(
              [
                [LEAF_L_TOP_D, LEAF_L_BOT_D, LEAF_L_MIDRIB_D, LEAF_L_VEINS_LIT, LEAF_L_VEINS_SHADE],
                [LEAF_R_TOP_D, LEAF_R_BOT_D, LEAF_R_MIDRIB_D, LEAF_R_VEINS_LIT, LEAF_R_VEINS_SHADE],
              ] as const
            ).map(([top, bot, midrib, veinsLit, veinsShade], leaf) => (
              <g key={leaf}>
                <path d={top} fill="url(#wl-leafshade)" stroke="rgba(4,8,2,0.7)" strokeWidth="1" />
                <path d={bot} fill="url(#wl-plantlit)" stroke="rgba(4,8,2,0.7)" strokeWidth="1" />
                {veinsShade.map((d) => (
                  <path key={d} d={d} fill="none" stroke="rgba(8,12,4,0.5)" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
                ))}
                {veinsLit.map((d) => (
                  <path key={d} d={d} fill="none" stroke="rgba(8,12,4,0.55)" strokeWidth="1.1" strokeLinecap="round" />
                ))}
                <path d={midrib} fill="none" stroke="rgba(6,10,3,0.85)" strokeWidth="1.8" strokeLinecap="round" />
                <path d={midrib} fill="none" stroke="rgba(150,180,70,0.3)" strokeWidth="0.8" strokeLinecap="round" transform="translate(0 1.1)" />
              </g>
            ))}
            {/* The vine ribbon, over the leaf joints. */}
            <path d={VINE_D} fill="url(#wl-plantlit)" />
            {/* The hanging pea (hidden the moment the flight begins),
                haloed: the plant's light source. */}
            <g ref={stalkPeaRef} transform={`translate(${CX} ${CY})`}>
              <PeaSprite
                r={BALL_R}
                gradientId="wl-pea"
                filter="url(#wl-soft)"
                circleClassName={settling ? "wheel-breathe board-hold" : "wheel-breathe"}
              />
            </g>
            {/* The calyx grips the pea: sepals wrap down over the
                sphere, dark faces rimmed by the pea's light behind
                them. It outlives the drop as the empty husk. */}
            <path d={PEDICEL_D} fill="none" stroke="#33481A" strokeWidth="4" strokeLinecap="round" />
            <ellipse cx="500" cy="482" rx="7" ry="3.6" fill="#1E2A0C" stroke="#4E6B22" strokeWidth="1" />
            {[SEPAL_FRONT_L_D, SEPAL_FRONT_R_D, SEPAL_FRONT_M_D].map((d) => (
              <g key={d}>
                <path d={d} fill="none" stroke="#A9C43E" strokeWidth="2.4" opacity="0.5" strokeLinejoin="round" />
                <path d={d} fill="#16200A" stroke="#4E6B22" strokeWidth="1" strokeLinejoin="round" />
              </g>
            ))}
          </g>

          {/* Winner ignite ring: one expanding stroke on the landing. */}
          <circle
            ref={igniteRingRef}
            cx={CX}
            cy={WINNER_POCKET_Y}
            r="0"
            fill="none"
            stroke="var(--color-accent)"
            opacity="0"
          />

          {/* The flight pea (appears at detach). */}
          <g ref={ballRef} transform={`translate(${CX} ${CY})`} opacity="0" data-ball>
            <PeaSprite r={BALL_R} gradientId="wl-pea" filter="url(#wl-soft)" />
          </g>
        </svg>

        {/* Keyboard + assistive layer: one roving tab stop; arrows orbit
            the ring, Home/End jump to pods 1/25, focus lights the wedge
            like hover. Pointer input lives on the angular surface. */}
        <div role="group" aria-label="Choose pods">
          {tiles.map((tile, i) => (
            <button
              key={i}
              ref={(n) => {
                btnRefs.current[i] = n;
              }}
              type="button"
              disabled={!interactive}
              tabIndex={i === focusIdx ? 0 : -1}
              aria-pressed={
                selected.has(i as TileId) ||
                deployedTiles.includes(i as TileId)
              }
              aria-label={`Pod ${i + 1}, ${tile.ethFormatted} ETH deployed${
                deployedTiles.includes(i as TileId) ? ", your deploy" : ""
              }${landed && winningTile === i ? ", winning pod" : ""}`}
              className="focus-ring pointer-events-none absolute h-[9%] w-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${(BTN_XY[i][0] / WHEEL_VB) * 100}%`,
                top: `${(BTN_XY[i][1] / VB_H) * 100}%`,
              }}
              onClick={() => onToggle(i as TileId)}
              onFocus={() => setHoverIdx(i as TileId)}
              onBlur={() =>
                setHoverIdx((h) => (h === (i as TileId) ? null : h))
              }
              onKeyDown={(e) => {
                const next =
                  e.key === "ArrowRight" || e.key === "ArrowDown"
                    ? (i + 1) % WEDGE_COUNT
                    : e.key === "ArrowLeft" || e.key === "ArrowUp"
                      ? (i + WEDGE_COUNT - 1) % WEDGE_COUNT
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? WEDGE_COUNT - 1
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
          ? `Pod ${winningTile + 1} wins the round.`
          : ""}
      </span>
    </div>
  );
}
