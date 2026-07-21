/**
 * Profile writes: PUT { username?, avatar? } with a Privy access token in
 * the Authorization header. The token is verified server-side (Privy server
 * SDK), the wallet address comes from the caller's request but is only
 * accepted if it belongs to the verified Privy user, and the row is written
 * with the Supabase service-role key (the anon key cannot write at all).
 *
 * Nulls clear: { username: null } deletes the stored username, likewise
 * avatar; a row with both null is deleted outright, so "remove my profile"
 * genuinely removes it (the privacy policy promises this).
 *
 * Env-gated like every seam: without the server env vars the route answers
 * 503 and the client quietly stays local-only.
 */

import { report } from "@/lib/report";
import { PrivyClient } from "@privy-io/server-auth";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const MAX_USERNAME = 24;
/** ~48KB data-URL ceiling; the panel exports ~10-20KB 128px JPEGs. */
const MAX_AVATAR = 65536;

interface PutBody {
  address?: unknown;
  username?: unknown;
  avatar?: unknown;
}

export async function PUT(req: Request): Promise<NextResponse> {
  if (!SUPABASE_URL || !SERVICE_KEY || !PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    return NextResponse.json(
      { error: "profiles not configured" },
      { status: 503 },
    );
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
  }

  const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
  let userId: string;
  try {
    const claims = await privy.verifyAuthToken(token);
    userId = claims.userId;
  } catch (err) {
    report("api/profile", err);
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch (err) {
    report("api/profile", err);
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const address =
    typeof body.address === "string" ? body.address.toLowerCase() : "";
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }

  // The address must belong to the verified Privy user — a valid token for
  // wallet A must not be able to write wallet B's profile.
  try {
    const user = await privy.getUser(userId);
    const owned = user.linkedAccounts.some(
      (a) =>
        a.type === "wallet" &&
        "address" in a &&
        typeof a.address === "string" &&
        a.address.toLowerCase() === address,
    );
    if (!owned) {
      return NextResponse.json({ error: "address not yours" }, { status: 403 });
    }
  } catch (err) {
    report("api/profile", err);
    return NextResponse.json({ error: "verification failed" }, { status: 502 });
  }

  const username =
    typeof body.username === "string" && body.username.trim().length > 0
      ? body.username.trim().slice(0, MAX_USERNAME)
      : null;
  const avatar =
    typeof body.avatar === "string" &&
    body.avatar.startsWith("data:image/") &&
    body.avatar.length <= MAX_AVATAR
      ? body.avatar
      : null;

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (username === null && avatar === null) {
    const { error } = await db.from("profiles").delete().eq("address", address);
    if (error) {
      return NextResponse.json({ error: "delete failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await db.from("profiles").upsert({
    address,
    username,
    avatar,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    // 23505 = unique_violation (someone else holds the username).
    const taken = "code" in error && error.code === "23505";
    return NextResponse.json(
      { error: taken ? "username taken" : "write failed" },
      { status: taken ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
