-- PEA social connections — run once in the Supabase SQL editor.
--
-- Links a wallet to social accounts. Discord rows drive holder-role
-- assignment in the community server (re-checked by the cron route).
-- Twitter columns are storage-only for now.
--
-- Writes NEVER come from the browser: the Next.js API routes verify the
-- caller's Privy token and write with the service-role key. The anon key
-- can read ONLY the display columns; the wallet-to-Discord-id mapping is
-- column-locked so it cannot be scraped.

create table if not exists public.social_connections (
  wallet_address text primary key check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  discord_id text unique,
  discord_username text,
  twitter_id text,
  twitter_handle text,
  updated_at timestamptz not null default now()
);

alter table public.social_connections enable row level security;

create policy "social connections are publicly readable"
  on public.social_connections for select
  using (true);

-- Column-level lockdown on top of RLS: display columns only for the
-- public keys. (service_role bypasses this, as intended.)
revoke select on public.social_connections from anon;
revoke select on public.social_connections from authenticated;
grant select (wallet_address, discord_username, twitter_handle)
  on public.social_connections to anon;
