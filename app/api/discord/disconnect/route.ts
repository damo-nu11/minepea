/**
 * Discord disconnect: POST { address } with a Privy access token.
 *
 * Revokes the Holder/Whale roles BEFORE forgetting the Discord id — the
 * reverse order leaves roles stranded forever, because the cron only sees
 * rows that still have an id. Then nulls the Discord columns (Twitter
 * columns untouched).
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPrivyClient } from "@/lib/server/privy";
import { discordEnvReady, revokeAllRoles } from "@/lib/server/discordRoles";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export async function POST(req: Request): Promise<NextResponse> {
  if (!SUPABASE_URL || !SERVICE_KEY || !PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token)
    return NextResponse.json({ error: "missing token" }, { status: 401 });

  const privy = getPrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
  let userId: string;
  try {
    userId = (await privy.verifyAuthToken(token)).userId;
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let address = "";
  try {
    const body = (await req.json()) as { address?: unknown };
    address =
      typeof body.address === "string" ? body.address.toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }

  try {
    const user = await privy.getUser(userId);
    const ownsWallet = user.linkedAccounts.some(
      (a) =>
        a.type === "wallet" &&
        "address" in a &&
        typeof a.address === "string" &&
        a.address.toLowerCase() === address,
    );
    if (!ownsWallet) {
      return NextResponse.json({ error: "address not yours" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "verification failed" }, { status: 502 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row } = await db
    .from("social_connections")
    .select("discord_id")
    .eq("wallet_address", address)
    .maybeSingle();

  // Roles first (best-effort), THEN forget the id.
  if (row?.discord_id && discordEnvReady()) {
    try {
      await revokeAllRoles(row.discord_id);
    } catch {
      // Bot hiccup: the cron can't fix this row after the null, but the
      // link removal must not be blocked by Discord being down.
    }
  }
  const { error } = await db
    .from("social_connections")
    .update({
      discord_id: null,
      discord_username: null,
      updated_at: new Date().toISOString(),
    })
    .eq("wallet_address", address);
  if (error) {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
