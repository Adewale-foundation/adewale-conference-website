-- Camp attendance: a daily register of the contestants and educators at camp,
-- marked by helpers an admin registers, through the same no-account sign-in as
-- the zonal centres (ADR-0011). Idempotent.

-- The camp is one more venue staff sign in to, so centre_leads and the session
-- cookie carry over unchanged. Zonal code reads kind = 'exam' only.
alter table public.exam_centres
  add column if not exists kind text not null default 'exam';
alter table public.exam_centres drop constraint if exists exam_centres_kind_check;
alter table public.exam_centres add constraint exam_centres_kind_check
  check (kind in ('exam', 'camp'));
create unique index if not exists exam_centres_one_camp
  on public.exam_centres (edition_year) where kind = 'camp';

insert into public.exam_centres (edition_year, name, town, legacy_zone, kind)
select 2026, 'ASC Camp', 'Sagamu', null, 'camp'
where exists (select 1 from public.editions where year = 2026)
on conflict do nothing;

-- The camp's own off switch, separate from paper_exams.attendance_open.
alter table public.camp_settings
  add column if not exists attendance_open boolean not null default false;
create unique index if not exists camp_settings_one_attendance_open
  on public.camp_settings ((true)) where attendance_open;

-- One row per person per camp day. Educators exist only inside
-- camp_confirmations.educators, so a person is a key rather than an FK:
-- 'student:<students.id>' or 'educator:<registration id>:primary|second'.
-- person_name is a snapshot, because the school can rewrite that JSON.
create table if not exists public.camp_attendance (
  id                uuid primary key default gen_random_uuid(),
  edition_year      int  not null references public.editions(year),
  camp_day          date not null,
  person_key        text not null check (person_key ~ '^(student:[0-9a-f-]{36}|educator:[0-9a-f-]{36}:(primary|second))$'),
  registration_id   uuid not null references public.registrations on delete cascade,
  student_id        uuid references public.students on delete cascade,
  person_name       text not null,
  status            text not null check (status in ('present','absent')),
  marked_by_lead    uuid references public.centre_leads on delete set null,
  marked_by_profile uuid references public.profiles(id) on delete set null,
  marked_at         timestamptz not null default now(),
  unique (edition_year, camp_day, person_key),
  -- `<= 1` for the reason given on paper_exam_attendance_one_marker.
  constraint camp_attendance_one_marker
    check (num_nonnulls(marked_by_lead, marked_by_profile) <= 1)
);
create index if not exists camp_attendance_day_idx
  on public.camp_attendance (edition_year, camp_day);

-- Append-only, as paper_exam_attendance_events: the row above is only the latest mark.
create table if not exists public.camp_attendance_events (
  id                uuid primary key default gen_random_uuid(),
  edition_year      int  not null references public.editions(year),
  camp_day          date not null,
  person_key        text not null,
  registration_id   uuid not null references public.registrations on delete cascade,
  student_id        uuid references public.students on delete cascade,
  person_name       text not null,
  status            text not null check (status in ('present','absent')),
  marked_by_lead    uuid references public.centre_leads on delete set null,
  marked_by_profile uuid references public.profiles(id) on delete set null,
  at                timestamptz not null default now()
);
create index if not exists camp_attendance_events_day_idx
  on public.camp_attendance_events (edition_year, camp_day, at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Read-only to admins. Every write runs on the service role, from the staff
-- pages or an admin correction behind requireManage, as the zonal register does.
alter table public.camp_attendance        enable row level security;
alter table public.camp_attendance_events enable row level security;

drop policy if exists camp_attendance_read        on public.camp_attendance;
drop policy if exists camp_attendance_write       on public.camp_attendance;
drop policy if exists camp_attendance_events_read   on public.camp_attendance_events;
drop policy if exists camp_attendance_events_insert on public.camp_attendance_events;
create policy camp_attendance_read on public.camp_attendance for select
  using (public.has_module_view('participants'));
create policy camp_attendance_events_read on public.camp_attendance_events for select
  using (public.has_module_view('participants'));
