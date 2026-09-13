-- 0002_guest_pledges.sql
-- Run manually in Supabase → SQL Editor after 0001_init.sql.
-- Lets backers pledge without an account. Logged-in backers still attach backer_id.

alter table public.pledges
  alter column backer_id drop not null;

-- Opaque token returned only at create time. Required to confirm guest pledges
-- so knowing a random UUID is not enough.
alter table public.pledges
  add column if not exists guest_token text;

-- Guests never authenticate, so they cannot use the "backer read" RLS path.
-- Owners still see all pledges on their campaigns; logged-in backers see theirs.
-- No client write policies added: service role still owns inserts/updates.
