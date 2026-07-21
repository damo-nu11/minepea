"use client";

/**
 * LAST ROUND bar (ui-spec §3.2.2): navy-gradient row with the previous
 * round's winning tile + winner. Links to /explore (recorded deviation:
 * round-detail views are de-scoped for the shell).
 *
 * Doubles as the ROUND PROGRESS meter (user request 2026-07-12): a lime
 * wash fills left→right as the current round elapses, reaching exactly 100%
 * at 00:00 (and holding full through the settling phase). Implemented as a
 * SINGLE CSS transition per round — the browser animates linearly from the
 * current elapsed fraction to 100% over the remaining time, so there are no
 * per-second re-renders at all (Convention 4 by construction).
 */

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ChevronRightIcon, TilesIcon } from "@/components/icons";
import { useRound, useRoundHistory } from "@/lib/hooks/useGame";

/** Lime wash animated to 100% by endsAt via one browser-driven transition. */
function RoundProgressFill() {
  const round = useRound();
  const ref = useRef<HTMLSpanElement>(null);
  const roundId = round.data?.roundId;
  const startedAt = round.data?.startedAt ?? 0;
  const endsAt = round.data?.endsAt ?? 0;

  useEffect(() => {
    const el = ref.current;
    if (!el || !endsAt) return;
    // Jump to the current elapsed fraction without animating, force a
    // reflow, then hand the rest of the fill to one linear transition that
    // ends exactly at endsAt.
    const sync = () => {
      const duration = Math.max(1, endsAt - startedAt);
      const now = Date.now();
      const startPct = Math.min(
        100,
        Math.max(0, ((now - startedAt) / duration) * 100),
      );
      const remainingMs = Math.max(0, endsAt - now);
      el.style.transition = "none";
      el.style.width = `${startPct}%`;
      void el.offsetWidth;
      el.style.transition = `width ${remainingMs}ms linear`;
      el.style.width = "100%";
    };
    sync();
    // Browsers pause CSS transitions while the tab is hidden but the round
    // clock keeps running — resync when the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    // The bar mounts twice on Mine (mobile block + desktop sidebar) with one
    // copy display:none — hidden elements don't run transitions, so resync
    // when crossing the lg breakpoint reveals the other copy (audit finding).
    // Guarded: jsdom has no matchMedia.
    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 1024px)")
        : null;
    const onBreakpoint = () => sync();
    document.addEventListener("visibilitychange", onVisible);
    mql?.addEventListener("change", onBreakpoint);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      mql?.removeEventListener("change", onBreakpoint);
    };
  }, [roundId, startedAt, endsAt]);

  if (!round.data) return null;
  return (
    <span
      ref={ref}
      // Remount per round so the reset snaps to 0% instead of tweening back.
      // NO style prop: this component re-renders on every engine tick, and a
      // React-owned width would clobber the browser-driven transition each
      // time — width is set exclusively via the effect above.
      key={roundId}
      aria-hidden
      className="absolute inset-y-0 left-0 z-0 border-r border-accent/50 bg-accent/10"
    />
  );
}

export function LastRoundBar() {
  const history = useRoundHistory();
  const last = history.data?.[0];

  return (
    <Link
      href="/explore#rounds"
      className="relative flex h-9 w-full items-center justify-between overflow-hidden rounded-[7px] px-3 transition-opacity hover:opacity-80"
      style={{
        background:
          "linear-gradient(to right, var(--color-bar-from), var(--color-bar-to))",
      }}
    >
      <RoundProgressFill />
      {/* The fill runs full-bleed under both text blocks; the dark halo
          makes the glyphs visibly punch through the leading edge, so the
          line reads as passing BEHIND the text. */}
      <span className="relative z-[1] micro-label text-halo">Last Round</span>
      <span className="relative z-[1] flex items-center gap-2 text-halo">
        {last ? (
          <>
            <TilesIcon size={12} className="text-fg-muted" />
            <span className="tnum text-[13px] text-fg-muted">
              {last.tileNumber}
            </span>
            <span className="tnum text-[13px] font-semibold text-fg">
              {last.winnerDisplay}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-fg-muted">—</span>
        )}
        <ChevronRightIcon size={14} className="text-fg-muted" />
      </span>
    </Link>
  );
}
