-- ASC Camp: per-edition camp details, and each qualified school's answer to the
-- invitation. Schools never write the table directly — submit_camp_response
-- enforces eligibility and the deadline. Idempotent.

create table if not exists public.camp_settings (
  edition_year     int primary key references public.editions(year) on delete cascade,
  title            text not null default 'ASC Camp',
  venue            text,
  arrival_at       timestamptz,
  departure_at     timestamptz,
  confirm_deadline timestamptz,
  whatsapp_url     text,
  is_open          boolean not null default true,
  updated_by       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

-- 'pending' is a row an admin opened (e.g. a respond_by for a replacement)
-- before the school answered. 'released' is admin-only: the spot was reassigned.
create table if not exists public.camp_confirmations (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null unique references public.registrations on delete cascade,
  school_id         uuid not null references public.schools on delete cascade,
  edition_year      int not null,
  status            text not null default 'pending'
                      check (status in ('pending', 'attending', 'not_attending', 'released')),
  teacher_name      text,
  teacher_phone     text,
  reps_confirmed    boolean not null default false,
  notes             text,
  decline_reason    text,
  terms_accepted_at timestamptz,
  respond_by        timestamptz,
  admin_note        text,
  responded_by      uuid references public.profiles(id) on delete set null,
  responded_at      timestamptz,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists camp_confirmations_edition_idx
  on public.camp_confirmations (edition_year, status);
create index if not exists camp_confirmations_school_idx
  on public.camp_confirmations (school_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Settings are admin-only so the WhatsApp link never reaches a school that
-- hasn't confirmed; schools read them through my_camp_details().
alter table public.camp_settings enable row level security;
drop policy if exists camp_settings_admin_read  on public.camp_settings;
drop policy if exists camp_settings_admin_write on public.camp_settings;
create policy camp_settings_admin_read on public.camp_settings for select
  using (public.has_module_view('participants'));
create policy camp_settings_admin_write on public.camp_settings for all
  using (public.has_module_manage('participants'))
  with check (public.has_module_manage('participants'));

alter table public.camp_confirmations enable row level security;
drop policy if exists camp_conf_read        on public.camp_confirmations;
drop policy if exists camp_conf_admin_write on public.camp_confirmations;
create policy camp_conf_read on public.camp_confirmations for select using (
  public.has_module_view('participants') or school_id in (select public.my_school_ids())
);
create policy camp_conf_admin_write on public.camp_confirmations for all
  using (public.has_module_manage('participants'))
  with check (public.has_module_manage('participants'));

-- ── Eligibility ───────────────────────────────────────────────────────────
-- Internal helpers for the RPCs below: not granted, so they aren't reachable at
-- /rest/v1/rpc. camp_eligible mirrors tierRank(...) >= 2 in src/lib/resource-access.ts.
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
  );
$$;
revoke all on function public.camp_eligible(uuid) from public, anon, authenticated;

create or replace function public.is_my_registration(p_registration_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.registrations r
    where r.id = p_registration_id
      and (r.owner_id = auth.uid() or r.school_id in (select public.my_school_ids()))
  );
$$;
revoke all on function public.is_my_registration(uuid) from public, anon, authenticated;

-- ── School-facing RPCs ────────────────────────────────────────────────────
create or replace function public.my_camp_details(p_registration_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_year int;
  v_settings public.camp_settings;
  v_conf public.camp_confirmations;
begin
  if not public.is_my_registration(p_registration_id) then return null; end if;
  if not public.camp_eligible(p_registration_id) then return null; end if;

  select edition_year into v_year from public.registrations where id = p_registration_id;
  select * into v_settings from public.camp_settings where edition_year = v_year;
  if v_settings.edition_year is null then return null; end if;
  select * into v_conf from public.camp_confirmations where registration_id = p_registration_id;

  return jsonb_build_object(
    'settings', jsonb_build_object(
      'edition_year', v_settings.edition_year,
      'title', v_settings.title,
      'venue', v_settings.venue,
      'arrival_at', v_settings.arrival_at,
      'departure_at', v_settings.departure_at,
      'confirm_deadline', v_settings.confirm_deadline,
      'is_open', v_settings.is_open,
      'whatsapp_url', case when v_conf.status = 'attending' then v_settings.whatsapp_url end
    ),
    'confirmation', case when v_conf.id is null then null else to_jsonb(v_conf) end
  );
end;
$$;
revoke all on function public.my_camp_details(uuid) from public, anon;
grant execute on function public.my_camp_details(uuid) to authenticated;

-- Rules mirror validateCampResponse / campWindow in src/lib/camp.ts.
create or replace function public.submit_camp_response(
  p_registration_id uuid,
  p_status          text,
  p_teacher_name    text,
  p_teacher_phone   text,
  p_reps_confirmed  boolean,
  p_notes           text,
  p_decline_reason  text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_year   int;
  v_settings public.camp_settings;
  v_conf public.camp_confirmations;
begin
  if not public.is_my_registration(p_registration_id) then
    raise exception 'This registration is not linked to your account.';
  end if;
  if not public.camp_eligible(p_registration_id) then
    raise exception 'Only qualified schools can respond to the camp invitation.';
  end if;

  select school_id, edition_year into v_school, v_year
  from public.registrations where id = p_registration_id;
  select * into v_settings from public.camp_settings where edition_year = v_year;
  if v_settings.edition_year is null or not v_settings.is_open then
    raise exception 'Camp confirmations are closed.';
  end if;

  select * into v_conf from public.camp_confirmations where registration_id = p_registration_id;
  if v_conf.status = 'released' then
    raise exception 'Your camp place has been released. Contact the Planning Committee.';
  end if;
  if coalesce(v_conf.respond_by, v_settings.confirm_deadline) is not null
     and now() > coalesce(v_conf.respond_by, v_settings.confirm_deadline) then
    raise exception 'The confirmation deadline has passed. Contact the Planning Committee.';
  end if;

  if p_status = 'attending' then
    if btrim(coalesce(p_teacher_name, '')) = '' or btrim(coalesce(p_teacher_phone, '')) = '' then
      raise exception 'Enter the accompanying teacher''s name and phone number.';
    end if;
    if not coalesce(p_reps_confirmed, false) then
      raise exception 'Confirm that your three registered contestants will attend.';
    end if;
  elsif p_status = 'not_attending' then
    if btrim(coalesce(p_decline_reason, '')) = '' then
      raise exception 'Tell us why your school cannot attend.';
    end if;
  else
    raise exception 'Choose whether your school is attending.';
  end if;

  insert into public.camp_confirmations as c (
    registration_id, school_id, edition_year, status, teacher_name, teacher_phone,
    reps_confirmed, notes, decline_reason, terms_accepted_at, responded_by, responded_at,
    updated_by, updated_at
  ) values (
    p_registration_id, v_school, v_year, p_status,
    case when p_status = 'attending' then btrim(p_teacher_name) end,
    case when p_status = 'attending' then btrim(p_teacher_phone) end,
    p_status = 'attending' and p_reps_confirmed,
    nullif(btrim(coalesce(p_notes, '')), ''),
    case when p_status = 'not_attending' then btrim(p_decline_reason) end,
    case when p_status = 'attending' then now() end,
    auth.uid(), now(), auth.uid(), now()
  )
  on conflict (registration_id) do update set
    status            = excluded.status,
    teacher_name      = excluded.teacher_name,
    teacher_phone     = excluded.teacher_phone,
    reps_confirmed    = excluded.reps_confirmed,
    notes             = excluded.notes,
    decline_reason    = excluded.decline_reason,
    terms_accepted_at = excluded.terms_accepted_at,
    responded_by      = excluded.responded_by,
    responded_at      = excluded.responded_at,
    updated_by        = excluded.updated_by,
    updated_at        = excluded.updated_at;
end;
$$;
revoke all on function public.submit_camp_response(uuid, text, text, text, boolean, text, text)
  from public, anon;
grant execute on function public.submit_camp_response(uuid, text, text, text, boolean, text, text)
  to authenticated;

-- Resource gate for "camp" material. Covers both memberships: a code-login
-- student is linked by students.auth_user_id, not school_members.
create or replace function public.my_camp_attending()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  with mine as (
    select school_id from public.students
      where auth_user_id = auth.uid() and school_id is not null and deactivated_at is null
    union
    select school_id from public.registrations where owner_id = auth.uid()
    union
    select sid from public.my_school_ids() sid
  ), latest as (
    select distinct on (r.school_id) r.id
    from public.registrations r
    where r.school_id in (select school_id from mine)
    order by r.school_id, r.edition_year desc
  )
  select exists (
    select 1 from public.camp_confirmations c
    where c.registration_id in (select id from latest) and c.status = 'attending'
  );
$$;
revoke all on function public.my_camp_attending() from public, anon;
grant execute on function public.my_camp_attending() to authenticated;

-- ── Resources: camp-attendee access ──────────────────────────────────────
alter table public.resources drop constraint if exists resources_access_check;
alter table public.resources add constraint resources_access_check
  check (access in ('public', 'accepted', 'qualified', 'finalist', 'camp'));

-- ── 2026 camp ─────────────────────────────────────────────────────────────
insert into public.camp_settings
  (edition_year, title, venue, arrival_at, departure_at, confirm_deadline, is_open)
select 2026, 'ASC Camp 2026',
       'NYSC Permanent Orientation Camp, Gateway Stadium, Sagamu, Ogun State',
       '2026-10-26 14:00+01', '2026-10-28 15:00+01', '2026-10-07 23:59:59+01', true
where exists (select 1 from public.editions where year = 2026)
on conflict (edition_year) do nothing;
