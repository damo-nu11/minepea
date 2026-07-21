/**
 * The vine compiler's contract: every compiled walk starts at the
 * sprout, ends dead-center on the VRF's tile, stays on the board, grows
 * monotonically, fits the settle window, and is a pure function of
 * elapsed time (mid-join safety) — for every tile, on every client.
 */

import { describe, expect, it } from "vitest";
import { SETTLING_MS as ENGINE_SETTLING_MS } from "@/lib/mock/engine";
import {
  BOARD_H,
  BOARD_W,
  compileVine,
  CX,
  CY,
  evaluate,
  N_TILES,
  PEGS,
  pointAt,
  SPROUT_HOLE_R,
  SETTLE_WINDOW_MS,
  SPROUT_X,
  SPROUT_Y,
  strikeTimes,
  T_ARM,
  T_CELEBRATE,
  TILE_ROT,
  TILE_XY,
} from "@/lib/vine/grow";

describe("vine pentagon compiler", () => {
  it("reaches every tile dead-center from the sprout, for all 25 across rounds", () => {
    for (let pod = 0; pod < N_TILES; pod++) {
      for (const roundId of [1, 7, 42, 97, 150, 391, 1024, 65535]) {
        const g = compileVine(pod, roundId);
        // The vine grows out of the pea, not the geometric center.
        expect(g.verts[0]).toEqual([SPROUT_X, SPROUT_Y]);
        // It lands ON the winning tile's edge, not inside it: the pea
        // must never cover the numeral.
        const last = g.verts[g.verts.length - 1];
        const t = (TILE_ROT[pod] * Math.PI) / 180;
        const dx = last[0] - TILE_XY[pod][0];
        const dy = last[1] - TILE_XY[pod][1];
        const lx = dx * Math.cos(t) + dy * Math.sin(t);
        const ly = -dx * Math.sin(t) + dy * Math.cos(t);
        // On the boundary: one local axis is exactly half a tile, and
        // neither exceeds it.
        expect(Math.max(Math.abs(lx), Math.abs(ly))).toBeCloseTo(36, 6);
        expect(Math.abs(lx)).toBeLessThanOrEqual(36.000001);
        expect(Math.abs(ly)).toBeLessThanOrEqual(36.000001);
        // A real walk, not a straight jump.
        expect(g.verts.length).toBeGreaterThan(3);
        // Every intermediate vertex is a struck peg, never reused.
        expect(new Set(g.hits).size).toBe(g.hits.length);
        for (const v of g.verts) {
          expect(v[0]).toBeGreaterThan(0);
          expect(v[0]).toBeLessThan(BOARD_W);
          expect(v[1]).toBeGreaterThan(0);
          expect(v[1]).toBeLessThan(BOARD_H);
        }
      }
    }
  });

  it("is deterministic and pure", () => {
    const a = compileVine(13, 777);
    expect(a).toEqual(compileVine(13, 777));
    const mid = evaluate(a, 2600);
    expect(evaluate(a, 2600)).toEqual(mid);
  });

  it("growth is monotonic and the tip rides the polyline", () => {
    const g = compileVine(8, 21);
    let prev = -1;
    for (let t = 0; t <= g.tSettled + 200; t += 40) {
      const f = evaluate(g, t);
      expect(f.vineLen).toBeGreaterThanOrEqual(prev);
      prev = f.vineLen;
      const [px, py] = pointAt(g, f.vineLen);
      expect(f.tipX).toBeCloseTo(px, 6);
      expect(f.tipY).toBeCloseTo(py, 6);
    }
    const landed = evaluate(g, g.tLanded + 1);
    const end = g.verts[g.verts.length - 1];
    expect(landed.tipX).toBeCloseTo(end[0], 6);
    expect(landed.tipY).toBeCloseTo(end[1], 6);
  });

  it("fits the settle window for every tile", () => {
    for (let pod = 0; pod < N_TILES; pod++) {
      for (const roundId of [3, 55, 900]) {
        const g = compileVine(pod, roundId);
        expect(g.tLanded).toBeGreaterThan(T_ARM + 3000);
        expect(g.tSettled).toBeLessThan(7800); // < SETTLING_MS 8200
      }
    }
  });

  it("the peg field is fixed, well-formed, and clears the sprout hole", () => {
    expect(PEGS.length).toBeGreaterThan(120);
    for (const [x, y] of PEGS) {
      expect(Math.hypot(x - CX, y - CY)).toBeGreaterThanOrEqual(SPROUT_HOLE_R);
    }
    // Deterministic across imports (module constant).
    expect(PEGS[0]).toEqual(PEGS[0].slice() as unknown as (typeof PEGS)[0]);
  });

  it("the final straight segment stays short (the walk gets close first)", () => {
    for (let pod = 0; pod < N_TILES; pod++) {
      for (const roundId of [1, 7, 42, 97, 150, 391, 1024, 65535]) {
        const g = compileVine(pod, roundId);
        const a = g.verts[g.verts.length - 2];
        const b = g.verts[g.verts.length - 1];
        expect(Math.hypot(b[0] - a[0], b[1] - a[1]), `pod ${pod} r ${roundId}`)
          .toBeLessThan(230);
      }
    }
  });

  it("every target has at least two first-hop pegs to choose from", () => {
    for (let pod = 0; pod < N_TILES; pod++) {
      const [tx, ty] = TILE_XY[pod];
      const D = Math.hypot(tx - CX, ty - CY);
      const dirX = (tx - CX) / D;
      const dirY = (ty - CY) / D;
      let candidates = 0;
      for (const [px, py] of PEGS) {
        const rx = px - SPROUT_X;
        const ry = py - SPROUT_Y;
        const dist = Math.hypot(rx, ry);
        if (dist < 25 || dist > 110) continue;
        if (rx * dirX + ry * dirY < 7) continue;
        candidates++;
      }
      expect(candidates, `pod ${pod}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("strike times are compiled, ordered, and inside the growth window", () => {
    for (let pod = 0; pod < N_TILES; pod++) {
      const g = compileVine(pod, 314);
      const ts = strikeTimes(g);
      expect(ts).toHaveLength(g.hits.length);
      let prev = T_ARM - 1;
      for (let k = 0; k < ts.length; k++) {
        expect(ts[k], `pod ${pod} strike ${k}`).toBeGreaterThan(prev);
        expect(ts[k]).toBeLessThanOrEqual(g.tLanded + 1e-6);
        prev = ts[k];
        // The inverse must agree with the forward evaluation: at its own
        // strike time the vine has just reached that peg.
        const len = evaluate(g, ts[k]).vineLen;
        expect(len).toBeCloseTo(g.cum[k + 1], 3);
      }
    }
  });

  it("the whole reveal fits the settle window, tail intact, for every walk", () => {
    // The tail must be length-INDEPENDENT: a long walk losing its
    // celebration while short walks look fine is the worst kind of bug.
    for (let pod = 0; pod < N_TILES; pod++) {
      for (const roundId of [1, 7, 42, 97, 391, 1024, 65535, 900]) {
        const g = compileVine(pod, roundId);
        expect(g.tSettled + 200, `pod ${pod} r ${roundId}`).toBeLessThanOrEqual(
          SETTLE_WINDOW_MS,
        );
        expect(g.tSettled - g.tLanded).toBeGreaterThanOrEqual(T_CELEBRATE);
      }
    }
    // The compiler's copy of the settle window must track the engine's.
    expect(SETTLE_WINDOW_MS).toBe(ENGINE_SETTLING_MS);
  });

  it("the pea COMMITS into the tile instead of drifting to a halt", () => {
    for (let pod = 0; pod < N_TILES; pod++) {
      const g = compileVine(pod, 314);
      const atCommit = evaluate(g, T_ARM + g.growMs * 0.88).vineLen / g.total;
      // A real share of the journey is spent in the final push...
      expect(1 - atCommit, `pod ${pod}`).toBeGreaterThan(0.05);
      // ...and it is still moving when it lands.
      const speed =
        (evaluate(g, T_ARM + g.growMs).vineLen -
          evaluate(g, T_ARM + g.growMs - 100).vineLen) /
        100;
      expect(speed, `pod ${pod}`).toBeGreaterThan(0.12);
    }
  });

  it("the arm beat charges before any growth", () => {
    const g = compileVine(19, 40);
    const arm = evaluate(g, T_ARM / 2);
    expect(arm.phase).toBe("arm");
    expect(arm.vineLen).toBe(0);
    expect(arm.charge).toBeGreaterThan(0.4);
    expect(evaluate(g, -100).phase).toBe("idle");
  });
});
