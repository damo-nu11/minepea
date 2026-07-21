"use client";

/**
 * Shared control primitives (Convention 5): increment/percent chip rows and
 * the − value + stepper (ui-spec §3.2.5–§3.2.8, §5.4).
 */

import { Tooltip } from "@/components/Tooltip";

export function ChipRow({
  chips,
}: {
  chips: { label: string; onClick(): void }[];
}) {
  return (
    <div className="flex w-full gap-3">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onClick}
          className="tnum h-9 flex-1 cursor-pointer rounded-full bg-surface text-[14px] font-semibold text-fg-body transition-colors hover:bg-surface-active hover:text-fg"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onDec,
  onInc,
  before,
  ghostValue = 0,
  label = "value",
  disabled = false,
}: {
  value: number;
  onDec(): void;
  onInc(): void;
  /** Optional extra control rendered before the − (e.g. the ALL button). */
  before?: React.ReactNode;
  /** The row's untouched default — rendered ghost per ui-spec §1.1 (0 for TILES, 1 for ROUNDS). */
  ghostValue?: number;
  /** What the stepper adjusts — disambiguates the +/− buttons for AT. */
  label?: string;
  /** Locks both buttons (e.g. TILES while the round is locked). */
  disabled?: boolean;
}) {
  const btn =
    "flex h-[30px] w-8 cursor-pointer items-center justify-center rounded-lg bg-surface text-fg-body transition-colors hover:bg-surface-active hover:text-fg disabled:cursor-default disabled:opacity-50 disabled:hover:bg-surface disabled:hover:text-fg-body";
  return (
    <span className="flex items-center gap-2">
      {before}
      <button type="button" aria-label={`Decrease ${label}`} className={btn} onClick={onDec} disabled={disabled}>
        −
      </button>
      <span
        className={`tnum w-8 text-center text-[18px] font-semibold ${
          value === ghostValue ? "text-ghost" : "text-fg"
        }`}
      >
        {value}
      </span>
      <button type="button" aria-label={`Increase ${label}`} className={btn} onClick={onInc} disabled={disabled}>
        +
      </button>
    </span>
  );
}

/** Label row in the sidebar: dashed-underline micro-label left, control right. */
export function SidebarRow({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[34px] items-center justify-between">
      <TooltipLabel label={label} tooltip={tooltip} />
      {children}
    </div>
  );
}

function TooltipLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip content={tooltip}>
      <span className="micro-label dashed-underline transition-colors hover:text-fg">
        {label}
      </span>
    </Tooltip>
  );
}
