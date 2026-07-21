"use client";

/**
 * Round stats strip (ui-spec §3.2.1): DEPLOYED | PEAPOT | TIME — three
 * equal columns with hairline dividers, value over uppercase caption.
 * The countdown is its own leaf component (Convention 4) so only the digits
 * re-render each second.
 *
 * Hovering a stat swaps its caption in place (user spec 2026-07-13):
 * DEPLOYED ⇄ its USD value, PEAPOT ⇄ its USD value, TIME ⇄ the current
 * round id. Pure CSS (group-hover) — no mouse-event state; on touch the
 * swap fires on tap. The value row never changes.
 */

import { EthIcon, PeaIcon } from "@/components/icons";
import { fmtCountdown, fmtUsd } from "@/lib/format";
import { usePrices, useRound, useRoundTimer } from "@/lib/hooks/useGame";

function Countdown() {
  const timer = useRoundTimer();
  return (
    <span
      role="timer"
      aria-label="Time remaining in round"
      className="tnum text-[21px] font-medium leading-none text-danger"
    >
      {timer.data ? fmtCountdown(timer.data.remainingSec) : "00:00"}
    </span>
  );
}

function Stat({
  value,
  caption,
  hoverCaption,
  icon,
}: {
  value: React.ReactNode;
  caption: string;
  /** Swapped in for the caption while the stat is hovered. */
  hoverCaption?: string;
  icon?: React.ReactNode;
}) {
  return (
    // Focusable when it has a hover twin so keyboard users can reach the
    // swap (group-focus-within mirrors group-hover); AT gets the twin via
    // the sr-only copy since `hidden` removes it from the a11y tree.
    <div
      className="group flex flex-1 flex-col items-center gap-1.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      tabIndex={hoverCaption ? 0 : undefined}
    >
      {/* Fixed-height, baseline-locked value row: identical across all three
          columns regardless of value width or whether there's an icon, so the
          numbers and labels always align (leading-none removes line-box drift). */}
      <span className="flex h-8 items-center justify-center gap-2 leading-none">
        {icon}
        {value}
      </span>
      {/* Deliberate local override of `micro-label` (11px/300): the strip runs
          ~25% tighter than the global caption scale (user 2026-07-15), so the
          shared utility stays put for the rest of the site. */}
      <span className="text-[9px] font-light uppercase leading-none tracking-[0.08em] text-fg-muted">
        {hoverCaption ? (
          <>
            <span className="group-hover:hidden group-focus-within:hidden">
              {caption}
            </span>
            <span
              aria-hidden
              className="hidden group-hover:inline group-focus-within:inline"
            >
              {hoverCaption}
            </span>
            <span className="sr-only">{`${caption}: ${hoverCaption}`}</span>
          </>
        ) : (
          caption
        )}
      </span>
    </div>
  );
}

export function StatsStrip() {
  const round = useRound();
  const prices = usePrices();
  const r = round.data;
  const p = prices.data;

  // A 0 price means "no market/feed yet" — suppress the USD twin rather
  // than hovering to a misleading "≈$0.00".
  const deployedUsd =
    r && p && r.totalDeployedEth > 0 && p.ethUsd > 0
      ? `≈${fmtUsd(r.totalDeployedEth * p.ethUsd)}`
      : undefined;
  const peapotUsd =
    r && p && r.motherlodePea > 0 && p.peaUsd > 0
      ? `≈${fmtUsd(r.motherlodePea * p.peaUsd)}`
      : undefined;

  return (
    <div className="glass-pane flex items-center rounded-[16px] px-3 py-3">
      <Stat
        icon={<EthIcon size={15} className="shrink-0 text-fg" />}
        value={
          <span className="tnum text-[21px] font-medium leading-none text-fg">
            {r?.totalDeployedFormatted ?? "—"}
          </span>
        }
        caption="Deployed"
        hoverCaption={deployedUsd}
      />
      <div className="h-9 w-px bg-line-slate/60" />
      <Stat
        icon={<PeaIcon size={15} className="shrink-0 text-accent" />}
        value={
          <span className="tnum text-[21px] font-medium leading-none text-accent">
            {r?.motherlodeFormatted ?? "—"}
          </span>
        }
        caption="Peapot"
        hoverCaption={peapotUsd}
      />
      <div className="h-9 w-px bg-line-slate/60" />
      <Stat
        value={<Countdown />}
        caption="Time"
        hoverCaption={r ? `Round ${r.roundIdFormatted}` : undefined}
      />
    </div>
  );
}
