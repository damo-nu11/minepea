"use client";

/**
 * RETIRED 2026-07-19: superseded by VineBoard as the Mine board. Kept on
 * disk with its tests; nothing in the app imports it.
 *
 * 5×5 tile grid (ui-spec §3.1). Tap toggles a tile; press-and-drag paints
 * the initial toggle direction across tiles (each tile toggled at most once
 * per gesture). Selection is controlled by MinePage.
 *
 * Tile states (priority: eliminated > winner > deployed > selected > base):
 * - base: 2px half-strength lime border (accent/45) + whisper glow — sits
 *   between the old hairline and the selected look (user direction
 *   2026-07-13); hover lifts toward accent
 * - selected: 2px accent border + stronger lime glow, accent label, white amount
 * - deployed (user's locked tiles): selected treatment + faint accent tint
 * - winner (revealed at the end of the elimination): accent border + hottest glow
 * - eliminated (round-end animation): the whole tile dims to a ghost of
 *   itself (opacity) — contents stay visible, just dull
 *
 * Round-end reveal (user spec 2026-07-13): when the round settles with a
 * winner, the 24 losing tiles fade out one by one in random order over
 * ELIMINATION_MS, then the winning tile lights up alone and holds until the
 * engine rolls the next round (SETTLING_MS is sized to fit the sequence).
 * Winnerless rounds skip the animation. Tiles render from a snapshot taken
 * at settle so a mid-animation round replacement can't wipe the visual;
 * every timeout id is kept in a ref and cleared on round change/unmount.
 */

import { useEffect, useRef, useState } from "react";
import { EthIcon } from "@/components/icons";
import type { RoundVM, TileId, TileVM } from "@/lib/types";

/** Losing tiles fade out one by one across this window (then the winner lights). */
const ELIMINATION_MS = 5_000;
/** Beat between the last elimination and the winner lighting up. */
const REVEAL_DELAY_MS = 200;

interface MineGridProps {
  round: RoundVM;
  selected: Set<TileId>;
  deployedTiles: TileId[];
  /** False locks all interaction (settling, deployed this round, pending deploy). */
  interactive: boolean;
  onToggle(id: TileId, forceOp?: "add" | "remove"): void;
}

