-- Grand Finale fan vote: anyone may back a team, pick a bracket and leave a
-- cheer (ADR-0015). Optional pledges are paid on a Paystack Payment Page, so no
-- payment data is stored here. Idempotent.

create table if not exists public.finale_teams (
  id           uuid primary key default gen_random_uuid(),
  edition_year int  not null references public.editions(year),
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  name         text not null check (length(name) between 1 and 60),
  label        text check (length(label) <= 60),
  schools      text check (length(schools) <= 120),
  semi         smallint not null check (semi in (1, 2)),
  sort         smallint not null default 0,
  color        text not null default 'teal' check (color in ('teal', 'coral', 'indigo', 'green', 'plum', 'amber')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (edition_year, slug),
  -- Target for the composite keys below, so a pick can't name another edition's team.
  unique (id, edition_year)
);

create table if not exists public.finale_settings (
  edition_year     int primary key references public.editions(year),
  is_open          boolean not null default false,
  closes_at        timestamptz,
  semi1_winner_id  uuid references public.finale_teams on delete set null,
  semi2_winner_id  uuid references public.finale_teams on delete set null,
  champion_team_id uuid references public.finale_teams on delete set null,
  reward_count     int  not null default 20 check (reward_count between 1 and 500),
  reward_text      text check (length(reward_text) <= 500),
  pledge_url       text check (pledge_url ~ '^https://(paystack\.com/pay|paystack\.shop)/[A-Za-z0-9_-]+$'),
  -- Typed in by an admin from the Paystack dashboard; shown as the fund's total.
  fund_total       int  check (fund_total >= 0),
  updated_by       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

-- One supporter per phone per edition. The phone is never shown publicly; it is
-- the dedupe key and how staff reach the winners.
create table if not exists public.finale_supporters (
  id            uuid primary key default gen_random_uuid(),
  edition_year  int  not null references public.editions(year),
  team_id       uuid not null,
  pick_semi1    uuid not null,
  pick_semi2    uuid not null,
  pick_champion uuid not null,
  display_name  text check (length(display_name) between 1 and 40),
  phone         text not null check (phone ~ '^\+234(70|80|81|90|91)[0-9]{8}$'),
  cheer         text check (length(cheer) between 1 and 80),
  -- Governs the name and the cheer together: a held or hidden supporter shows
  -- as anonymous everywhere public.
  public_status text not null default 'visible' check (public_status in ('visible', 'held', 'hidden')),
  created_at    timestamptz not null default now(),
  unique (edition_year, phone),
  foreign key (team_id, edition_year)       references public.finale_teams (id, edition_year),
  foreign key (pick_semi1, edition_year)    references public.finale_teams (id, edition_year),
  foreign key (pick_semi2, edition_year)    references public.finale_teams (id, edition_year),
  foreign key (pick_champion, edition_year) references public.finale_teams (id, edition_year),
  check (pick_champion in (pick_semi1, pick_semi2))
);
create index if not exists finale_supporters_team_idx
  on public.finale_supporters (team_id, created_at desc);

-- ── Tallies ─────────────────────────────────────────────────────────────────
-- Counted in SQL: a PostgREST select stops at the max-rows setting, so counting
-- rows in TS would silently under-report. Service role only.
create or replace function public.finale_tally(p_year int)
returns table (team_id uuid, supporters bigint, champion_picks bigint)
language sql
stable
set search_path = public
as $$
  select t.id,
         (select count(*) from finale_supporters s where s.team_id = t.id),
         (select count(*) from finale_supporters s where s.pick_champion = t.id)
    from finale_teams t
   where t.edition_year = p_year;
$$;

-- Score mirrors bracketScore() in src/lib/finale.ts: 1 per semi-final, 2 for the
-- champion. Ties go to whoever joined first. Returns the top p_limit plus, when
-- given, the caller's own row.
create or replace function public.finale_leaders(p_year int, p_limit int, p_supporter uuid default null)
returns table (supporter_id uuid, display_name text, team_id uuid, score int, rank bigint, total bigint)
language sql
stable
set search_path = public
as $$
  with r as (
    select semi1_winner_id, semi2_winner_id, champion_team_id
      from finale_settings where edition_year = p_year
  ), scored as (
    select s.id, s.team_id, s.created_at,
           case when s.public_status = 'visible' then s.display_name end as display_name,
           coalesce((s.pick_semi1 = r.semi1_winner_id)::int, 0)
         + coalesce((s.pick_semi2 = r.semi2_winner_id)::int, 0)
         + 2 * coalesce((s.pick_champion = r.champion_team_id)::int, 0) as score
      from finale_supporters s cross join r
     where s.edition_year = p_year
  ), ranked as (
    select *, row_number() over (order by score desc, created_at, id) as rank,
           count(*) over () as total
      from scored
  )
  select id, display_name, team_id, score, rank, total
    from ranked
   where rank <= p_limit or id = p_supporter
   order by rank;
$$;

revoke all on function public.finale_tally(int) from public, anon, authenticated;
revoke all on function public.finale_leaders(int, int, uuid) from public, anon, authenticated;
grant execute on function public.finale_tally(int) to service_role;
grant execute on function public.finale_leaders(int, int, uuid) to service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- The public pages write only on the service role, from server actions that
-- validate first. Admins read with participants view; settings, teams and
-- moderation need participants manage.
alter table public.finale_teams      enable row level security;
alter table public.finale_settings   enable row level security;
alter table public.finale_supporters enable row level security;

revoke all on public.finale_teams, public.finale_settings, public.finale_supporters from anon;

drop policy if exists finale_teams_read       on public.finale_teams;
drop policy if exists finale_teams_write      on public.finale_teams;
drop policy if exists finale_settings_read    on public.finale_settings;
drop policy if exists finale_settings_write   on public.finale_settings;
drop policy if exists finale_supporters_read  on public.finale_supporters;
drop policy if exists finale_supporters_moderate on public.finale_supporters;

create policy finale_teams_read on public.finale_teams for select
  using (public.has_module_view('participants'));
create policy finale_teams_write on public.finale_teams for all
  using (public.has_module_manage('participants'))
  with check (public.has_module_manage('participants'));

create policy finale_settings_read on public.finale_settings for select
  using (public.has_module_view('participants'));
create policy finale_settings_write on public.finale_settings for all
  using (public.has_module_manage('participants'))
  with check (public.has_module_manage('participants'));

create policy finale_supporters_read on public.finale_supporters for select
  using (public.has_module_view('participants'));
create policy finale_supporters_moderate on public.finale_supporters for update
  using (public.has_module_manage('participants'))
  with check (public.has_module_manage('participants'));

-- Moderation may change public_status and nothing else.
revoke update on public.finale_supporters from authenticated;
grant update (public_status) on public.finale_supporters to authenticated;
