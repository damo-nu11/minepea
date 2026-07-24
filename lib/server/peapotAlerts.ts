/**
 * SERVER-ONLY: peapot Discord announcements.
 *
 * Detection lives in lib/server/peapotChain.ts, which reads `RoundSettled`
 * events straight off the chain. It used to come from the game API, which
 * every browser could reach and no server could: the API's edge challenges
 * datacenter traffic, a server cannot answer a challenge, and that product
 * accepts no exceptions, so the cron's requests died at the front door with
 * the header rule powerless to help. Reading the chain removes the edge from
 * the path structurally rather than negotiating with it.
 *
 * This module holds the parts every announcer needs regardless of source:
 * the hit shape, the freshness window, the embed, and the webhook post. The
 * route owns auth, the dedup table and the loop.
 */

import { fmtToken } from "@/lib/format";

/**
 * Announce hits no older than this; the route claims older ones silently.
 * The chain scanner sizes its lookback off this constant so every hit that
 * could still post is guaranteed to be inside the scan.
 */
export const ANNOUNCE_MAX_AGE_MS = 60 * 60 * 1000;

export interface PeapotHit {
  roundId: number;
  /** Whole PEA, already out of wei. */
  pea: number;
  /** 1-indexed, as the site displays it. The contract counts from 0. */
  tile: number;
  /** Settlement time in epoch ms, from the block that emitted the event. */
  settledAtMs: number;
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
  settledAtMs: 0,
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
