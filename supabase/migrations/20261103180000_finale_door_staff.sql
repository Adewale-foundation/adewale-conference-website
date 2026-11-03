-- Grand Finale door staff: the finale is one more venue in exam_centres, so
-- staff are centre_leads and sign in at /attendance exactly as zonal and camp
-- staff do (ADR-0011). Zonal code reads kind = 'exam' only.

alter table public.exam_centres drop constraint if exists exam_centres_kind_check;
alter table public.exam_centres add constraint exam_centres_kind_check
  check (kind in ('exam', 'camp', 'finale'));
create unique index if not exists exam_centres_one_finale
  on public.exam_centres (edition_year) where kind = 'finale';

insert into public.exam_centres (edition_year, name, town, legacy_zone, kind)
select 2026, 'Grand Finale', 'Kuto, Abeokuta', null, 'finale'
where exists (select 1 from public.editions where year = 2026)
on conflict do nothing;

-- Staff can sign in only while this is on.
alter table public.finale_settings add column if not exists door_open boolean not null default false;

alter table public.finale_attendees
  add column if not exists checked_in_by_lead uuid references public.centre_leads on delete set null;
alter table public.finale_attendees
  add column if not exists checked_in_by_profile uuid references public.profiles(id) on delete set null;
