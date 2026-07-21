/**
 * Tiny chart-scale helpers for the hand-rolled SVG kit (Explore v2 plan).
 * No dependencies; everything the kit needs to place points and draw a
 * readable axis: extents, "nice" tick values, and date label formatting.
 */

export function extent(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
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
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "8 Jun" style x-axis label (UTC — the mock anchor is UTC-fixed). */
export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
