"use client";

/**
 * Profile seam, two layers:
 *
 * LOCAL — the username + avatar in localStorage: instant, offline, and the
 * only layer in mock mode. Consumers subscribe via useLocalProfile();
 * ProfilePanel announces writes with PROFILE_CHANGED_EVENT.
 *
 * SHARED — the same fields in Supabase, so OTHER miners see them. Writes go
 * through /api/profile (Privy-token-authenticated; pushProfile below) and
 * reads come straight off the anon key (useProfiles: batched, cached,
 * read-only by RLS). Both are env-gated: with no Supabase env the app is
 * local-only, exactly as before. The privacy policy documents the shared
 * layer; keep them in step.
 */

import { useEffect, useState } from "react";
import { supabase, type ProfileRow } from "@/lib/supabase";

export const USERNAME_KEY = "pea-username";
export const AVATAR_KEY = "pea-avatar";
export const PROFILE_CHANGED_EVENT = "pea-profile-changed";

export interface LocalProfile {
  username: string | null;
  /** Data-URL JPEG (128px square) or null when unset. */
  avatar: string | null;
}

/** Guarded read — storage can be blocked (private mode, quota, policy). */
export function readLocalProfile(): LocalProfile {
  try {
    return {
      username: localStorage.getItem(USERNAME_KEY),
      avatar: localStorage.getItem(AVATAR_KEY),
    };
  } catch {
    return { username: null, avatar: null };
  }
}

/** Fire after writing profile keys so open surfaces re-read. */
export function announceProfileChange(): void {
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

/**
 * Hydration-safe subscription: null on the server and first client render,
 * real values after mount, live across same-page edits AND other tabs.
 */
export function useLocalProfile(): LocalProfile {
  const [profile, setProfile] = useState<LocalProfile>({
    username: null,
    avatar: null,
  });
  useEffect(() => {
    const read = () => setProfile(readLocalProfile());
    read();
    window.addEventListener(PROFILE_CHANGED_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return profile;
}

// ─── Shared layer ───────────────────────────────────────────────────────────

export type PushResult = "ok" | "taken" | "error" | "skipped";

/**
 * Write-through to /api/profile. "skipped" = no token source (stub wallet)
 * or profiles not configured — local-only mode, not a failure. Both fields
 * null deletes the row server-side.
 */
export async function pushProfile(params: {
  address: string;
  username: string | null;
  avatar: string | null;
  getToken: (() => Promise<string | null>) | undefined;
}): Promise<PushResult> {
  if (!params.getToken) return "skipped";
  let token: string | null = null;
  try {
    token = await params.getToken();
  } catch {
    return "error";
  }
  if (!token) return "skipped";
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        address: params.address.toLowerCase(),
        username: params.username,
        avatar: params.avatar,
      }),
    });
    if (res.ok) return "ok";
    if (res.status === 409) return "taken";
    if (res.status === 503) return "skipped"; // not configured
    return "error";
  } catch {
    return "error";
  }
}

/** Session cache: address → row (null = known-absent). One fetch per
 * address per session; the miners panel re-renders ~3/s off engine ticks,
 * so resolution must never refetch on render. */
const profileCache = new Map<string, ProfileRow | null>();

/**
 * Resolve shared profiles for a set of lowercased addresses. Returns only
 * the rows that exist; empty map without Supabase env (local-only mode).
 */
export function useProfiles(addresses: string[]): Map<string, ProfileRow> {
  const [, bump] = useState(0);
  // Stable key so the effect runs per address-set, not per render.
  const key = addresses.slice().sort().join(",");
  useEffect(() => {
    if (!supabase) return;
    const missing = key.split(",").filter((a) => a && !profileCache.has(a));
    if (missing.length === 0) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("address,username,avatar")
      .in("address", missing)
      .then(({ data }) => {
        if (cancelled) return;
        const found = new Set<string>();
        for (const row of (data ?? []) as ProfileRow[]) {
          profileCache.set(row.address, row);
          found.add(row.address);
        }
        for (const a of missing)
          if (!found.has(a)) profileCache.set(a, null);
        bump((n) => n + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const out = new Map<string, ProfileRow>();
  for (const a of key.split(",")) {
    const row = profileCache.get(a);
    if (row) out.set(a, row);
  }
  return out;
}
