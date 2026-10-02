-- Admins can invite a school to camp that didn't qualify (e.g. a replacement
-- outside the qualification list). The flag keeps it distinguishable from
-- qualified schools on the roster. Idempotent.

alter table public.camp_confirmations
  add column if not exists invited_manually boolean not null default false;

-- Qualified (mirrors tierRank(...) >= 2 in src/lib/resource-access.ts), or
-- added by an admin. Keep in step with isCampEligible in src/lib/camp.ts.
create or replace function public.camp_eligible(p_registration_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.registrations r
    join public.registration_stage_results sr on sr.registration_id = r.id
    where r.id = p_registration_id
      and r.status = 'verified'
      and sr.outcome = 'advanced'
      and sr.stage in ('Qualifications', 'Zonal Stage', 'Grand Finale Group Stage',
                       'Round of 24', 'Round of 16', 'Quarter Finals', 'Semi Finals', 'Finals')
  ) or exists (
    select 1 from public.camp_confirmations c
    where c.registration_id = p_registration_id and c.invited_manually
  );
$$;
revoke all on function public.camp_eligible(uuid) from public, anon, authenticated;

-- The registration owner may have no school_members row; let them read their
-- school's answer too (the portal nav checks it directly).
drop policy if exists camp_conf_read on public.camp_confirmations;
create policy camp_conf_read on public.camp_confirmations for select using (
  public.has_module_view('participants')
  or school_id in (select public.my_school_ids())
  or exists (
    select 1 from public.registrations r
    where r.id = camp_confirmations.registration_id and r.owner_id = auth.uid()
  )
);
