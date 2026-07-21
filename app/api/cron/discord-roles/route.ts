/**
 * Scheduled role refresh: GET with `Authorization: Bearer CRON_SECRET`
 * (Vercel Cron attaches it automatically when the env var exists; see
 * vercel.json for the schedule). Re-reads every linked wallet's total PEA
 * and grants/revokes Holder/Whale so roles stay honest as balances move.
 * Batches of 5 with a small pause, gentle on the RPC.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  discordEnvReady,
  readTotalPea,
  syncRoles,
} from "@/lib/server/discordRoles";
import type { Address } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 60;

const BATCH = 5;
const PAUSE_MS = 300;

export async function GET(req: Request): Promise<NextResponse> {
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET || !discordEnvReady()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rows, error } = await db
    .from("social_connections")
    .select("wallet_address,discord_id")
    .not("discord_id", "is", null);
  if (error) {
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  let synced = 0;
  let failed = 0;
  const list = rows ?? [];
  for (let i = 0; i < list.length; i += BATCH) {
    await Promise.all(
      list.slice(i, i + BATCH).map(async (row) => {
        try {
          const total = await readTotalPea(row.wallet_address as Address);
          await syncRoles(row.discord_id as string, total);
          synced += 1;
        } catch {
          failed += 1;
        }
      }),
    );
    if (i + BATCH < list.length) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  return NextResponse.json({ ok: true, wallets: list.length, synced, failed });
}
