"use client";

/**
 * Giant amount input over a dot-matrix backdrop (ui-spec §3.2.4 / §5.3 /
 * §7.3). Ghost-colored while zero/empty, white once a value is entered.
 * Shared by Mine, Stake, and Trade.
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
  const isZero = value === "" || parseFloat(value) === 0 || Number.isNaN(parseFloat(value));
  return (
    <div
      className={`relative flex flex-col items-center ${compact ? "gap-1.5 py-1" : "gap-3 py-4"}`}
    >
      {/* Dot-matrix backdrop, fading toward the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(var(--color-dot) 1.5px, transparent 1.5px)",
          backgroundSize: "14px 14px",
          maskImage:
            "radial-gradient(ellipse 65% 80% at 50% 50%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 65% 80% at 50% 50%, black 30%, transparent 75%)",
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
      {below && <div className="relative flex items-center gap-1.5">{below}</div>}
    </div>
  );
}
