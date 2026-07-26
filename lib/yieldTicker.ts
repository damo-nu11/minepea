/**
 * Pure math for the live-ticking pending-yield display.
 *
 * The real value is STEPWISE: it jumps when a buyback distributes and is
 * flat in between, so any smooth "watch it grow" display is an
 * interpolation. These helpers keep that interpolation honest:
 *
 * - the display is CLOSED-FORM from (anchor, now) — never an incremental
 *   `+=`, so a backgrounded tab catches up exactly on return (same rule as
 *   the round countdown and the LAST ROUND progress bar);
 * - every real reading re-anchors the display, so drift lives at most a few
 *   seconds;
 * - the tick rate runs at 90% of the estimated rate, so when truth arrives
 *   the snap is a small jump UP. On a money product the live estimate must
 *   under-promise: a display that ever ticks DOWN on refresh reads as funds
 *   vanishing.
 */

export interface YieldAnchor {
  /** Last real pending-yield reading, in PEA. */
  value: number;
  /** When that reading was taken (epoch ms). */
  atMs: number;
  /** Display growth rate, PEA per second (already conservative). */
  ratePerSec: number;
}

/** Conservative factor applied to every estimated rate. */
export const TICK_RATE_FACTOR = 0.9;

/** PEA/second implied by the APR on a given stake, before the factor. */
export function aprRatePerSec(stakedPea: number, aprPct: number): number {
  if (!Number.isFinite(stakedPea) || !Number.isFinite(aprPct)) return 0;
  if (stakedPea <= 0 || aprPct <= 0) return 0;
  return (stakedPea * (aprPct / 100)) / 365 / 86_400;
}

/**
 * Observed PEA/second between two real readings, or null when the pair
 * cannot yield a rate (no elapsed time, or the value went DOWN — a claim or
 * compound, which is a reset, not a rate).
 */
export function ratePerSecFromDelta(
  prev: { value: number; atMs: number },
  next: { value: number; atMs: number },
): number | null {
  const elapsedSec = (next.atMs - prev.atMs) / 1000;
  if (elapsedSec <= 0) return null;
  if (next.value < prev.value) return null;
  return (next.value - prev.value) / elapsedSec;
}

/**
 * Build the next anchor from a fresh real reading. Prefers the observed
 * rate (self-corrects to actual pool activity, including a genuinely idle
 * pool ticking at zero); falls back to the APR-implied rate until two
 * readings exist.
 */
export function anchorFromTruth(
  prevTruth: { value: number; atMs: number } | null,
  truth: { value: number; atMs: number },
  stakedPea: number,
  aprPct: number,
): YieldAnchor {
  const observed = prevTruth ? ratePerSecFromDelta(prevTruth, truth) : null;
  const base = observed ?? aprRatePerSec(stakedPea, aprPct);
  return {
    value: truth.value,
    atMs: truth.atMs,
    ratePerSec: Math.max(0, base) * TICK_RATE_FACTOR,
  };
}

/** The displayed value at `nowMs`: anchor plus conservative growth. */
export function tickedValue(anchor: YieldAnchor, nowMs: number): number {
  const elapsedSec = Math.max(0, (nowMs - anchor.atMs) / 1000);
  return anchor.value + anchor.ratePerSec * elapsedSec;
}
