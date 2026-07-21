"use client";

/**
 * MINERS feed (ui-spec §3.2.10): avatar, name/short address, tiles covered,
 * ETH deployed — the PREVIOUS round's miners, newest first (user direction
 * 2026-07-13: the panel is a record of who mined last round, not a live
 * stream of the current one). Keys are the engine's stable monotonic ids.
 *
 * Hovering (or focusing / tapping) a row opens a popover with a miniature
 * of that round's board — the miner's tiles lit lime, the winning tile
 * white-marked (overriding lime: it's the reference marker) — plus DEPLOYED
 * and REWARDS rows.
 *
 * REWARDS (user 2026-07-17, PEA only): every rewarded wallet shows the
 * PEA it earned that round, split rounds included. Earnings display in PEA,
 * never ETH (user follow-up 2026-07-17); the ETH figure on the right stays
 * the DEPLOYED amount. In API mode the figures come from the backend's
 * /api/round/:id/miners (see lib/api/roundMiners) — the only source that
 * includes the PEAPOT; the mock path still reconstructs shares locally
 * because there is no backend behind it. PEA recipients' rows shine
 * (gradient name); connected wallet rows get YOU.
 * Rendered through a PORTAL (the feed scrolls — an absolutely
 * positioned child would clip), pointer-events-none, below the row and
 * right-aligned to it, flipping above when there's no room (reference
 * behavior; its mobile variant also opens above).
 */

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EthIcon, PeaIcon, PersonIcon, TilesIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { useRoundMinerRewards } from "@/lib/api/roundMiners";
import { IS_API_MODE } from "@/lib/engineContext";
import { useMinersFeed, useRound, useRoundHistory } from "@/lib/hooks/useGame";
import { useLocalProfile, useProfiles } from "@/lib/profile";
import { useWallet } from "@/lib/walletContext";
import {
  TILE_ROT,
  TILE_W,
  TILE_XY,
  VIEW_W,
  VIEW_X,
  VIEW_Y,
} from "@/lib/vine/grow";
import type { FeedItemVM, RoundSummaryVM, TileId } from "@/lib/types";

const POPOVER_MARGIN = 8;

