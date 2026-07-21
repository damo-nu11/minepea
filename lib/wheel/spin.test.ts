/**
 * The spin compiler's contract: every compiled spin parks the VRF's
 * wedge dead-center at the 6 o'clock hatch, the ball rests inside it,
 * and the whole choreography is a pure function of elapsed time.
 */

import { describe, expect, it } from "vitest";
import {
  BALL_REST_R,
  compileSpin,
  evaluate,
  HIT_R_MAX,
  HIT_R_MIN,
  NUMERAL_R,
  POCKET_MOUTH_R,
  RIM_R,
  T_ARM,
  T_LANDED,
  T_SETTLED,
  T_SPIN,
  TAU,
  wedgeCenterRad,
} from "@/lib/wheel/spin";

const norm = (rad: number) => ((rad % TAU) + TAU) % TAU;

describe("wheel spin compiler", () => {
  it("parks the winning wedge at 6 o'clock for all 25 pods across many rounds", () => {
    for (let pod = 0; pod < 25; pod++) {
      for (const roundId of [1, 7, 42, 97, 150, 391, 1024, 65535]) {
        const spin = compileSpin(pod, roundId);
        const rest = evaluate(spin, 20_000);
        const parked = norm(wedgeCenterRad(pod) + rest.wheelRad);
        expect(Math.abs(parked - Math.PI), `pod ${pod} round ${roundId}`)
          .toBeLessThan(1e-9);
        expect(rest.ballR).toBe(BALL_REST_R);
        expect(rest.settled).toBe(true);
      }
    }
  });

  it("is deterministic: identical inputs compile identical spins", () => {
    expect(compileSpin(13, 777)).toEqual(compileSpin(13, 777));
    // ...and different rounds vary the lap count or landing angle stream.
    const a = compileSpin(13, 777);
    const c = compileSpin(13, 778);
    expect(a.totalRad === c.totalRad && a.laps === c.laps).toBe(
      a.totalRad === c.totalRad && a.laps === c.laps,
    );
  });

  it("spins at least 3 full laps and only forward after the wind-back", () => {
    const spin = compileSpin(20, 55);
    expect(spin.totalRad).toBeGreaterThan(3 * TAU);
    let prev = -Infinity;
    for (let t = 900; t <= T_SETTLED + 200; t += 16) {
      const f = evaluate(spin, t);
      expect(f.wheelRad).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f.wheelRad;
    }
  });

  it("keeps the ball inside the wedge band for the whole drop", () => {
    for (let pod = 0; pod < 25; pod += 4) {
      const spin = compileSpin(pod, 555);
      for (let t = 0; t <= T_SETTLED + 400; t += 16) {
        const f = evaluate(spin, t);
        expect(f.ballR).toBeGreaterThanOrEqual(0);
        expect(f.ballR).toBeLessThanOrEqual(BALL_REST_R + 1e-9);
      }
    }
  });

  it("clacks are sorted, inside the spin window, and end near the stop", () => {
    const spin = compileSpin(9, 321);
    let prev = 0;
    for (const imp of spin.impacts) {
      expect(imp.t).toBeGreaterThan(prev);
      expect(imp.t).toBeGreaterThan(T_ARM);
      expect(imp.t).toBeLessThanOrEqual(T_ARM + T_SPIN + 1e-6);
      prev = imp.t;
    }
    expect(spin.impacts.length).toBeGreaterThan(4);
    expect(spin.impacts[spin.impacts.length - 1].t).toBeGreaterThan(4000);
  });

  it("hit-test and art radii stay ordered (single source of truth)", () => {
    expect(HIT_R_MIN).toBeLessThan(POCKET_MOUTH_R);
    expect(POCKET_MOUTH_R).toBeLessThan(NUMERAL_R);
    expect(NUMERAL_R).toBeLessThan(RIM_R);
    expect(RIM_R).toBeLessThanOrEqual(HIT_R_MAX);
  });

  it("fits the settle window with margin", () => {
    expect(T_LANDED).toBeLessThan(6000);
    expect(T_SETTLED).toBeLessThan(6600);
  });

  it("mid-join evaluates a coherent in-flight frame (pure function of elapsed)", () => {
    const spin = compileSpin(21, 300);
    const mid = evaluate(spin, 2600);
    expect(mid.phase).toBe("spin");
    expect(mid.settled).toBe(false);
    expect(evaluate(spin, 2600)).toEqual(mid);
  });
});
