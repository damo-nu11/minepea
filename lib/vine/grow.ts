/**
 * Vine pentagon compiler — the deterministic heart of the vine reveal.
 *
 * The VRF's winning tile DECIDES the vine: compileVine(winner, roundId)
 * peg-walks a seeded path from the center sprout outward through the
 * staggered peg field to the winning tile, and evaluate(elapsed) grows
 * it as a pure closed-form function of (now - endsAt) — arc-length
 * interpolation over the compiled polyline, no DOM path measurement.
 * Mid-joins render true, throttled tabs snap true on resume, and all
 * clients agree (the same rules as the wheel spin before it).
 *
 * GEOMETRY (unit space 1000 x 1000):
 * - A point-up pentagon of radius 420 around (500,500). Its five edges
 *   carry 25 tilted tiles (5 per edge, the bet surface), numbered
 *   1..25 clockwise from the top-right edge — the reference layout.
 * - Inside, a staggered peg lattice fills a 0.72-scaled pentagon with
 *   a clear hole at the center where the sprout lives.
 * - The walk: from the center, hop peg to peg with guaranteed forward
 *   progress toward the target and seeded lateral wander (pulled back
 *   toward the ray as it drifts), never reusing a peg; the final
 *   segment runs into the tile's face.
 *
 * TIMELINE (ms from settle start; fits SETTLING_MS = 8200):
 *   arm 600 (the sprout charges) -> growth (450ms per vertex, clamped
 *   3600..6400 so longer walks genuinely take longer, accelerating
 *   briefly then easing C1-smooth into the landing) -> arrival: tile
 *   floods, flash + ring, losers ripple. tSettled <= 7500; test-pinned.
 */

import { createRng } from "@/lib/mock/rng";

// ── Geometry ───────────────────────────────────────────────────────────────
export const BOARD_W = 1000;
export const BOARD_H = 1000;
export const CX = 500;
export const CY = 500;
export const PENT_R = 420;
export const TILE_W = 72;
const TILE_INSET = 3;
const END_MARGIN = 54;
export const SPROUT_HOLE_R = 70;
export const N_TILES = 25;

/** Pentagon vertices, point-up. */
export const PENT_V: readonly (readonly [number, number])[] = Array.from(
  { length: 5 },
  (_, k) => {
    const a = ((-90 + 72 * k) * Math.PI) / 180;
    return [CX + PENT_R * Math.cos(a), CY + PENT_R * Math.sin(a)] as const;
  },
);

