/**
 * Next US stock market open (9:30am Eastern, Monday to Friday), computed
 * from the browser's clock via Intl so DST resolves itself — no timezone
 * library, no hardcoded offsets.
 *
 * Exchange HOLIDAYS are deliberately not modeled: the countdown is
 * decorative context for THE POT's closed-market $0, and the pending
 * feed's `marketOpen` flag remains the truth. On a holiday the countdown
 * reaches the (closed) 9:30 and self-heals to the next day once it
 * passes.
 */

const ET_TZ = "America/New_York";

const PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hour12: false,
});

function etParts(ms: number): Record<string, string> {
  return Object.fromEntries(
    PARTS_FMT.formatToParts(ms).map((p) => [p.type, p.value]),
  );
}

/** Epoch ms of 9:30am Eastern on the ET calendar day containing `ms`. */
function etOpenEpoch(ms: number): number {
  const p = etParts(ms);
  // Guess the EDT case (9:30 ET = 13:30 UTC), then correct by however far
  // the guess lands from 9:30 in ET — this absorbs EST and DST edges.
  const guess = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    13,
    30,
  );
  const g = etParts(guess);
  const deltaMin =
    9 * 60 + 30 - (Number(g.hour) * 60 + Number(g.minute));
  return guess + deltaMin * 60_000;
}

/** The next weekday 9:30am Eastern strictly after `nowMs`. */
export function nextMarketOpenMs(nowMs: number): number {
  for (let d = 0; d < 8; d++) {
    const dayMs = nowMs + d * 86_400_000;
    const weekday = etParts(dayMs).weekday;
    if (weekday === "Sat" || weekday === "Sun") continue;
    const open = etOpenEpoch(dayMs);
    if (open > nowMs) return open;
  }
  // Unreachable (8 days always contain a weekday open); satisfy the type.
  return nowMs;
}

/** "04:23:11", or "2d 17:23:11" past a day — for the open countdown. */
export function fmtOpenCountdown(remainMs: number): string {
  const s = Math.max(0, Math.floor(remainMs / 1000));
  const days = Math.floor(s / 86_400);
  const hh = String(Math.floor((s % 86_400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}
