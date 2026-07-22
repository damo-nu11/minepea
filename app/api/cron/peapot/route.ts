/**
 * Scheduled peapot announcements: GET with `Authorization: Bearer CRON_SECRET`
 * (Vercel Cron attaches it automatically when the env var exists; see
 * vercel.json for the schedule). Reads recent settled rounds from the game
 * backend, finds any whose peapot dropped, and posts one embed per hit to the
 * Discord channel webhook.
 *
 * IDEMPOTENCY: a round is CLAIMED in peapot_announcements before the post,
 * not after. The primary key means two overlapping cron runs cannot both
 * claim the same round, so only one posts. If the post then fails the claim is
 * released so a later run retries. Claiming after posting, which is the
 * obvious ordering, double-posts whenever the write fails after a successful
 * send.
 *
 * CATCH-UP: no time window and no cursor. The backend filters for us
 * (`/api/rounds?peapot=true`), so every round that ever fired is in hand on
 * every run and the dedup table decides what is new. A run that is late, or a
 * cron that was down for hours, therefore cannot lose a peapot.
 *
 * `?test=1` posts one fake peapot using the live PEA price, to confirm the
 * webhook and the formatting without waiting for a real hit.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { RoundsResponse } from "@/lib/api/translate";
import { fetchPriceHistory } from "@/lib/prices/geckoTerminal";
import { report } from "@/lib/report";
import {
  type PeapotHit,
  peapotEmbed,
  peapotHits,
  postToWebhook,
  TEST_HIT,
} from "@/lib/server/peapotAlerts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
/**
 * Shared secret that lets a SERVER-TO-SERVER call past the backend's bot
 * protection, which blocks datacenter IPs and so blocked every request from
 * Vercel while browsers were fine. Browser calls never send it and never
 * needed it. Absent locally, where the header is simply omitted.
 */
const FRONTEND_KEY = process.env.MINEPEA_API_KEY;
const WEBHOOK = process.env.DISCORD_PEAPOT_WEBHOOK_URL;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const maxDuration = 60;

/** The backend's hard cap; asking for more still returns 50. */
const PAGE_SIZE = 50;
/** Bound on the paging loop; 50 pages is 2,500 peapots. */
const MAX_PAGES = 50;

export async function GET(req: Request): Promise<NextResponse> {
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET || !WEBHOOK || !API_URL) {
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
  let scanned = 0;
  try {
    // Ask only for rounds that fired. This used to page every settled round
    // and filter locally, which cost a request per 50 rounds and grew with the
    // protocol; the filtered endpoint is one request and is complete.
    const hits: PeapotHit[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `${API_URL}/api/rounds?peapot=true&page=${page}&limit=${PAGE_SIZE}`,
        {
          cache: "no-store",
          headers: FRONTEND_KEY ? { "X-Frontend-Key": FRONTEND_KEY } : {},
        },
      );
      if (!res.ok) throw new Error(`backend /api/rounds ${res.status}`);
      const body = (await res.json()) as RoundsResponse;
      const rounds = body.rounds ?? [];
      if (rounds.length === 0) break;
      scanned += rounds.length;
      hits.push(...peapotHits(rounds));
      if (page >= (body.pagination?.pages ?? page)) break;
    }

    // Oldest first, so a backlog lands in the channel in the order it
    // happened rather than newest-first.
    hits.sort((a, b) => a.roundId - b.roundId);
    for (const hit of hits) {
      if (await announce(db, WEBHOOK, hit, peaUsd)) announced++;
    }
  } catch (err) {
    report("peapot-cron", err, { step: "scan" });
    return NextResponse.json(
      {
        error: "scan failed",
        announced,
        // Enough to tell the three failure modes apart without another
        // deploy: no key configured, key sent but still refused, or the
        // backend failing for some unrelated reason. Reports only WHETHER a
        // key is set and how long it is, never the value.
        detail: err instanceof Error ? err.message : String(err),
        keyConfigured: !!FRONTEND_KEY,
        keyLength: FRONTEND_KEY?.length ?? 0,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ scanned, announced, peaUsd });
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
