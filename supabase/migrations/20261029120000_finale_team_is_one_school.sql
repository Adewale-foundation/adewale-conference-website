-- A finalist is one school, not a pair: the team row points at its registration,
-- and the free-text schools column goes. Idempotent.
alter table public.finale_teams
  add column if not exists registration_id uuid references public.registrations on delete restrict;
create unique index if not exists finale_teams_one_per_school
  on public.finale_teams (edition_year, registration_id) where registration_id is not null;
alter table public.finale_teams drop column if exists schools;
