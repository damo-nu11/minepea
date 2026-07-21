-- PEA peapot announcements — run once in the Supabase SQL editor.
--
-- One row per round whose peapot has been announced to Discord. It exists
-- purely so the same peapot is never posted twice: the cron route claims a
-- round by INSERTing here BEFORE posting, and only posts if the insert
-- actually took. Two overlapping cron runs therefore cannot both post, and a
-- run that dies after posting cannot repost on the next pass.
--
-- The primary key is the whole mechanism. Keep it unique.
--
-- There is no cursor and no time window. The cron reads recent settled
-- rounds from the game backend and asks this table what it has already
-- posted, paging further back while it still finds unannounced hits. So a
-- cron that is late, or was down for hours, catches up on its next run
-- instead of losing those peapots.
--
-- Nothing reads this from the browser. Reads and writes come only from the
-- cron route using the service-role key, so RLS is enabled with NO policies:
-- anon and authenticated get nothing, service_role bypasses RLS as intended.

create table if not exists public.peapot_announcements (
  round_id bigint primary key,
  -- Peapot size at announcement, decimal PEA as a string. Stored so there is
  -- a record of what was actually posted, independent of the backend.
  pea_amount text,
  announced_at timestamptz not null default now()
);

alter table public.peapot_announcements enable row level security;

revoke all on public.peapot_announcements from anon;
revoke all on public.peapot_announcements from authenticated;
