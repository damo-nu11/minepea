/**
 * Wheel spin compiler — the deterministic heart of the pod wheel.
 *
 * The VRF's winning pod DECIDES the spin: total rotation is a seeded
 * number of full laps plus exactly the delta that parks the winning
 * wedge's center at 6 o'clock, where the hub's hatch releases the pea.
 * compileSpin(winningPod, roundId) returns the fully-timed choreography;
 * evaluate(spin, elapsed) is a closed-form function of elapsed time, so
 * a client mounting mid-spin renders the correct in-flight frame,
 * throttled tabs snap true on resume, and all clients agree (the same
 * rules as the plinko path compiler and the grid reveal before it).
 *
 * GEOMETRY (unit space 1000 x 1000, clockwise angles from 12 o'clock):
 * - 25 wedges, wedge i spans [i, i+1) * TAU/25; numbers touch (single
 *   hairline separators, no gaps).
 * - Wedge band: HUB_R 170 to RIM_R 470; numerals upright at NUMERAL_R.
 * - The pea ball idles at the hub center; the hatch sits at the hub's
 *   bottom edge. "Down" at 6 o'clock is +y, i.e. increasing radius, so
 *   the drop is a straight vertical fall into the parked winner.
 *
 * TIMELINE (ms from settle start; fits SETTLING_MS = 8200):
 *   arm 1000 (stillness) -> spin 4500 (ease in, cruise, long smooth
 *   decay to the park) -> fall 380 -> bounce 650 -> rest.
 *   T_LANDED 5880, T_SETTLED 6530. The hub's mouth at 6 o'clock is
 *   permanently open; there are no hatch doors.
 */

import { createRng } from "@/lib/mock/rng";

// ── Geometry ───────────────────────────────────────────────────────────────
export const WHEEL_VB = 1000;
export const CX = 500;
export const CY = 500;
export const RIM_R = 470;
export const BEZEL_R = 484;
export const HUB_R = 195;
/** Numerals sit mid-band: the seated pea occupies r 430-460 at the
 * pocket floor, so the numeral band must clear it (user 2026-07-18). */
export const NUMERAL_R = 398;
export const WEDGE_COUNT = 25;
/** Pocket mouth (inner edge of the drawn pocket floor/walls). */
export const POCKET_MOUTH_R = HUB_R + 14;
/** Pointer hit band: slightly forgiving beyond the drawn surface. */
export const HIT_R_MIN = HUB_R - 6;
export const HIT_R_MAX = BEZEL_R + 14;
export const BALL_R = 15;
/** Ball center at rest: just off the wedge floor (the rim). */
export const BALL_REST_R = RIM_R - BALL_R - 10;

export const TAU = Math.PI * 2;
export const WEDGE_RAD = TAU / WEDGE_COUNT;
export const wedgeCenterRad = (i: number): number => (i + 0.5) * WEDGE_RAD;

// ── Timeline ───────────────────────────────────────────────────────────────
export const T_ARM = 1000;
export const T_SPIN = 4500;
export const T_FALL = 380;
export const T_BOUNCE = 650;
export const T_LANDED = T_ARM + T_SPIN + T_FALL; // 5880
export const T_SETTLED = T_LANDED + T_BOUNCE; // 6530
export const RIPPLE_STEP_MS = 40;

/** Spin velocity profile: ramp up over the first RAMP of the spin,
 * then decay with exponent DECAY_Q — slow start, quick middle, and a
 * LONG crawl into the park (the ending is the drama). Piecewise-polynomial and analytically
 * invertible (clack times need exact inverses). */
const RAMP = 0.3;
const DECAY_Q = 4.6;
/** Peak normalized velocity so the profile integrates to 1. */
const V_PEAK = 1 / (RAMP / 2 + (1 - RAMP) / (DECAY_Q + 1));
/** Position fraction covered by the end of the ramp. */
const RAMP_END_F = (V_PEAK * RAMP) / 2;


export interface WheelSpin {
  winningPod: number;
  laps: number;
  /** Final wheel rotation (rad, clockwise positive). */
  totalRad: number;
  /** Trailing separator-crossing moments (the slowing "clacks"). */
  impacts: { t: number }[];
}

export interface WheelFrame {
  /** Wheel rotation to apply this frame (rad). */
  wheelRad: number;
  /** Ball center distance below the wheel center (px along 6 o'clock). */
  ballR: number;
  /** Squash & stretch around the landing (1 = round). */
  scaleX: number;
  scaleY: number;
  /** True once the ball has come to rest. */
  settled: boolean;
  phase: "idle" | "arm" | "spin" | "fall" | "bounce" | "rest";
}

const easeInQuad = (u: number) => u * u;

