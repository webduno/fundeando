-- 0001_init.sql
-- Run manually in Supabase → SQL Editor.
--
-- Model: keep-it-all crowdfunding. USDT goes straight from the backer to the
-- creator's SPIDI alias, so there is no escrow and no "charge at deadline".
-- goal/deadline are display-only progress.
--
-- Trust boundary:
--   * profiles / campaigns are written by the browser under RLS.
--   * pledges are written ONLY by the server (service role) after it created
--     the SPIDI session itself and verified the payment against SPIDI.
--     No client policy allows insert/update on pledges.

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  -- SPIDI username that receives pledges for this user's campaigns.
  spidi_alias   text check (spidi_alias is null or spidi_alias ~ '^[a-z0-9._-]{2,40}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone can see who owns a campaign. The alias is public on SPIDI anyway.
create policy "profiles: public read"
  on public.profiles for select
  using (true);

create policy "profiles: owner insert"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles: owner update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 3 and 120),
  description  text not null default '' check (char_length(description) <= 5000),
  goal_usdt    numeric(12, 2) not null check (goal_usdt > 0),
  deadline     timestamptz not null,
  status       text not null default 'active' check (status in ('draft', 'active', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index campaigns_owner_idx on public.campaigns (owner_id);
create index campaigns_status_deadline_idx on public.campaigns (status, deadline);

alter table public.campaigns enable row level security;

-- Active campaigns are public. Owners always see their own (incl. drafts/closed).
create policy "campaigns: public read active"
  on public.campaigns for select
  using (status = 'active' or owner_id = auth.uid());

create policy "campaigns: owner insert"
  on public.campaigns for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "campaigns: owner update"
  on public.campaigns for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "campaigns: owner delete"
  on public.campaigns for delete
  to authenticated
  using (owner_id = auth.uid());

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pledges: server-only writes
-- ---------------------------------------------------------------------------
create table public.pledges (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns (id) on delete cascade,
  backer_id         uuid not null references public.profiles (id) on delete cascade,
  amount_usdt       numeric(12, 2) not null check (amount_usdt >= 1),
  amount_bs         numeric(14, 2) not null check (amount_bs > 0),
  bcv_rate          numeric(14, 4) not null check (bcv_rate > 0),
  -- Snapshot of who got paid, in case the owner changes their alias later.
  recipient_alias   text not null,
  -- SPIDI session id. Unique so a confirm call can never double-credit.
  spidi_session_id  text not null unique,
  status            text not null default 'pending'
                    check (status in ('pending', 'paid', 'failed', 'expired')),
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index pledges_campaign_idx on public.pledges (campaign_id, status);
create index pledges_backer_idx on public.pledges (backer_id);

alter table public.pledges enable row level security;

-- Backers see their own pledges; campaign owners see pledges to their campaigns.
create policy "pledges: backer or owner read"
  on public.pledges for select
  to authenticated
  using (
    backer_id = auth.uid()
    or exists (
      select 1 from public.campaigns c
      where c.id = pledges.campaign_id and c.owner_id = auth.uid()
    )
  );

-- Intentionally no insert/update/delete policies: only the service role writes here.

create trigger pledges_set_updated_at
  before update on public.pledges
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- campaign_totals: public aggregate of PAID pledges.
-- Runs as the view owner (not security_invoker) on purpose: it exposes only
-- sums/counts, never individual pledge rows, and anon needs it for progress bars.
-- ---------------------------------------------------------------------------
create view public.campaign_totals
with (security_invoker = false)
as
select
  c.id                                                       as campaign_id,
  coalesce(sum(p.amount_usdt) filter (where p.status = 'paid'), 0)::numeric(14, 2) as raised_usdt,
  count(p.id) filter (where p.status = 'paid')               as backer_count
from public.campaigns c
left join public.pledges p on p.campaign_id = c.id
group by c.id;

grant select on public.campaign_totals to anon, authenticated;
