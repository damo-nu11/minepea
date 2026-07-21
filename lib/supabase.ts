/**
 * Supabase browser client — READS ONLY (RLS allows nothing else on the
 * anon key; all writes go through app/api/profile, which verifies the
 * caller's Privy token and uses the server-side service-role key).
 *
 * Env-gated like every integration seam: null without the env vars, and
 * every consumer must handle that (mock mode keeps working with zero
 * credentials).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        // No Supabase auth session — identity lives with Privy.
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export interface ProfileRow {
  address: string;
  username: string | null;
  avatar: string | null;
}