function MinerPopover({
  anchor,
  item,
  summary,
  peaWon,
  id,
}: {
  anchor: HTMLElement;
  item: FeedItemVM;
  summary: RoundSummaryVM;
  /** This event's computed PEA reward (0 ⇒ won none). */
  peaWon: number;
  /** Links the popover to its row via aria-describedby (audit). */
  id: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Position off the row rect: below, right-aligned; flip above when there
  // is no room. Direct style mutation before paint (Tooltip's pattern).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const left = Math.max(
      POPOVER_MARGIN,
      Math.min(r.right - pw, window.innerWidth - POPOVER_MARGIN - pw),
    );
    let top = r.bottom + POPOVER_MARGIN;
    if (top + ph > window.innerHeight - POPOVER_MARGIN)
      top = r.top - ph - POPOVER_MARGIN;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  });

  const winningTile = summary.winningTile;
  const coveredWinner = item.tiles.includes(winningTile);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={{ top: -9999, left: -9999 }}
      className="pointer-events-none fixed z-50 w-[250px] rounded-[10px] border border-line-slate bg-surface p-3"
    >
      {/* Screen-reader summary — the board + rows below are visual-only. */}
      <p className="sr-only">
        {`Previous round: deployed ${item.ethFormatted} ETH across ${item.tileCount} ${item.tileCount === 1 ? "tile" : "tiles"}, ${coveredWinner ? "including" : "not including"} the winning tile ${winningTile + 1}. ${peaWon > 0 ? `Won ${peaWon.toFixed(4)} PEA.` : "Won no PEA."}`}
      </p>
      {/* A miniature of the REAL board: the same pentagon geometry the Mine
          page renders, so the replica cannot drift from what it replays. */}
      <svg
        aria-hidden
        viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_W}`}
        className="h-[226px] w-full"
      >
        {TILE_XY.map(([tx, ty], b) => {
          const on = item.tiles.includes(b as TileId);
          const win = b === winningTile;
          // Winner marker OVERRIDES the deployed tint — it's the round's
          // reference marker whether or not this miner covered it.
          return (
            <g
              key={b}
              transform={`rotate(${TILE_ROT[b].toFixed(2)} ${tx} ${ty})`}
            >
              <rect
                x={tx - TILE_W / 2}
                y={ty - TILE_W / 2}
                width={TILE_W}
                height={TILE_W}
                rx="10"
                fill={
                  win
                    ? "var(--color-fg)"
                    : on
                      ? "rgba(204,255,0,0.10)"
                      : "transparent"
                }
                stroke={
                  win
                    ? "var(--color-fg)"
                    : on
                      ? "rgba(204,255,0,0.6)"
                      : "rgba(46,58,0,0.6)"
                }
                strokeWidth="3"
              />
              <text
                x={tx}
                y={ty + 11}
                textAnchor="middle"
                transform={`rotate(${(-TILE_ROT[b]).toFixed(2)} ${tx} ${ty})`}
                fontSize="30"
                fontWeight={600}
                fill={
                  win
                    ? "var(--color-on-light)"
                    : on
                      ? "var(--color-accent)"
                      : "var(--color-fg-disabled)"
                }
                className="tnum"
              >
                {b + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <dl aria-hidden className="mt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <dt className="micro-label">Deployed</dt>
          <dd className="flex items-center gap-1.5">
            <EthIcon size={13} className="text-fg" />
            <span className="tnum text-[13px] font-semibold text-fg">
              {item.ethFormatted}
            </span>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="micro-label">Rewards</dt>
          <dd className="flex items-center gap-1.5">
            {peaWon > 0 ? (
              <>
                <PeaIcon size={13} className="text-accent" />
                <span className="tnum text-[13px] font-semibold text-accent">
                  {peaWon.toFixed(4)}
                </span>
              </>
            ) : (
              <span className="text-[13px] text-fg-muted">—</span>
            )}
          </dd>
        </div>
      </dl>
    </div>,
    document.body,
  );
}

export function MinersFeed() {
  const feed = useMinersFeed();
  const round = useRound();
  const history = useRoundHistory();
  const wallet = useWallet();
  const you = wallet.address?.toLowerCase();
  // Identity, three sources in priority order: the connected wallet's OWN
  // rows use the LOCAL profile (instant, offline); everyone resolves against
  // the SHARED Supabase profiles (env-gated, cached); wire minerName is the
  // final fallback before the short address.
  const profile = useLocalProfile();

  // PREVIOUS rounds only (user 2026-07-17, supersedes the latest-populated
  // rule): the panel is a record of the last finished round that HAD miners,
  // never a live stream of the current one. Taking the max feed round BELOW
  // the current id keeps the low-activity fallback (an empty previous round
  // falls back to the newest older round still in the log) without ever
  // showing in-flight deploys.
  const currentId = round.data?.roundId;
  const shownRoundId =
    currentId === undefined
      ? undefined
      : (feed.data ?? []).reduce<number | undefined>(
          (max, m) =>
            m.roundId < currentId && (max === undefined || m.roundId > max)
              ? m.roundId
              : max,
          undefined,
        );
  const items = (feed.data ?? []).filter((m) => m.roundId === shownRoundId);
  const shared = useProfiles(items.map((m) => m.address.toLowerCase()));

  // The settled summary of the shown round drives the popover AND the
  // per-wallet reward math below; absent (fresh seed) ⇒ rows don't pop.
  const summary = history.data?.find((h) => h.roundId === shownRoundId);

  // API mode: the backend's per-miner rewards, which fold in the PEAPOT and
  // divide by the true winnersDeployed. null until they land.
  const liveRewards = useRoundMinerRewards(shownRoundId);

  // Mock-only fallback. Per-event stake on the winning tile: an event's
  // amount spreads evenly across its tiles (engine rule), so the winning-tile
  // stake is eth/tiles. In a split, the 1 minted PEA divides pro-rata across
  // these stakes; a solo winner takes the whole PEA. The simulation never
  // drops a peapot on a settled round, so this stays faithful there — but it
  // is NOT the truth against a live chain, hence the API branch below.
  const stakeOnWin = (m: FeedItemVM): number =>
    summary !== undefined && m.tiles.includes(summary.winningTile)
      ? m.eth / m.tiles.length
      : 0;
  const winTileTotal = items.reduce((sum, m) => sum + stakeOnWin(m), 0);
  const peaWonOf = (m: FeedItemVM): number => {
    // Live: the server is the sole authority. Before it answers, show no
    // reward rather than a reconstruction that would omit the peapot.
    if (IS_API_MODE) return liveRewards?.get(m.address.toLowerCase()) ?? 0;
    if (summary === undefined || winTileTotal <= 0) return 0;
    if (summary.isSplit) return stakeOnWin(m) / winTileTotal;
    return summary.winner?.toLowerCase() === m.address.toLowerCase() ? 1 : 0;
  };

  // Keyed by event id (a miner can appear twice); anti-flicker on leave:
  // only clear when this row still owns the popover.
  const [hovered, setHovered] = useState<{
    id: number;
    el: HTMLElement;
  } | null>(null);

  return (
    <div className="glass-pane flex flex-col gap-3 rounded-[16px] px-4 py-4">
      {/* self-start: as a stretched flex item the tooltip would anchor to
          the full column width and pop up mid-panel instead of at the label. */}
      <Tooltip
        content="Miners who deployed in the previous round, newest first."
        className="self-start"
      >
        <span className="micro-label dashed-underline transition-colors hover:text-fg">
          Miners
        </span>
      </Tooltip>
      {/* ~5 rows tall, then scrolls INSIDE the panel (row ≈ 44px). Fixed
          height so all 5 sit inside the box, not spilling out. */}
      <div className="max-h-60 overflow-y-auto pr-1">
        {round.data && items.length === 0 && (
          <p className="pt-2 text-[13px] text-fg-muted">No deploys yet.</p>
        )}
        <ul className="flex flex-col gap-1">
          {items.map((m) => {
            const addr = m.address.toLowerCase();
            const isYou = you !== undefined && addr === you;
            const sharedRow = shared.get(addr);
            const rowName =
              (isYou && profile.username) ||
              sharedRow?.username ||
              (isYou && profile.username === null ? null : null) ||
              m.display;
            const rowAvatar =
              (isYou ? profile.avatar : null) ?? sharedRow?.avatar ?? null;
            const peaWon = peaWonOf(m);
            // PEA recipients shine — the solo winner, or every covering
            // wallet in a split (user 2026-07-17: splits show too).
            const crowned = peaWon > 0;
            return (
              <li
                key={m.id}
                tabIndex={summary ? 0 : undefined}
                aria-describedby={
                  hovered?.id === m.id && summary && m.tiles.length > 0
                    ? `miner-pop-${m.id}`
                    : undefined
                }
                className="flex h-10 items-center justify-between rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse")
                    setHovered({ id: m.id, el: e.currentTarget });
                }}
                onPointerLeave={() =>
                  setHovered((h) => (h?.id === m.id ? null : h))
                }
                onPointerUp={(e) => {
                  // Touch: tap toggles (hover doesn't exist there).
                  if (e.pointerType !== "mouse")
                    setHovered((h) =>
                      h?.id === m.id ? null : { id: m.id, el: e.currentTarget },
                    );
                }}
                onFocus={(e) => setHovered({ id: m.id, el: e.currentTarget })}
                onBlur={() => setHovered((h) => (h?.id === m.id ? null : h))}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface">
                    {rowAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data-URL avatar; next/image adds nothing
                      <img
                        src={rowAvatar}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <PersonIcon size={14} className="text-fg-body" />
                    )}
                  </span>
                  <span
                    className={`tnum truncate text-sm ${
                      crowned
                        ? "bg-gradient-to-r from-accent via-fg to-accent bg-clip-text font-bold text-transparent"
                        : "font-medium text-fg"
                    }`}
                  >
                    {rowName}
                  </span>
                  {isYou && (
                    <span className="shrink-0 rounded-full border border-accent/40 bg-accent/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-accent">
                      YOU
                    </span>
                  )}
                  {/* Reward badge: the PEA this wallet EARNED last round,
                    splits included (user 2026-07-17: PEA only — the ETH on
                    the right is what they deployed, not a reward). */}
                  {peaWon > 0 && (
                    <span className="flex shrink-0 items-center gap-1">
                      <PeaIcon size={13} className="text-accent" />
                      <span className="tnum text-[13px] font-bold text-accent">
                        +{peaWon.toFixed(4)}
                      </span>
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <TilesIcon size={12} className="text-fg-muted" />
                  <span className="tnum text-[13px] text-fg-muted">
                    {m.tileCount}
                  </span>
                  <EthIcon size={14} className="ml-1 text-fg" />
                  <span className="tnum text-sm font-semibold text-fg">
                    {m.ethFormatted}
                  </span>
                </span>
                {hovered?.id === m.id && summary && m.tiles.length > 0 && (
                  <MinerPopover
                    anchor={hovered.el}
                    item={m}
                    summary={summary}
                    peaWon={peaWon}
                    id={`miner-pop-${m.id}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
