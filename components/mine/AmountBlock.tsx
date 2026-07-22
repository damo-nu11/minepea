"use client";

/**
 * Giant amount input over a soft accent bloom (ui-spec §3.2.4 / §5.3 / §7.3).
 * Ghost-colored while zero/empty, white once a value is entered.
 *
 * The backdrop was a dot matrix until 2026-07-22. Mine dropped the dots for a
 * bloom in its own copy of this input back on 2026-07-15 and this component
 * never followed, so Stake was the last surface still showing them. The
 * gradient below is Mine's, verbatim, so the two treatments cannot drift
 * again.
 */

const AMOUNT_RE = /^\d{0,4}(\.\d{0,6})?$/;

export function AmountBlock({
  value,
  onChange,
  below,
  ariaLabel,
  compact = false,
}: {
  value: string;
  onChange(next: string): void;
  /** Row rendered under the numeral (token icon / balance readout / selector). */
  below?: React.ReactNode;
  ariaLabel: string;
  /** Tighter numeral + spacing, e.g. when framed in a small card. */
  compact?: boolean;
}) {
  const isZero =
    value === "" || parseFloat(value) === 0 || Number.isNaN(parseFloat(value));
  return (
    <div
      className={`relative flex flex-col items-center ${compact ? "gap-1.5 py-1" : "gap-3 py-4"}`}
    >
      {/* Soft accent bloom behind the numeral. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 46% 58% at 50% 44%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 70%)",
        }}
      />
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value}
        placeholder="0"
        onChange={(e) => {
          const next = e.target.value;
          if (next === "" || AMOUNT_RE.test(next)) onChange(next);
        }}
        onFocus={(e) => {
          if (e.target.value === "0") onChange("");
        }}
        onBlur={(e) => {
          if (e.target.value === "") onChange("0");
        }}
        className={`tnum relative w-full rounded-lg caret-fg bg-transparent text-center font-bold leading-none outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent/50 placeholder:text-ghost ${
          compact ? "text-[52px]" : "text-[72px]"
        } ${isZero ? "text-ghost" : "text-fg"}`}
      />
      {below && (
        <div className="relative flex items-center gap-1.5">{below}</div>
      )}
    </div>
  );
}
