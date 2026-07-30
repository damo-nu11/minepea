/**
 * Miniature of the REAL board (extracted from the MinersFeed popover for
 * the /profile history rows, Convention 5): the same pentagon geometry the
 * Mine page renders — TILE_XY/TILE_ROT/VIEW_* from lib/vine/grow — so a
 * replica can never drift from the board it replays. Covered tiles wash
 * lime, the winning tile is the white reference marker whether or not it
 * was covered.
 */

import {
  TILE_ROT,
  TILE_W,
  TILE_XY,
  VIEW_W,
  VIEW_X,
  VIEW_Y,
} from "@/lib/vine/grow";
import type { TileId } from "@/lib/types";

export function BoardMini({
  tiles,
  winningTile,
  className = "h-[226px] w-full",
}: {
  tiles: readonly TileId[];
  winningTile: TileId;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_W}`}
      className={className}
    >
      {TILE_XY.map(([tx, ty], b) => {
        const on = tiles.includes(b as TileId);
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
  );
}
