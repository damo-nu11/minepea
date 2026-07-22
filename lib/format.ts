/**
 * Shared formatters (Convention 2/6). All display strings in the app are
 * produced here — components never do display math.
 */

import type { Address } from "@/lib/types";

/** Convert a wei-style decimal string to a JS number (display-grade only). */
export function fromWei(wei: string, decimals = 18): number {
  const n = Number(wei);
  if (!Number.isFinite(n)) return 0;
  return n / 10 ** decimals;
}

/**
 * fmtToken, but a NONZERO amount never renders as "0": values too small for
 * `dp` decimals fall back to 6dp (live finding 2026-07-17 — MIN_DEPLOY-scale
 * amounts like 0.00003 ETH vanished behind the display precision chosen for
 * the mock's 0.1+ ETH world).
 */
export function fmtTokenSmart(n: number, dp: number): string {
  if (n !== 0 && Math.abs(n) < 10 ** -dp) return fmtToken(n, 6);
  return fmtToken(n, dp);
}

/**
 * Token amounts (ETH/PEA): up to `dp` decimals, trailing zeros trimmed.
 * e.g. 10.7023 → "10.7023", 9.417 → "9.417", 10.7 → "10.7", 11 → "11".
 */
export function fmtToken(n: number, dp = 4): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(dp);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

/**
 * FLOORED token amount for balance-derived inputs (MAX / percent chips):
 * toFixed rounds half-up, which can produce an amount that exceeds the
 * balance and dead-ends the CTA in "Insufficient balance" (audit finding).
 */
export function fmtTokenFloor(n: number, dp = 4): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return fmtToken(Math.floor(n * 10 ** dp) / 10 ** dp, dp);
}

/** USD: "$90.60", "$23,551,423.00" → 2 dp (4 dp below $1). */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  const dp = Math.abs(n) < 1 && n !== 0 ? 4 : 2;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

/** Integers with separators: 3000000 → "3,000,000". */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.floor(n).toLocaleString("en-US");
}

/**
 * Compact to a fixed number of SIGNIFICANT figures: 243.8K, 1.183M, 12.35M.
 *
 * Fixed decimals misread across magnitudes — at 2dp, 1,183,000 flattens to a
 * blunt "1.18M" while 243,800 gains a falsely precise "243.80K". Scaling the
 * decimals to the mantissa holds the information density steady at every size,
 * which is what a headline stat rail wants. Rounding that carries the mantissa
 * to 1000 promotes the unit, so 999,999 reads "1.000M", never "1000.0K".
 */
export function fmtCompactSig(n: number, sig = 4): string {
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  const units = ["", "K", "M", "B", "T"];
  const abs = Math.abs(n);
  let tier = Math.min(Math.floor(Math.log10(abs) / 3), units.length - 1);
  tier = Math.max(tier, 0);
  let m = n / 1000 ** tier;
  const dpFor = (v: number) =>
    Math.max(0, sig - Math.max(1, Math.floor(Math.log10(Math.abs(v))) + 1));
  let dp = dpFor(m);
  if (Math.abs(Number(m.toFixed(dp))) >= 1000 && tier < units.length - 1) {
    tier += 1;
    m = n / 1000 ** tier;
    dp = dpFor(m);
  }
  return `${m.toFixed(dp)}${units[tier]}`;
}

/** Compact: 1234 → "1.23K", 23551423 → "23.55M". */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const trim = (v: number) => fmtToken(v, 2);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K`;
  return trim(n);
}

/** Percent: 17.2 → "17.20%". */
export function fmtPct(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(dp)}%`;
}

/** Round ids: 328913 → "#328,913". */
export function fmtRoundId(n: number): string {
  return `#${fmtInt(n)}`;
}

/** Countdown "MM:SS", zero-padded; clamps at 00:00. */
export function fmtCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Relative time: "51 sec ago", "2 min ago", "3 hr ago", "2 d ago". */
export function relTime(atMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/**
 * ETH address shortening (Convention 6): 0x + first 4 + "..." + last 4.
 * e.g. "0x1A2b...9F3e".
 */
export function shortAddr(addr: Address): string {
  const hex = addr.slice(2);
  return `0x${hex.slice(0, 4)}...${hex.slice(-4)}`;
}
