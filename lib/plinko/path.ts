/**
 * Plinko path compiler — the deterministic heart of the pod drop.
 *
 * compilePath(winningPod, roundId) returns a fully-timed choreography:
 * stalk travel, pea detach, six peg-to-peg arcs, the pod entry, and the
 * damped landing bounces. EVERY frame is a closed-form function of elapsed
 * time via evaluate(path, elapsed) — no stored animation state, so a
 * client mounting mid-drop renders the correct in-flight frame, throttled
 * tabs snap true on resume, and all clients agree (same rules as the grid
 * reveal this replaces; see the round-end notes in the project docs).
 *
 * Outcome-first by construction: the VRF's winning pod DECIDES the path;
 * the pea can only ever land there. The left/right bounce sequence is
 * derived (never rejection-sampled) from the lattice identity below, and
 * all "randomness" (release point, bounce order) is mulberry32-seeded from
 * (roundId, winningPod) — deterministic across clients, varied across
 * rounds.
 *
 * LATTICE GEOMETRY (unit space 1000 x 846, wide-aspect so the rendered
 * board stays inside the viewport at full pane width):
 * - 25 pods, centers x = 20 + 40i (i = 0..24).
 * - A 16-row peg triangle from apex to floor; row r has r+1 pegs at
 *   x = 500 - 30r + 60k, each strike deflecting ±30. 15 deflections land
 *   on the bottom row's 60-unit lattice and the final roll-off covers the
 *   ≤30-unit residual into the exact pod center, so every pod is
 *   reachable by construction; the tests prove all 25 × many seeds land
 *   dead-center.
 */

import { createRng } from "@/lib/mock/rng";

// ── Geometry (unit space; the board renders it at any pixel size) ──────────
export const BOARD_W = 1000;
export const BOARD_H = 846;
export const POD_COUNT = 25;
export const POD_STEP = 40;
export const POD_MOUTH_Y = 708;
export const POD_REST_Y = 744;
/** Coarse Galton triangle (user 2026-07-18: fewer, bigger dots spanning
 * apex to floor): 16 rows, one more peg per row, apex under the pod.
 * Row r has r+1 pegs at x = 500 - 30r + 60k; each strike deflects ±30.
 * 15 inter-row deflections land on the bottom row's 60-unit lattice; the
 * final roll-off from the last peg covers the ≤30-unit residual into the
 * exact pod center, so every pod stays exactly addressable. */
export const PEG_ROWS = 16;
export const PEG_ROW_Y0 = 148;
export const PEG_ROW_STEP = 36;
export const STALK_HOME_X = 500;
export const POD_HANG_Y = 96;
export const PEA_R = 12;

export const podX = (i: number): number => 20 + POD_STEP * i;
export const pegRowY = (r: number): number => PEG_ROW_Y0 + PEG_ROW_STEP * r;
/** Peg x-positions for triangle row r (r+1 pegs, centered). */
export function pegXs(row: number): number[] {
  return Array.from({ length: row + 1 }, (_, k) => 500 - 30 * row + 60 * k);
}

// ── Timeline (ms from settle start; fits SETTLING_MS = 8200) ───────────────
export const T_AIM_END = 800; // the pod trembles + splits at the apex
export const T_DETACH_END = 1150; // free fall to the apex peg
/** 15 inter-row hops, quickening as the cascade builds. */
const HOP_DURATIONS = Array.from({ length: 15 }, (_, r) => 250 - r * 6);
export const T_EXIT_MS = 260; // last peg rolls off into the pod mouth
export const T_ENTRY_MS = 170; // mouth -> rest
export const T_BOUNCE_MS = 650; // damped settle bounces
/** Winner ignition + loser ripple starts here. */
export const T_LANDED =
  T_DETACH_END +
  HOP_DURATIONS.reduce((a, b) => a + b, 0) +
  T_EXIT_MS +
  T_ENTRY_MS; // ~5100
