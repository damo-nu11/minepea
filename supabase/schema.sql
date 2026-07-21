-- PEA profiles — run this once in the Supabase SQL editor (Database → SQL).
--
-- One row per wallet. Writes NEVER come from the browser: the Next.js API
-- route verifies the caller's Privy token server-side and writes with the
-- service-role key (which bypasses RLS by design). The browser only READS,
-- through the anon key, which RLS below restricts to SELECT.

create table if not exists public.profiles (
  -- Lowercased 0x wallet address; the API route enforces the shape.
  address text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  -- Display name; uniqueness is case-insensitive via the index below.
  username text check (char_length(username) between 1 and 24),
  -- 128px JPEG data URL from the profile panel (~10-20KB). Move to Storage
  -- if avatars ever grow past this.
  avatar text check (char_length(avatar) <= 65536),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;

-- Public read: profiles exist to be shown next to on-chain activity.
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

-- No insert/update/delete policies: the anon key cannot write at all.
-- The service-role key (server only) bypasses RLS for the API route.
