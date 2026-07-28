/**
 * Tiny chart-scale helpers for the hand-rolled SVG kit (Explore v2 plan).
 * No dependencies; everything the kit needs to place points and draw a
 * readable axis: extents, "nice" tick values, and date label formatting.
 */

/** Tick-label type size. Shared so measurement and render cannot drift. */
export const AXIS_FONT_PX = 10.5;

/**
 * Per-glyph advance widths as a fraction of font size, for the brand face
 * (wide and geometric). Only glyphs that differ sharply from a digit are
 * listed; everything else takes DEFAULT_EM.
 *
 * Calibrated deliberately HIGH. These are a floor, and the two failure modes
 * are not symmetric: over-measuring spends a few pixels of gutter nobody
 * notices, while under-measuring drops a digit and shows the reader a
 * different number. The earlier 0.73/digit figure measured short enough that
 * "15000.0%" lost its leading 1 on a live chart.
 */
const EM: Record<string, number> = {
  ".": 0.34,
  ",": 0.34,
  "-": 0.45,
  "−": 0.45,
  " ": 0.3,
  "%": 1.15,
};
const DEFAULT_EM = 0.82;

let fontCache: string | null | undefined;
let ctxCache: CanvasRenderingContext2D | null | undefined;

/** Real width of a label in the page's own face, or 0 where unavailable. */
function measureText(label: string, fontPx: number): number {
  if (typeof document === "undefined") return 0;
  if (ctxCache === undefined)
    ctxCache = document.createElement("canvas").getContext("2d");
  if (!ctxCache) return 0;
  if (fontCache === undefined)
    fontCache = getComputedStyle(document.body).fontFamily || null;
  ctxCache.font = `${fontPx}px ${fontCache ?? "sans-serif"}`;
  return ctxCache.measureText(label).width;
}

/**
 * Y-gutter width, sized to the widest tick label — SPLIT into two halves
 * because they must run at different times:
 *
 * - `axisPadEstimate` is PURE per-glyph math, identical on the server and
 *   every client render. It is the only sizing the initial render may use:
 *   mixing canvas measurement into the render path made the server say
 *   x=54 while the client said 55, a hydration mismatch on every chart
 *   (found live on the Harvesting APR chart, 2026-07-28).
 * - `axisPadMeasured` asks a canvas for the real face's width; charts
 *   upgrade to it in an EFFECT (and re-measure when the webfont lands,
 *   since fallback-font metrics run narrower). 0 where no canvas exists.
 *
 * The estimate stays a deliberate FLOOR under the measurement: a fixed
 * gutter silently clips the leading glyph the moment a formatter emits
 * something long, which happened twice ("$280.00" lost its "$";
 * "15000.0%" rendered as "5000.0%" — a wrong number on screen).
 * Over-measuring costs a few pixels of gutter; under-measuring costs a
 * digit.
 */
export function axisPadEstimate(
  labels: string[],
  fontPx = AXIS_FONT_PX,
  min = 46,
): number {
  let widest = 0;
  for (const label of labels) {
    let estimate = 0;
    for (const ch of label) estimate += (EM[ch] ?? DEFAULT_EM) * fontPx;
    widest = Math.max(widest, estimate);
  }
  return Math.max(min, Math.ceil(widest) + 12);
}

/** Canvas-measured gutter for the same labels; 0 when unmeasurable. */
export function axisPadMeasured(labels: string[], fontPx = AXIS_FONT_PX): number {
  let widest = 0;
  for (const label of labels) {
    widest = Math.max(widest, measureText(label, fontPx));
  }
  return widest > 0 ? Math.ceil(widest) + 12 : 0;
}

export function extent(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return [0, 1];
  if (min === max) {
    // Pad relative to the value, not by a fixed 1. A sub-dollar price with a
    // flat window (a young pool, or one quiet hour) otherwise gets a domain of
    // [-1, 1]: a negative dollar axis with the line pinned to the zero line.
    const pad = min === 0 ? 1 : Math.abs(min) * 0.05;
    return [min - pad, max + pad];
  }
  return [min, max];
}

/** Round-numbered ticks spanning [min, max] — always includes 0 when the
 * domain crosses it (negative bars need the zero line). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    // Clamp float drift (0.30000000000000004 → 0.3).
    ticks.push(+v.toPrecision(12));
  }
  return ticks;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "8 Jun" style x-axis label (UTC — the mock anchor is UTC-fixed). */
export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