export const T_SETTLED = T_LANDED + T_BOUNCE_MS;
/** Per-pod ripple delay: |i - winner| * this. */
export const RIPPLE_STEP_MS = 40;

export interface PathSegment {
  t0: number;
  t1: number;
  kind: "aim" | "detach" | "hop" | "exit" | "entry" | "bounce" | "rest";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Arc rise above the chord (hops/exit). */
  h: number;
}

export interface PlinkoPath {
  winningPod: number;
  releaseX: number;
  segments: PathSegment[];
  /** Impact moments (peg hits + floor) for squash + peg glints. */
  impacts: { t: number; x: number; y: number; row: number | null }[];
}

export interface PeaFrame {
  x: number;
  y: number;
  /** Squash & stretch around impacts (1 = round). */
  scaleX: number;
  scaleY: number;
  /** Where the stalk currently hangs its pod. */
  stalkX: number;
  /** 0 closed .. 1 fully split. */
  podOpen: number;
  /** Pea visible yet? (false while still inside the pod) */
  peaVisible: boolean;
  /** True once the pea has come to rest. */
  settled: boolean;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const easeInQuad = (u: number) => u * u;

/** Deterministic seed from the round + target (order-independent mixing). */
function seedFor(roundId: number, winningPod: number): number {
  let h = (roundId * 2654435761) ^ (winningPod * 40503);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Compile the full drop for a round. Pure: same inputs, same path, on
 * every client, every time.
 */
export function compilePath(winningPod: number, roundId: number): PlinkoPath {
  const rng = createRng(seedFor(roundId, winningPod));
  const targetX = podX(winningPod);

  // Bottom-row pegs sit at 50 + 60j (j = 0..15). Aim the walk at the peg
  // nearest the target pod; the final roll-off covers the ≤30-unit
  // residual. Ties break with the seed so repeat winners still vary.
  const bottom = pegXs(15);
  let endX = bottom[0];
  for (const x of bottom) {
    const d = Math.abs(x - targetX) - Math.abs(endX - targetX);
    if (d < 0 || (d === 0 && rng.next() < 0.5)) endX = x;
  }

  // 15 deflections of ±30 from the apex: rights k = (endX - 500)/60 + 7.5.
  const k = (endX - 500) / 60 + 7.5;
  const dirs: number[] = [
    ...Array.from({ length: k }, () => 1),
    ...Array.from({ length: 15 - k }, () => -1),
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  // Peg struck on each row: apex, then follow the deflections. The walk
  // can never leave the triangle (max drift after r steps = 30r).
  const xs: number[] = [500];
  for (let r = 0; r < 15; r++) xs.push(xs[r] + dirs[r] * 30);

  const segments: PathSegment[] = [];
  const impacts: PlinkoPath["impacts"] = [];

  segments.push({
    t0: 0, t1: T_AIM_END, kind: "aim",
    x0: STALK_HOME_X, y0: POD_HANG_Y, x1: STALK_HOME_X, y1: POD_HANG_Y, h: 0,
  });
  segments.push({
    t0: T_AIM_END, t1: T_DETACH_END, kind: "detach",
    x0: 500, y0: POD_HANG_Y, x1: 500, y1: pegRowY(0), h: 0,
  });
  impacts.push({ t: T_DETACH_END, x: 500, y: pegRowY(0), row: 0 });

  let t = T_DETACH_END;
  for (let r = 0; r < 15; r++) {
    const t1 = t + HOP_DURATIONS[r];
    segments.push({
      t0: t, t1, kind: "hop",
      x0: xs[r], y0: pegRowY(r), x1: xs[r + 1], y1: pegRowY(r + 1),
      h: 14 - r * 0.4,
    });
    impacts.push({ t: t1, x: xs[r + 1], y: pegRowY(r + 1), row: r + 1 });
    t = t1;
  }

  const exitEnd = t + T_EXIT_MS;
  segments.push({
    t0: t, t1: exitEnd, kind: "exit",
    x0: xs[15], y0: pegRowY(15), x1: targetX, y1: POD_MOUTH_Y + 8, h: 9,
  });
  const entryEnd = exitEnd + T_ENTRY_MS;
  segments.push({
    t0: exitEnd, t1: entryEnd, kind: "entry",
    x0: targetX, y0: POD_MOUTH_Y + 8, x1: targetX, y1: POD_REST_Y, h: 0,
  });
  impacts.push({ t: entryEnd, x: targetX, y: POD_REST_Y, row: null });
  segments.push({
    t0: entryEnd, t1: entryEnd + T_BOUNCE_MS, kind: "bounce",
    x0: targetX, y0: POD_REST_Y, x1: targetX, y1: POD_REST_Y, h: 0,
  });
  segments.push({
    t0: entryEnd + T_BOUNCE_MS, t1: Infinity, kind: "rest",
    x0: targetX, y0: POD_REST_Y, x1: targetX, y1: POD_REST_Y, h: 0,
  });

  return { winningPod, releaseX: 500, segments, impacts };
}

/** Squash factor near impacts: brief 90ms compress + elastic recover. */
function squashAt(path: PlinkoPath, elapsed: number): { sx: number; sy: number } {
  for (const imp of path.impacts) {
    const d = elapsed - imp.t;
    if (d >= 0 && d < 90) {
      const u = d / 90;
      const amt = (1 - u) * (1 - u) * 0.2;
      return { sx: 1 + amt, sy: 1 - amt };
    }
    // Slight stretch just BEFORE an impact (falling fast).
    if (d >= -60 && d < 0) {
      const amt = (1 + d / 60) * 0.09;
      return { sx: 1 - amt, sy: 1 + amt };
    }
  }
  return { sx: 1, sy: 1 };
}

/** Evaluate the pea + stalk pose at `elapsed` ms since settle start. */
export function evaluate(path: PlinkoPath, elapsedMs: number): PeaFrame {
  const e = Math.max(0, elapsedMs);
  const seg =
    path.segments.find((s) => e < s.t1) ??
    path.segments[path.segments.length - 1];
  const u = seg.t1 === Infinity ? 1 : clamp((e - seg.t0) / (seg.t1 - seg.t0), 0, 1);
  const { sx, sy } = squashAt(path, e);

  const stalkX = STALK_HOME_X; // the apex drop needs no travel
  // The pod splits over the last 150ms of the aim.
  const podOpen = clamp((e - (T_AIM_END - 150)) / 220, 0, 1);

  let x = seg.x1;
  let y = seg.y1;
  let settled = false;
  switch (seg.kind) {
    case "aim":
      return {
        x: stalkX, y: POD_HANG_Y, scaleX: 1, scaleY: 1,
        stalkX, podOpen, peaVisible: false, settled: false,
      };
    case "detach":
      x = seg.x0;
      y = seg.y0 + (seg.y1 - seg.y0) * easeInQuad(u);
      break;
    case "hop":
    case "exit": {
      // Quadratic Bezier through a control point risen above the chord —
      // the pea pops off each peg before gravity takes it again.
      const cx = (seg.x0 + seg.x1) / 2;
      const cy = (seg.y0 + seg.y1) / 2 - seg.h;
      const inv = 1 - u;
      x = inv * inv * seg.x0 + 2 * inv * u * cx + u * u * seg.x1;
      y = inv * inv * seg.y0 + 2 * inv * u * cy + u * u * seg.y1;
      break;
    }
    case "entry":
      x = seg.x0;
      y = seg.y0 + (seg.y1 - seg.y0) * easeInQuad(u);
      break;
    case "bounce": {
      // Two visible damped bounces off the pod floor.
      const dt = e - seg.t0;
      const amp = 22 * Math.exp(-dt / 220);
      x = seg.x0;
      y = seg.y0 - amp * Math.abs(Math.sin((dt / 350) * Math.PI * 2));
      break;
    }
    case "rest":
      settled = true;
      break;
  }

  return {
    x, y, scaleX: sx, scaleY: sy,
    stalkX, podOpen, peaVisible: true, settled,
  };
}