export function MineGrid({
  round,
  selected,
  deployedTiles,
  interactive,
  onToggle,
}: MineGridProps) {
  const [dragOp, setDragOp] = useState<"add" | "remove" | null>(null);
  const visited = useRef<Set<TileId>>(new Set());
  const settling = round.phase !== "active";

  // Round-end reveal state. `eliminated` grows one tile at a time;
  // `revealed` flips once all losers are gone and the winner lights up.
  const [eliminated, setEliminated] = useState<Set<TileId>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { roundId, winningTile, endsAt } = round;
  const animating = settling && winningTile !== null;

  // Freeze the settled tiles so a round replacement mid-animation (SSE in
  // the real data layer) can't change what's fading out. All reveal state
  // resets happen HERE, via the adjust-state-during-render pattern, so the
  // new round never paints a frame carrying stale eliminated/revealed marks
  // (effect cleanup runs after paint — too late).
  const [snapshot, setSnapshot] = useState<{
    roundId: number;
    tiles: TileVM[];
  } | null>(null);
  const staleReveal = !animating && (snapshot !== null || eliminated.size > 0 || revealed);
  if ((animating && snapshot?.roundId !== roundId) || staleReveal) {
    setSnapshot(animating ? { roundId, tiles: round.tiles } : null);
    if (eliminated.size > 0) setEliminated(new Set());
    if (revealed) setRevealed(false);
  }

  useEffect(() => {
    // `settling` (not the raw phase string) so a same-round settling→settled
    // update from a real backend doesn't restart the animation.
    if (!settling || winningTile === null) return;
    // Anchor the timeline to the settle moment (endsAt), not to effect-run
    // time: mounting mid-settling (client-side nav during the window) joins
    // the sequence in progress instead of starting a doomed 5s run.
    const elapsed = Math.max(0, Date.now() - endsAt);
    const losers: TileId[] = [];
    for (let i = 0; i < 25; i++) if (i !== winningTile) losers.push(i);
    // Fisher–Yates in an effect: client-only, so hydration stays safe.
    for (let i = losers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [losers[i], losers[j]] = [losers[j], losers[i]];
    }
    const step = ELIMINATION_MS / losers.length;
    timeoutsRef.current = losers.map((id, i) =>
      setTimeout(
        () => {
          setEliminated((prev) => new Set(prev).add(id));
        },
        Math.max(0, (i + 1) * step - elapsed),
      ),
    );
    timeoutsRef.current.push(
      setTimeout(
        () => setRevealed(true),
        Math.max(0, ELIMINATION_MS + REVEAL_DELAY_MS - elapsed),
      ),
    );
    return () => {
      for (const t of timeoutsRef.current) clearTimeout(t);
      timeoutsRef.current = [];
    };
  }, [roundId, settling, winningTile, endsAt]);

  const tiles =
    animating && snapshot?.roundId === roundId ? snapshot.tiles : round.tiles;

  // Gesture ends on pointerup, pointercancel (touch scroll takeover / OS
  // gestures REPLACE pointerup per spec), or window blur — otherwise dragOp
  // wedges and unpressed hovering would keep painting tiles.
  useEffect(() => {
    if (!dragOp) return;
    const end = () => {
      setDragOp(null);
      visited.current.clear();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
    };
  }, [dragOp]);

  return (
    <div className="grid w-full max-w-[560px] grid-cols-5 gap-1.5 md:gap-2.5 lg:max-w-[660px]">
      {tiles.map((tile) => {
        const isSelected = selected.has(tile.id);
        const isDeployed = deployedTiles.includes(tile.id);
        const isEliminated = eliminated.has(tile.id);
        // The winner lights up only after the losers finish fading out.
        const isWinner = revealed && winningTile === tile.id;
        const lit = isSelected || isDeployed || isWinner;

        return (
          <button
            key={tile.id}
            type="button"
            data-tile={tile.id}
            disabled={!interactive}
            onPointerDown={(e) => {
              if (!interactive) return;
              e.preventDefault();
              // Touch implicitly captures the pointer to this button, which
              // would stop sibling tiles from ever seeing pointerenter —
              // release so drag-painting works on touchscreens.
              e.currentTarget.releasePointerCapture(e.pointerId);
              const op = isSelected ? "remove" : "add";
              setDragOp(op);
              visited.current = new Set([tile.id]);
              onToggle(tile.id, op);
            }}
            onPointerEnter={(e) => {
              if (!interactive || !dragOp || visited.current.has(tile.id))
                return;
              // Mouse: only paint while the primary button is held.
              if (e.pointerType === "mouse" && !(e.buttons & 1)) return;
              visited.current.add(tile.id);
              onToggle(tile.id, dragOp);
            }}
            onClick={(e) => {
              // Keyboard activation (Enter/Space) fires click with detail 0;
              // mouse/touch toggling already happened on pointerdown.
              if (!interactive || e.detail !== 0) return;
              onToggle(tile.id);
            }}
            aria-pressed={isSelected}
            data-eliminated={isEliminated || undefined}
            aria-label={`Tile ${tile.id + 1}, ${tile.ethFormatted} ETH deployed${
              isWinner
                ? ", winning tile"
                : isEliminated
                  ? ", eliminated"
                  : isDeployed
                    ? ", your deploy"
                    : isSelected
                      ? ", selected"
                      : ""
            }`}
            className={`relative flex aspect-square touch-none select-none flex-col justify-between rounded-[7px] border-2 p-2 text-left md:p-3 transition-all duration-300 ${
              isWinner
                ? "border-accent bg-gradient-to-b from-accent/25 to-accent/5 shadow-[0_0_26px] shadow-accent/50"
                : isDeployed
                  ? "border-accent bg-gradient-to-b from-accent/15 to-accent/[0.03] shadow-[0_0_18px] shadow-accent/30"
                  : isSelected
                    ? "border-accent bg-gradient-to-b from-accent/12 to-transparent shadow-[0_0_20px] shadow-accent/40"
                    : "border-accent/45 bg-gradient-to-b from-surface-active/60 to-bg shadow-[0_0_10px] shadow-accent/[0.07] hover:border-accent/75 hover:from-surface-active hover:shadow-[0_0_14px] hover:shadow-accent/20"
            } ${isEliminated ? "opacity-20" : ""} ${
              interactive ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <span
              className={`tnum text-[9px] font-medium md:text-[10px] ${
                lit ? "text-accent" : "text-fg-muted"
              }`}
            >
              {tile.label}
            </span>
            {/* shrink-0: without it flexbox crushes the SVG to ~0.7px next
                to 5-char amounts on phone tiles (audit finding — read as a
                data difference between tiles). Mobile sizes fit the ~48px
                content row: 10px icon + 10px amount. */}
            <span className="flex items-center justify-end gap-1 md:gap-1.5">
              <EthIcon
                size={14}
                className={`h-2.5 w-2.5 shrink-0 md:h-3.5 md:w-3.5 ${
                  lit ? "text-fg" : "text-fg-muted"
                }`}
              />
              <span
                className={`tnum text-[10px] font-medium md:text-[13px] ${
                  lit ? "text-fg" : "text-fg-body"
                }`}
              >
                {tile.ethFormatted}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
