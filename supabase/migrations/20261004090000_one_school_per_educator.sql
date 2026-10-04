-- An educator belongs to one school, like a student. The Airtable sync's bulk
-- import (2026-07-28) added every past edition's contacts as members, so a
-- teacher who had moved still belonged to their old school, and the portal —
-- which shows "the newest registration I can see" — opened the wrong one. One
-- camp answer was filed against the wrong school that way. Idempotent.

-- ── Cleanup ───────────────────────────────────────────────────────────────
-- The misfiled camp answer, only while it is still the one that educator sent.
delete from public.camp_confirmations
where id = '074874a4-bbef-4840-962f-3d33b460cb95'
  and responded_by = '29dbc495-837f-47d4-9418-d3220070782a';

-- Stale memberships from that import: each is at a school whose 2026 entry
-- doesn't name the email, while another school's 2026 entry does.
delete from public.school_members
where id in (
  'a58707bf-4888-44bd-b401-2e5822b93a64',
  '2aa00724-a698-4183-b550-e736b7f27947',
  '86096185-825b-48e5-ae6b-bed9ae459e46',
  '3dc874f6-61c2-49dc-a589-df260f013e37',
  '8747aa24-48c1-485e-b70f-25a87cbe3111',
  'a0de5ddb-37c1-4703-a66e-b42ae74fbd47'
)
  and created_at::date = '2026-07-28';

-- ── The rule ──────────────────────────────────────────────────────────────
-- Checked only when a row becomes approved or moves school/email, so the few
-- conflicts still awaiting an admin (listed on Admin → Schools) keep working
-- when unrelated fields change, e.g. profile_id at sign-in.
create or replace function public.enforce_one_school_per_educator()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_other text;
begin
  if new.status is distinct from 'approved' then return new; end if;
  if tg_op = 'UPDATE'
     and old.status = 'approved'
     and old.school_id = new.school_id
     and lower(old.email) = lower(new.email) then
    return new;
  end if;

  select s.name into v_other
  from public.school_members sm
  join public.schools s on s.id = sm.school_id
  where sm.status = 'approved'
    and sm.school_id <> new.school_id
    and (lower(sm.email) = lower(new.email)
         or (new.profile_id is not null and sm.profile_id = new.profile_id))
  limit 1;

  if v_other is not null then
    raise exception 'This email is already linked to %. An educator can belong to one school only.', v_other
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_one_school_per_educator() from public, anon, authenticated;

drop trigger if exists school_members_one_school on public.school_members;
create trigger school_members_one_school
  before insert or update on public.school_members
  for each row execute function public.enforce_one_school_per_educator();
