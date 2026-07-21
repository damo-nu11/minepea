/**
 * Discord link registration: POST { address } with a Privy access token.
 *
 * No OAuth handling here at all — Privy runs the Discord OAuth in the
 * profile drawer. This route verifies the token, reads the caller's linked
 * Discord STRAIGHT FROM PRIVY (authoritative; the client never supplies a
 * Discord id), confirms the wallet belongs to that user, reads the
 * wallet's total PEA on-chain, stores the link in social_connections and
 * brings the Holder/Whale roles in line. Idempotent: safe to re-call on
 * every profile-panel mount, which doubles as an on-demand role refresh.
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPrivyClient } from "@/lib/server/privy";
import {
  discordEnvReady,
  readTotalPea,
  revokeAllRoles,
  syncRoles,
} from "@/lib/server/discordRoles";
import type { Address } from "@/lib/types";

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

  // Both facts come from Privy, not the client: the wallet must be the
  // user's own, and the Discord identity is whatever THEY linked.
  let discordId: string | undefined;
  let discordUsername: string | undefined;
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
    const discord = user.linkedAccounts.find((a) => a.type === "discord_oauth");
    if (discord && "subject" in discord) {
      discordId = String(discord.subject);
      discordUsername =
        "username" in discord && discord.username
          ? String(discord.username)
          : undefined;
    }
  } catch {
    return NextResponse.json({ error: "verification failed" }, { status: 502 });
  }
  if (!discordId) {
    return NextResponse.json({ error: "no discord linked" }, { status: 400 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // If this wallet was linked to a DIFFERENT Discord account, strip that
  // account's roles before re-pointing — otherwise the old account keeps
  // Holder/Whale forever and a single wallet farms roles across accounts.
  try {
    const { data: prior } = await db
      .from("social_connections")
      .select("discord_id")
      .eq("wallet_address", address)
      .maybeSingle();
    if (
      prior?.discord_id &&
      prior.discord_id !== discordId &&
      discordEnvReady()
    ) {
      await revokeAllRoles(prior.discord_id);
    }
  } catch (e) {
    // Best-effort: a stale role is a lesser evil than blocking a relink,
    // but it must be visible.
    console.error(
      `[discord/register] ${address}: prior-role revoke failed: ${e instanceof Error ? e.message : "unknown"}`,
    );
  }

  const { error } = await db.from("social_connections").upsert({
    wallet_address: address,
    discord_id: discordId,
    discord_username: discordUsername ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    // 23505 on discord_id: that Discord account is already tied to another
    // wallet — refuse rather than silently re-pointing the roles.
    const dup = "code" in error && error.code === "23505";
    return NextResponse.json(
      {
        error: dup
          ? "discord already linked to another wallet"
          : "write failed",
      },
      { status: dup ? 409 : 500 },
    );
  }

  // Roles are best-effort: a bot hiccup must not fail the link itself,
  // but the failure is NAMED in the response and the server log, because
  // "linked but roleless" is otherwise undiagnosable from the client.
  let roles: { holder: boolean; whale: boolean } | null = null;
  let totalPea: number | null = null;
  let rolesError: string | null = null;
  if (!discordEnvReady()) {
    rolesError = "discord env vars missing (bot token / guild id / role ids)";
  } else {
    try {
      totalPea = await readTotalPea(address as Address);
    } catch (e) {
      rolesError = `chain read failed: ${e instanceof Error ? e.message : "unknown"}`;
    }
    if (totalPea !== null) {
      try {
        roles = await syncRoles(discordId, totalPea);
      } catch (e) {
        rolesError = `role sync failed (is the bot's role ABOVE the holder roles?): ${e instanceof Error ? e.message : "unknown"}`;
      }
    }
  }
  if (rolesError) {
    console.error(`[discord/register] ${address}: ${rolesError}`);
  } else if (roles) {
    // Success is logged too: a 0-balance wallet "syncs" to no roles without
    // any error, which is invisible unless stated.
    console.log(
      `[discord/register] ${address}: totalPea=${totalPea} holder=${roles.holder} whale=${roles.whale}`,
    );
  }

  return NextResponse.json({
    ok: true,
    username: discordUsername ?? null,
    totalPea,
    roles,
    rolesError,
  });
}
