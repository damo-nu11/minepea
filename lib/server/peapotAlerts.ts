/**
 * SERVER-ONLY: peapot Discord announcements.
 *
 * The detection problem is already solved upstream. The game backend indexes
 * every settled round and reports `peapotAmount` on it, so this never touches
 * the chain: no event ABI to keep in step with the contract, no RPC, and no
 * block window. `lib/abi/gridMining.ts` is a minimal hand-curated ABI with no
 * events in it at all, so a log-scanning version would need a second ABI that
 * breaks silently if the contract's event signature ever changes.
 *
 * There is also no time window and no cursor. The route reads recent settled
 * rounds and asks the dedup table what it has already posted, paging further
 * back while it still finds unannounced hits. A cron that is late, or was
 * down for hours, therefore catches up on its next run rather than losing
 * those peapots.
 *
 * This module holds the parts worth testing: which rounds count as hits, and
 * what the embed says. The route owns auth, the database and the network.
 */

import { fmtToken, fromWei } from "@/lib/format";

/**
 * The fields of a settled round this module needs.
 *
 * Deliberately no winner: the peapot always splits across the winning tile's
 * miners (user 2026-07-22), so there is never a single recipient to name.
 */
export interface SettledRoundLike {
  roundId: number;
  /** Decimal wei string. "0" means the peapot did not drop this round. */
  peapotAmount: string;
  /** ZERO-INDEXED, as the backend reports it. */
  winningBlock: number;
}

export interface PeapotHit {
  roundId: number;
  /** Whole PEA, already out of wei. */
  pea: number;
  /** 1-indexed, as the site displays it. */
  tile: number;
}

/**
 * Rounds where the peapot actually dropped.
 *
 * A hit is `peapotAmount` other than "0". The backend normalises hex to
 * decimal at the translate boundary, but this runs against the raw payload,
 * so guard against a value that is non-zero yet unparseable rather than
 * announcing a peapot of NaN PEA.
 */
export function peapotHits(rounds: SettledRoundLike[]): PeapotHit[] {
  const hits: PeapotHit[] = [];
  for (const r of rounds) {
    if (!r.peapotAmount || r.peapotAmount === "0") continue;
    const pea = fromWei(r.peapotAmount);
    if (!Number.isFinite(pea) || pea <= 0) continue;
    hits.push({
      roundId: r.roundId,
      pea,
      // The backend counts tiles from 0; every user-facing surface counts
      // from 1 (see mappers.ts tileLabel). Announcing the raw index would
      // name the wrong tile.
      tile: r.winningBlock + 1,
    });
  }
  return hits;
}

/** Voltage lime, matching the site's accent. */
const ACCENT = 0xccff00;

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline: boolean }[];
  footer: { text: string };
  timestamp: string;
  url: string;
}

/**
 * The announcement embed.
 *
 * `peaUsd` is null when no market price is available, in which case the USD
 * field is omitted rather than printed as $0.00: an invented valuation in a
 * public channel is worse than a missing one.
 */
export function peapotEmbed(
  hit: PeapotHit,
  peaUsd: number | null,
  now: string,
): DiscordEmbed {
  const fields: DiscordEmbed["fields"] = [
    { name: "🫛 Total PEA", value: fmtToken(hit.pea, 3), inline: false },
  ];
  if (peaUsd !== null && peaUsd > 0) {
    fields.push({
      name: "💵 USD Value",
      value: `~$${(hit.pea * peaUsd).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      inline: false,
    });
  }
  return {
    // Hyphen, not an em-dash: this is user-facing copy and the house rule
    // applies to a Discord embed exactly as it does to a page.
    title: `🫛 PEAPOT - Round #${hit.roundId}`,
    description: `**Tile #${hit.tile}** just hit the peapot!`,
    color: ACCENT,
    fields,
    footer: { text: "minepea.com" },
    timestamp: now,
    url: "https://minepea.com",
  };
}

/** A fake hit for the `?test=1` smoke check. */
export const TEST_HIT: PeapotHit = {
  roundId: 9999,
  pea: 30.921,
  tile: 17,
};

/** POST the embed to the channel webhook. Throws on a non-2xx. */
export async function postToWebhook(
  webhookUrl: string,
  embed: DiscordEmbed,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord webhook ${res.status} ${detail.slice(0, 200)}`);
  }
}
