/**
 * Pure math for the live-ticking pending-yield display.
 *
 * The real value is STEPWISE: it jumps when a round's buyback distributes
 * (roughly once per round) and is flat in between, so any smooth "watch it
 * grow" display is an interpolation. These helpers keep that interpolation
 * honest AND continuous:
 *
 * - the display is CLOSED-FORM from (anchor, now) — never an incremental
 *   `+=`, so a backgrounded tab catches up exactly on return (same rule as
 *   the round countdown and the LAST ROUND progress bar);
 * - the growth rate is measured across a ROLLING WINDOW of real readings,
 *   never a consecutive pair: with truth sampled every ~25s and steps
 *   landing ~every round, a pair inside one flat step reads "rate 0" and
 *   froze the display (user report 2026-07-26 evening, "stops and starts"),
 *   while a pair straddling a step reads several times the true rate. Only
 *   a window long enough to span distributions measures the real average;
 * - a window too short to be trusted falls back to the APR-implied rate, so
 *   the ticker keeps moving from the first reading; only a LONG flat window
 *   reads as a genuinely idle pool and parks the rate at zero;
 * - every real reading re-anchors the display, so drift lives at most a few
 *   seconds;
 * - the tick rate runs at 90% of the estimate, so when truth arrives the
 *   snap is a small jump UP. On a money product the live estimate must
 *   under-promise: a display that ever ticks DOWN on refresh reads as funds
 *   vanishing.
 */

/** One real pending-yield reading. */
export interface TruthReading {
  /** Pending yield, in PEA. */
  value: number;
  /** When it was read (epoch ms). */
  atMs: number;
}

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

/** Readings older than this fall out of the rate window. */
export const RATE_WINDOW_MS = 120_000;

/**
 * Minimum span before the window's growth is trusted as a rate. Below this
 * a window may sit entirely inside one flat step (reads zero) or straddle a
 * single step (reads several times the true rate); either number is noise,
 * not a rate.
 */
export const RATE_MIN_SPAN_MS = 60_000;

/**
 * A window at least this long showing ZERO growth is a genuinely idle pool
 * (active pools distribute ~every round), so the honest rate is 0. Shorter
 * flat windows are just the gap between distributions.
 */
export const FLAT_SPAN_MS = 100_000;

/**
 * A reading below this fraction of the previous one is a claim/compound
 * (both zero the bucket) and resets the display instantly. Smaller dips are
 * stale readings from the slower of the two truth sources: accrual is
 * monotone, so they carry no information and must not dent the display.
 */
export const CLAIM_DROP_FACTOR = 0.5;

/** PEA/second implied by the APR on a given stake, before the factor. */
export function aprRatePerSec(stakedPea: number, aprPct: number): number {
  if (!Number.isFinite(stakedPea) || !Number.isFinite(aprPct)) return 0;
  if (stakedPea <= 0 || aprPct <= 0) return 0;
  return (stakedPea * (aprPct / 100)) / 365 / 86_400;
}

/** The window, trimmed to the last RATE_WINDOW_MS. */
export function pruneTruths(
  truths: readonly TruthReading[],
  nowMs: number,
): TruthReading[] {
  return truths.filter((t) => t.atMs >= nowMs - RATE_WINDOW_MS);
}

/**
 * Observed PEA/second across the whole window, or null when the window
 * cannot yield a trustworthy rate (too short, or briefly flat between
 * distributions). Exactly 0 only for a sustained flat window: a genuinely
 * idle pool must read as idle rather than inventing growth.
 */
export function observedRate(truths: readonly TruthReading[]): number | null {
  if (truths.length < 2) return null;
  const first = truths[0];
  const last = truths[truths.length - 1];
  const spanMs = last.atMs - first.atMs;
  if (spanMs < RATE_MIN_SPAN_MS) return null;
  if (last.value < first.value) return null; // resets are handled upstream
  if (last.value > first.value)
    return ((last.value - first.value) * 1000) / spanMs;
  return spanMs >= FLAT_SPAN_MS ? 0 : null;
}

/**
 * Build the next anchor from a fresh real reading. Prefers the observed
 * window rate (self-corrects to actual pool activity — a trailing 7-day
 * APR over a fast-growing pool overstates the per-PEA rate); falls back to
 * the APR-implied rate until the window is trustworthy.
 */
export function anchorFromTruth(
  observed: number | null,
  truth: TruthReading,
  stakedPea: number,
  aprPct: number,
): YieldAnchor {
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