/** Position along the spin, 0..1 -> 0..1 (ramp then decay). */
function spinEase(u: number): number {
  if (u <= RAMP) return (V_PEAK * u * u) / (2 * RAMP);
  const w = (u - RAMP) / (1 - RAMP);
  return (
    RAMP_END_F +
    ((V_PEAK * (1 - RAMP)) / (DECAY_Q + 1)) * (1 - Math.pow(1 - w, DECAY_Q + 1))
  );
}

/** Exact inverse of spinEase (for separator-crossing times). */
function spinEaseInv(f: number): number {
  if (f <= RAMP_END_F) return Math.sqrt((2 * RAMP * f) / V_PEAK);
  const k = (V_PEAK * (1 - RAMP)) / (DECAY_Q + 1);
  const w = 1 - Math.pow(1 - (f - RAMP_END_F) / k, 1 / (DECAY_Q + 1));
  return RAMP + (1 - RAMP) * w;
}

/** Deterministic seed from the round + target (same mixer as plinko). */
function seedFor(roundId: number, winningPod: number): number {
  let h = (roundId * 2654435761) ^ (winningPod * 40503);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Compile the spin for a round. Pure: same inputs, same spin, on every
 * client, every time.
 */
export function compileSpin(winningPod: number, roundId: number): WheelSpin {
  const rng = createRng(seedFor(roundId, winningPod));
  const laps = 3 + (rng.next() < 0.5 ? 0 : 1);

  // Park the winner's center at 6 o'clock: c_w + total ≡ π (mod TAU).
  const base = (Math.PI - wedgeCenterRad(winningPod) + TAU) % TAU;
  const totalRad = base + laps * TAU;

  // Separator crossings of the 6 o'clock line: wheelRad(t) = π - j*δ + mTAU.
  // The ease is analytically invertible, so each crossing time is exact.
  const impacts: { t: number }[] = [];
  for (let m = 0; ; m++) {
    let done = false;
    for (let j = 0; j < WEDGE_COUNT; j++) {
      const target = Math.PI - j * WEDGE_RAD + m * TAU;
      if (target <= 0) continue;
      if (target > totalRad) {
        if (j === 0) done = true;
        continue;
      }
      const u = spinEaseInv(target / totalRad);
      impacts.push({ t: T_ARM + u * T_SPIN });
    }
    if (done || m > laps + 2) break;
  }
  impacts.sort((a, b) => a.t - b.t);

  // EVERY crossing ships: the flapper is struck on each separator that
  // sweeps past the mouth, from first lap to final crawl.
  return { winningPod, laps, totalRad, impacts };
}

/** Squash factor around the landing impact. */
function squashAt(elapsed: number): { sx: number; sy: number } {
  const d = elapsed - T_LANDED;
  if (d >= 0 && d < 90) {
    const u = d / 90;
    const amt = (1 - u) * (1 - u) * 0.22;
    return { sx: 1 + amt, sy: 1 - amt };
  }
  if (d >= -60 && d < 0) {
    const amt = (1 + d / 60) * 0.1;
    return { sx: 1 - amt, sy: 1 + amt };
  }
  return { sx: 1, sy: 1 };
}

/** Evaluate the wheel + ball pose at `elapsed` ms since settle start. */
export function evaluate(spin: WheelSpin, elapsedMs: number): WheelFrame {
  const e = Math.max(0, elapsedMs);
  const { sx, sy } = squashAt(e);

  if (e < T_ARM) {
    return {
      wheelRad: 0,
      ballR: 0, scaleX: 1, scaleY: 1,
      settled: false, phase: "arm",
    };
  }
  if (e < T_ARM + T_SPIN) {
    const u = (e - T_ARM) / T_SPIN;
    return {
      wheelRad: spin.totalRad * spinEase(u),
      ballR: 0, scaleX: 1, scaleY: 1,
      settled: false, phase: "spin",
    };
  }
  if (e < T_LANDED) {
    const u = (e - T_ARM - T_SPIN) / T_FALL;
    return {
      wheelRad: spin.totalRad,
      ballR: BALL_REST_R * easeInQuad(u),
      scaleX: sx, scaleY: sy,
      settled: false, phase: "fall",
    };
  }
  if (e < T_SETTLED) {
    const dt = e - T_LANDED;
    const lift = 30 * Math.exp(-dt / 210) * Math.abs(Math.sin(dt / 95));
    return {
      wheelRad: spin.totalRad,
      ballR: BALL_REST_R - lift,
      scaleX: sx, scaleY: sy,
      settled: false, phase: "bounce",
    };
  }
  return {
    wheelRad: spin.totalRad,
    ballR: BALL_REST_R, scaleX: 1, scaleY: 1,
    settled: true, phase: "rest",
  };
}
