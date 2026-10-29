-- Team schools are now picked from the camp list as full names, and two of
-- those can pass 120 characters together. Idempotent.
alter table public.finale_teams drop constraint if exists finale_teams_schools_check;
alter table public.finale_teams add constraint finale_teams_schools_check
  check (length(schools) <= 240);