/** Tile centers + rotations (deg), 5 per edge, reference numbering. */
export const TILE_XY: readonly (readonly [number, number])[] = [];
export const TILE_ROT: readonly number[] = [];
{
  const xy = TILE_XY as [number, number][];
  const rot = TILE_ROT as number[];
  for (let k = 0; k < 5; k++) {
    const A = PENT_V[k];
    const B = PENT_V[(k + 1) % 5];
    const ex = B[0] - A[0];
    const ey = B[1] - A[1];
    const eLen = Math.hypot(ex, ey);
    const ux = ex / eLen;
    const uy = ey / eLen;
    let nx = -uy;
    let ny = ux;
    if ((CX - A[0]) * nx + (CY - A[1]) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const avail = eLen - 2 * END_MARGIN;
    for (let j = 0; j < 5; j++) {
      const t = END_MARGIN + (avail * (j + 0.5)) / 5;
      xy.push([
        A[0] + ux * t + nx * (TILE_W / 2 + TILE_INSET),
        A[1] + uy * t + ny * (TILE_W / 2 + TILE_INSET),
      ]);
      rot.push((Math.atan2(uy, ux) * 180) / Math.PI);
    }
  }
}

/** Point-in-scaled-pentagon (ray cast). */
function inPent(x: number, y: number, scale: number): boolean {
  const vs = PENT_V.map(
    ([vx, vy]) => [CX + (vx - CX) * scale, CY + (vy - CY) * scale] as const,
  );
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const [xi, yi] = vs[i];
    const [xj, yj] = vs[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** The peg field: staggered lattice inside the 0.72 pentagon, fixed. */
export const PEGS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  let row = 0;
  for (let gy = CY - 315; gy <= CY + 345; gy += 34, row++) {
    const alt = row % 2 ? 20 : 0;
    for (let gx = CX - 338 + alt; gx <= CX + 338; gx += 40) {
      if (Math.hypot(gx - CX, gy - CY) < SPROUT_HOLE_R) continue;
      if (!inPent(gx, gy, 0.72)) continue;
      out.push([gx, gy]);
    }
  }
  return out;
})();

// ── Timeline ───────────────────────────────────────────────────────────────
export const T_ARM = 560;
export const GROW_MS_PER_VERT = 260;
export const GROW_MIN_MS = 3600;
export const GROW_MAX_MS = 6100;
/** Celebration hold after arrival before `settled`. The arrival chain
 * (flash, recoil, two waves, the board catching light, the loser ripple)
 * runs ~900ms and must finish inside it. */
export const T_CELEBRATE = 900;
/** Must equal SETTLING_MS in lib/mock/engine.ts — pinned by a test rather
 * than imported, so the compiler stays free of engine dependencies. */
export const SETTLE_WINDOW_MS = 8_200;

export interface VineGrowth {
  winningPod: number;
  /** Polyline from the sprout to the winning tile's center. */
  verts: readonly (readonly [number, number])[];
  /** Peg indices struck along the way (vert i+1 = hits[i] for walks). */
  hits: readonly number[];
  /** Cumulative lengths per vertex; total = cum[cum.length - 1]. */
  cum: readonly number[];
  total: number;
  growMs: number;
  tLanded: number;
  tSettled: number;
}

export interface VineFrame {
  /** Length of vine currently drawn (0..total). */
  vineLen: number;
  tipX: number;
  tipY: number;
  /** Sprout charge during the arm beat (0..1, then holds 1). */
  charge: number;
  settled: boolean;
  phase: "idle" | "arm" | "grow" | "landed" | "rest";
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The visible window into the 1000-unit board space. The art spans
 * x 97..904 / y 80..849, so rendering the whole canvas wastes ~20% on
 * margin; framing the art draws everything 1000/VIEW_W larger in the
 * same layout box (1000/800 = 1.25x). VIEW_Y is pushed past centre
 * (64.5) to 78, which seats the art just under the box's top edge so
 * the pentagon rides high and the slack falls below it. Pointer hit-testing and the assistive button overlay
 * both map through these, so they move together. */
export const VIEW_W = 800;
export const VIEW_X = 100.5;
export const VIEW_Y = 78;

/** Where the sprout's pea actually sits — the vine grows out of it, so
 * the pea never teleports at the handoff. Keep in step with the board's
 * sprout transform (translate(CX, CY) then the pea at local y = 30). */
export const SPROUT_X = CX;
export const SPROUT_Y = CY + 30;
/** One pea radius for both the sprout and the vine's tip. */
export const PEA_R = 14;

/** Where the vine MEETS the winning tile: the point on that tile's edge
 * facing the incoming vertex, rather than the tile's centre.
 *
 * The vine used to run to the centre, which put the pea on top of the
 * numeral and buried the line's tail under the block. Landing on the
 * edge means the line visibly terminates against the tile, the pea rests
 * against its face, and the numeral stays readable — contact is the cue
 * for the ignite rather than something that happens after it.
 */
export function contactPoint(
  pod: number,
  from: readonly [number, number],
): [number, number] {
  const [cx, cy] = TILE_XY[pod];
  const t = (TILE_ROT[pod] * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  // Approach vector in the tile's own frame (undo the tile's rotation).
  const dx = from[0] - cx;
  const dy = from[1] - cy;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const len = Math.hypot(lx, ly) || 1;
  const ux = lx / len;
  const uy = ly / len;
  // Distance from the centre to the square's edge along that direction.
  const h = TILE_W / 2;
  const s = Math.min(
    Math.abs(ux) > 1e-9 ? h / Math.abs(ux) : Infinity,
    Math.abs(uy) > 1e-9 ? h / Math.abs(uy) : Infinity,
  );
  // Back into page space.
  const ex = ux * s;
  const ey = uy * s;
  return [cx + ex * cos - ey * sin, cy + ex * sin + ey * cos];
}

/** Deterministic seed from the round + target (the boards' mixer). */
function seedFor(roundId: number, winningPod: number): number {
  let h = (roundId * 2654435761) ^ (winningPod * 40503);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Compile the vine for a round. Pure: same inputs, same walk, on every
 * client, every time.
 */
export function compileVine(winningPod: number, roundId: number): VineGrowth {
  const rng = createRng(seedFor(roundId, winningPod));

  // ── Near-misses. The reveal is outcome-first, so the walk can be routed
  //    past other tiles before it commits: each feint is a moment where a
  //    miner on that tile thinks they have it. Decoys are drawn from the
  //    far side of the ring so the turn away is legible, and the waypoint
  //    sits at the edge of the peg field, which is as close as the vine
  //    can physically get to a tile without landing on it. ──
  const feintCount = rng.next() < 0.3 ? 2 : 1;
  const feints: number[] = [];
  for (let f = 0; f < feintCount; f++) {
    for (let tries = 0; tries < 12; tries++) {
      const cand = Math.floor(rng.next() * N_TILES) % N_TILES;
      const ringGap = (a: number, b: number) => {
        const d = Math.abs(a - b);
        return Math.min(d, N_TILES - d);
      };
      const gap = ringGap(cand, winningPod);
      if (gap < 4 || gap > 9) continue;
      if (feints.some((p) => ringGap(cand, p) < 4)) continue;
      feints.push(cand);
      break;
    }
  }

  /** Waypoint just inside the field, off a tile's inward normal. */
  const approachOf = (pod: number): [number, number] => {
    const [px, py] = TILE_XY[pod];
    const d = Math.hypot(px - CX, py - CY) || 1;
    return [px - ((px - CX) / d) * 88, py - ((py - CY) / d) * 88];
  };

  const legs: { target: readonly [number, number]; stop: number }[] = [
    ...feints.map((p) => ({ target: approachOf(p), stop: 46 })),
    { target: TILE_XY[winningPod], stop: 74 },
  ];

  let cur: [number, number] = [SPROUT_X, SPROUT_Y];
  const verts: [number, number][] = [[SPROUT_X, SPROUT_Y]];
  const hits: number[] = [];
  const used = new Set<number>();
  let lastSide = 0;
  let runLen = 0;
  let guard = 0;

  for (const leg of legs) {
    // Each leg re-aims at its own target; the lateral wander is measured
    // from the leg's own origin, so a feint reads as a real intention
    // rather than a wobble on the way to the winner.
    const originX = cur[0];
    const originY = cur[1];
    const D = Math.hypot(leg.target[0] - originX, leg.target[1] - originY);
    if (D < 1) continue;
    const dirX = (leg.target[0] - originX) / D;
    const dirY = (leg.target[1] - originY) / D;
    const perpX = -dirY;
    const perpY = dirX;

    while (guard++ < 120) {
      const curF = (cur[0] - originX) * dirX + (cur[1] - originY) * dirY;
      if (D - curF < leg.stop) break;
      const curLat = (cur[0] - originX) * perpX + (cur[1] - originY) * perpY;
      const prog = curF / D;
      const first = verts.length === 1;
      const lo = 25;
      const hi = first ? 110 : 54;
      const minF = first ? 7 : 13;

      const collect = (hiBand: number) => {
        const L: { i: number; dist: number }[] = [];
        const R: { i: number; dist: number }[] = [];
        for (let i = 0; i < PEGS.length; i++) {
          if (used.has(i)) continue;
          const rx = PEGS[i][0] - cur[0];
          const ry = PEGS[i][1] - cur[1];
          const dist = Math.hypot(rx, ry);
          if (dist < lo || dist > hiBand) continue;
          const f = rx * dirX + ry * dirY;
          if (f < minF) continue;
          const l = rx * perpX + ry * perpY;
          (l < 0 ? L : R).push({ i, dist });
        }
        return [L, R] as const;
      };
      let [left, right] = collect(hi);

      const reduceSide = curLat > 0 ? -1 : 1;
      let pReduce: number;
      if (Math.abs(curLat) > 80) pReduce = 0.95;
      else if (prog > 0.6) pReduce = 0.78;
      else pReduce = 0.5 + Math.min(0.22, Math.abs(curLat) / 400);
      let side = rng.next() < pReduce ? reduceSide : -reduceSide;
      if (
        side === lastSide &&
        runLen >= 2 &&
        Math.abs(curLat) < 70 &&
        prog < 0.72
      )
        side = -side;
      let pool = side < 0 ? left : right;
      if (pool.length === 0) {
        side = -side;
        pool = side < 0 ? left : right;
      }
      if (pool.length === 0) {
        // Relax the band once before giving up: keeps the final straight
        // segment short instead of leaping a fifth of the board.
        [left, right] = collect(80);
        pool = side < 0 ? left : right;
        if (pool.length === 0) pool = side < 0 ? right : left;
        if (pool.length === 0) break;
      }
      pool.sort((a, b) => a.dist - b.dist);
      const pick = pool[0];
      used.add(pick.i);
      cur = [PEGS[pick.i][0], PEGS[pick.i][1]];
      verts.push([cur[0], cur[1]]);
      hits.push(pick.i);
      runLen = side === lastSide ? runLen + 1 : 1;
      lastSide = side;
    }
  }
  // Close the gap. The feints spend pegs, so the final approach can find
  // its preferred band empty; rather than leap the remaining distance in
  // one straight line, keep taking the best available hop that genuinely
  // closes on the tile until we are within reach of it.
  {
    const [wx, wy] = TILE_XY[winningPod];
    while (guard++ < 200) {
      const d = Math.hypot(wx - cur[0], wy - cur[1]);
      if (d < 74) break;
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < PEGS.length; i++) {
        if (used.has(i)) continue;
        const hop = Math.hypot(PEGS[i][0] - cur[0], PEGS[i][1] - cur[1]);
        if (hop < 22 || hop > 104) continue;
        const nd = Math.hypot(wx - PEGS[i][0], wy - PEGS[i][1]);
        if (nd >= d - 6) continue; // must actually close
        // Prefer the hop that closes most per unit travelled.
        const score = nd - (d - nd) * 0.35;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best < 0) break;
      used.add(best);
      cur = [PEGS[best][0], PEGS[best][1]];
      verts.push([cur[0], cur[1]]);
      hits.push(best);
    }
  }

  verts.push(contactPoint(winningPod, cur));

  const cum = [0];
  for (let v = 1; v < verts.length; v++) {
    cum.push(
      cum[v - 1] +
        Math.hypot(
          verts[v][0] - verts[v - 1][0],
          verts[v][1] - verts[v - 1][1],
        ),
    );
  }
  const total = cum[cum.length - 1];
  // Structural clamp: the whole reveal must fit the settle window with
  // its tail intact. Without this a long walk silently loses its
  // celebration at the tick's static-pin gate while short walks look
  // fine — the worst kind of bug to find by eye.
  const growMs = Math.min(
    clamp(verts.length * GROW_MS_PER_VERT, GROW_MIN_MS, GROW_MAX_MS),
    SETTLE_WINDOW_MS - 200 - T_CELEBRATE - T_ARM,
  );
  const tLanded = T_ARM + growMs;

  return {
    winningPod,
    verts,
    hits,
    cum,
    total,
    growMs,
    tLanded,
    tSettled: tLanded + T_CELEBRATE,
  };
}

/** Growth ease: linear cruise, then a C1-smooth landing over the final
 * 12% (h(u) = u + u^2 - u^3 matches slope 1 at entry, slope 0 at rest). */
/** Speed arc, as a piecewise-analytic profile integrated to length:
 *
 *   [0, SURGE]      the vine BURSTS out of the sprout, decaying from
 *                   SURGE_X times cruise speed down to cruise
 *   [SURGE, CRAWL]  cruise
 *   [CRAWL, 1]      quadratic decay to a standstill — the crawl
 *
 * With the shipped constants the first 12% of the window covers ~27% of
 * the journey and the last 28% covers ~10%, so it leaves fast and
 * arrives slowly. Monotonic by construction (speed is never negative),
 * which is what lets growEaseInv bisect it. */
// Speed arc, integrated to length. Four phases: it ACCELERATES out of
// the sprout from rest, cruises, HESITATES as it nears the tile ("does it dare"), then
// COMMITS — accelerating into the face so the pea visibly strikes it.
// The old profile decayed to exactly zero at contact, so nothing ever
// hit anything and the flash, waves and recoil all fired uncaused.
// Speed is strictly positive throughout, so the curve stays monotonic
// and growEaseInv's bisection (and therefore strikeTimes) is unaffected.
const P_SURGE = 0.22;
const P_CRUISE = 0.62;
const P_HESITATE = 0.88;
const X_FLOOR = 0.1;
const X_COMMIT = 1.9;

/** Path covered by each phase, in units of cruise speed.
 * The launch is v = 1 - (1-t)^2: zero at rest, exactly cruise at its
 * end, so there is no speed jump anywhere in the profile. */
const L_SURGE = (P_SURGE * 2) / 3;
const L_CRUISE = P_CRUISE - P_SURGE;
const L_HESITATE = (1 + (X_FLOOR - 1) / 3) * (P_HESITATE - P_CRUISE);
const L_COMMIT = (X_FLOOR + (X_COMMIT - X_FLOOR) / 3) * (1 - P_HESITATE);
/** Cruise speed that makes the four phases integrate to exactly 1. */
const V1 = 1 / (L_SURGE + L_CRUISE + L_HESITATE + L_COMMIT);

const growEase = (k: number) => {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  if (k < P_SURGE) {
    // Accelerating out of the pod from a standstill.
    const t = k / P_SURGE;
    return V1 * P_SURGE * (t + (1 - t) ** 3 / 3 - 1 / 3);
  }
  if (k < P_CRUISE) return V1 * (L_SURGE + (k - P_SURGE));
  if (k < P_HESITATE) {
    const t = (k - P_CRUISE) / (P_HESITATE - P_CRUISE);
    return (
      V1 *
      (L_SURGE +
        L_CRUISE +
        (P_HESITATE - P_CRUISE) * (t + ((X_FLOOR - 1) * t * t * t) / 3))
    );
  }
  const t = (k - P_HESITATE) / (1 - P_HESITATE);
  return (
    V1 *
    (L_SURGE +
      L_CRUISE +
      L_HESITATE +
      (1 - P_HESITATE) *
        (X_FLOOR * t + ((X_COMMIT - X_FLOOR) * t * t * t) / 3))
  );
};

/** growEase inverted: the moment (0..1 of the growth window) at which the
 * vine reaches a given fraction of its length. growEase is monotonic by
 * construction (its speed profile is never negative), so bisecting it is
 * exact to within the tolerance and deterministic on every client. */
const growEaseInv = (f: number) => {
  if (f <= 0) return 0;
  if (f >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (growEase(mid) < f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** When the vine passes each struck peg, in ms from the round's end — the
 * analogue of the wheel's clack times. Closed-form, so a mid-join or a
 * resumed hidden tab sees strikes at the same instants a continuous
 * viewer did, never a burst of simultaneous flares. */
export function strikeTimes(g: VineGrowth): number[] {
  return g.hits.map(
    (_, k) => T_ARM + g.growMs * growEaseInv(g.cum[k + 1] / g.total),
  );
}

/** Point at arc length `len` along the compiled polyline. */
export function pointAt(g: VineGrowth, len: number): [number, number] {
  const L = clamp(len, 0, g.total);
  let lo = 0;
  let hi = g.cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid] <= L) lo = mid;
    else hi = mid;
  }
  const seg = g.cum[hi] - g.cum[lo] || 1;
  const u = (L - g.cum[lo]) / seg;
  return [
    g.verts[lo][0] + (g.verts[hi][0] - g.verts[lo][0]) * u,
    g.verts[lo][1] + (g.verts[hi][1] - g.verts[lo][1]) * u,
  ];
}

/** Evaluate the vine at `elapsed` ms since settle start. */
export function evaluate(g: VineGrowth, elapsedMs: number): VineFrame {
  const e = elapsedMs;
  if (e < 0) {
    return {
      vineLen: 0,
      tipX: SPROUT_X,
      tipY: SPROUT_Y,
      charge: 0,
      settled: false,
      phase: "idle",
    };
  }
  if (e < T_ARM) {
    return {
      vineLen: 0,
      tipX: SPROUT_X,
      tipY: SPROUT_Y,
      charge: e / T_ARM,
      settled: false,
      phase: "arm",
    };
  }
  if (e < g.tLanded) {
    const k = clamp((e - T_ARM) / g.growMs, 0, 1);
    const len = g.total * growEase(k);
    const [tx, ty] = pointAt(g, len);
    return {
      vineLen: len,
      tipX: tx,
      tipY: ty,
      charge: 1,
      settled: false,
      phase: "grow",
    };
  }
  const [ex, ey] = g.verts[g.verts.length - 1];
  return {
    vineLen: g.total,
    tipX: ex,
    tipY: ey,
    charge: 1,
    settled: e >= g.tSettled,
    phase: e < g.tSettled ? "landed" : "rest",
  };
}
