/**
 * Scheduled peapot announcements: GET with `Authorization: Bearer CRON_SECRET`
 * (Vercel Cron attaches it automatically when the env var exists; see
 * vercel.json for the schedule). Reads RoundSettled events off the chain,
 * finds any whose peapot dropped, and posts one embed per hit to the Discord
 * channel webhook.
 *
 * IDEMPOTENCY: a round is CLAIMED in peapot_announcements before the post,
 * not after. The primary key means two overlapping cron runs cannot both
 * claim the same round, so only one posts. If the post then fails the claim is
 * released so a later run retries. Claiming after posting, which is the
 * obvious ordering, double-posts whenever the write fails after a successful
 * send.
 *
 * SOURCE: the chain, not the game API. `RoundSettled` logs carry the peapot
 * amount, and RPC serves servers as a matter of course, so nothing sits
 * between this cron and the answer. The scan window comfortably exceeds the
 * announce window, so every hit that could still post is always in view; a
 * hit older than the window never posts by definition, making a cursor
 * unnecessary.
 *
 * `?test=1` posts one fake peapot using the live PEA price, to confirm the
 * webhook and the formatting without waiting for a real hit.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fetchPriceHistory } from "@/lib/prices/geckoTerminal";
import { report } from "@/lib/report";
import {
  ANNOUNCE_MAX_AGE_MS,
  type PeapotHit,
  peapotEmbed,
  postToWebhook,
  TEST_HIT,
} from "@/lib/server/peapotAlerts";
import { scanPeapotHits } from "@/lib/server/peapotChain";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const WEBHOOK = process.env.DISCORD_PEAPOT_WEBHOOK_URL;

export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET || !WEBHOOK) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // One price read for the whole run, shared by every embed. This is our own
  // cached route's source, so the figure agrees with the site rather than
  // being a second, separately-drifting definition of the PEA price.
  let peaUsd: number | null = null;
  try {
    peaUsd = (await fetchPriceHistory()).priceUsd;
  } catch (err) {
    report("peapot-cron", err, { step: "price" });
  }

  const testMode = new URL(req.url).searchParams.get("test") === "1";
  if (testMode) {
    try {
      await postToWebhook(
        WEBHOOK,
        peapotEmbed(TEST_HIT, peaUsd, new Date().toISOString()),
      );
      return NextResponse.json({ test: true, posted: 1, peaUsd });
    } catch (err) {
      report("peapot-cron", err, { step: "test-post" });
      return NextResponse.json({ error: "post failed" }, { status: 502 });
    }
  }

  let announced = 0;
  let scan;
  try {
    scan = await scanPeapotHits();

    // Oldest first, so a backlog lands in the channel in the order it
    // happened rather than newest-first.
    const hits = [...scan.hits].sort((a, b) => a.roundId - b.roundId);
    for (const hit of hits) {
      // Announce only RECENT hits; older ones are claimed silently so they
      // never post. The scan window exceeds the announce window, so a run
      // after downtime sees the stale tail and buries it here instead of
      // flooding the channel with old hits announced as though they just
      // dropped. A hit with no timestamp is treated as old, never fresh.
      const age = hit.settledAtMs > 0 ? Date.now() - hit.settledAtMs : Infinity;
      if (age <= ANNOUNCE_MAX_AGE_MS) {
        if (await announce(db, WEBHOOK, hit, peaUsd)) announced++;
      } else {
        await claimSilently(db, hit);
      }
    }
  } catch (err) {
    report("peapot-cron", err, { step: "scan" });
    return NextResponse.json(
      {
        error: "scan failed",
        announced,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const summary = {
    // Settlement events seen in the window, hits or not; proves the chain
    // read worked even on the common run where no peapot fired.
    scanned: scan.settledSeen,
    announced,
    peaUsd,
    fromBlock: scan.fromBlock,
    headBlock: scan.headBlock,
  };
  // Same greppable prefix report() uses, so SUCCESS is readable straight
  // from the platform logs. The response body needs the bearer secret;
  // the log line needs only dashboard access.
  console.log("[pea:peapot-cron]", summary);
  return NextResponse.json(summary);
}

/**
 * Mark a hit as handled WITHOUT posting. Same insert announce() uses as its
 * lock, so a hit claimed here can never be posted by a later run either. A
 * duplicate key just means it was already handled, which is fine.
 */
async function claimSilently(
  db: SupabaseClient,
  hit: PeapotHit,
): Promise<void> {
  await db
    .from("peapot_announcements")
    .insert({ round_id: hit.roundId, pea_amount: String(hit.pea) });
}

/**
 * Claim the round, post, and release the claim if the post fails.
 * Returns true when an embed actually went out.
 */
async function announce(
  db: SupabaseClient,
  webhook: string,
  hit: PeapotHit,
  peaUsd: number | null,
): Promise<boolean> {
  // The insert IS the lock. A duplicate key means another run (or an earlier
  // one) already owns this round, so this run must not post.
  const { error: claimErr } = await db
    .from("peapot_announcements")
    .insert({ round_id: hit.roundId, pea_amount: String(hit.pea) });
  if (claimErr) return false;

  try {
    await postToWebhook(
      webhook,
      peapotEmbed(hit, peaUsd, new Date().toISOString()),
    );
    return true;
  } catch (err) {
    report("peapot-cron", err, { step: "post", roundId: hit.roundId });
    // Release the claim so the next run retries rather than this peapot being
    // silently swallowed by a transient Discord failure.
    const { error: rollbackErr } = await db
      .from("peapot_announcements")
      .delete()
      .eq("round_id", hit.roundId);
    if (rollbackErr) {
      report("peapot-cron", rollbackErr, {
        step: "rollback",
        roundId: hit.roundId,
      });
    }
    return false;
  }
}
