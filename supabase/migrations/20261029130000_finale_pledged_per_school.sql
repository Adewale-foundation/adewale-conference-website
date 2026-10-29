-- Pledge totals are kept per school, typed in by an admin from the Paystack
-- dashboard; the fund's total is their sum, so the single overall figure goes.
-- Idempotent.
alter table public.finale_teams
  add column if not exists pledged int check (pledged between 0 and 1000000000);
alter table public.finale_settings drop column if exists fund_total;
