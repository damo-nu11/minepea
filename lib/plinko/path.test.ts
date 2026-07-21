/**
 * The path compiler's contract: every compiled drop lands DEAD CENTER in
 * the VRF's pod, on every client, for every round — and the choreography
 * is a pure function of elapsed time (mid-join safety).
 */

import { describe, expect, it } from "vitest";
import {
  BOARD_W,
  compilePath,
  evaluate,
  podX,
  T_LANDED,
  T_SETTLED,
} from "@/lib/plinko/path";

describe("plinko path compiler", () => {
  it("lands exactly in the winning pod for all 25 pods across many rounds", () => {
    for (let pod = 0; pod < 25; pod++) {
      for (const roundId of [1, 7, 42, 97, 150, 391, 1024, 65535]) {
        const path = compilePath(pod, roundId);
        const rest = evaluate(path, 20_000);
        expect(rest.x, `pod ${pod} round ${roundId}`).toBe(podX(pod));
        expect(rest.settled).toBe(true);
      }
    }
  });

  it("is deterministic: identical inputs compile identical paths", () => {
    const a = compilePath(13, 777);
    const b = compilePath(13, 777);
    expect(a).toEqual(b);
    // ...and different rounds vary the walk for the same target.
    const c = compilePath(13, 778);
    expect(
      a.releaseX !== c.releaseX ||
        JSON.stringify(a.segments) !== JSON.stringify(c.segments),
    ).toBe(true);
  });

  it("keeps the pea inside the board for the whole flight", () => {
    for (let pod = 0; pod < 25; pod += 3) {
      const path = compilePath(pod, 555);
      for (let t = 0; t <= T_SETTLED + 500; t += 16) {
        const f = evaluate(path, t);
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThanOrEqual(BOARD_W);
        expect(f.y).toBeLessThanOrEqual(860);
      }
    }
  });

  it("segments are contiguous and monotonic in time", () => {
    const path = compilePath(0, 9);
    let prev = 0;
    for (const s of path.segments) {
      expect(s.t0).toBe(prev);
      expect(s.t1).toBeGreaterThan(s.t0);
      prev = s.t1;
    }
  });

  it("fits the settle window with margin (T_SETTLED well under 8200)", () => {
    expect(T_LANDED).toBeLessThan(5800);
    expect(T_SETTLED).toBeLessThan(6500);
  });

  it("mid-join evaluates a coherent in-flight frame (pure function of elapsed)", () => {
    const path = compilePath(21, 300);
    const mid = evaluate(path, 2600);
    expect(mid.peaVisible).toBe(true);
    expect(mid.settled).toBe(false);
    // Same elapsed, same frame — no hidden state.
    expect(evaluate(path, 2600)).toEqual(mid);
  });

  it("always drops from the apex; edge pods reach via the full-width walk", () => {
    for (const pod of [0, 24]) {
      for (const roundId of [1, 2, 3, 4, 5]) {
        const p = compilePath(pod, roundId);
        expect(p.releaseX).toBe(500);
        expect(evaluate(p, 20_000).x).toBe(pod === 0 ? 20 : 980);
      }
    }
  });
});
