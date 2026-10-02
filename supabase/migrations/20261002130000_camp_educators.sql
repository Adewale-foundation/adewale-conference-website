-- A school can send more than one accompanying adult. The response now lists
-- the educators on record (going or not) plus up to 5 extras, replacing the
-- single teacher_name / teacher_phone pair, which is no longer written.
-- Idempotent.

alter table public.camp_confirmations
  add column if not exists educators jsonb not null default '[]'::jsonb;
alter table public.camp_confirmations drop constraint if exists camp_confirmations_educators_check;
alter table public.camp_confirmations add constraint camp_confirmations_educators_check
  check (jsonb_typeof(educators) = 'array');

update public.camp_confirmations
set educators = jsonb_build_array(jsonb_build_object(
      'name', teacher_name, 'phone', teacher_phone, 'email', null, 'role', 'teacher', 'going', true))
where educators = '[]'::jsonb and teacher_name is not null;

drop function if exists public.submit_camp_response(uuid, text, text, text, boolean, text, text);

-- Rules mirror validateCampResponse / campWindow in src/lib/camp.ts.
create or replace function public.submit_camp_response(
  p_registration_id uuid,
  p_status          text,
  p_educators       jsonb,
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
  v_educators jsonb := coalesce(p_educators, '[]'::jsonb);
begin
  if not public.is_my_registration(p_registration_id) then
    raise exception 'This registration is not linked to your account.';
  end if;
  if not public.camp_eligible(p_registration_id) then
    raise exception 'Only schools invited to camp can respond.';
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
    if jsonb_typeof(v_educators) <> 'array' or jsonb_array_length(v_educators) > 20 then
      raise exception 'The list of educators is not valid.';
    end if;
    if (select count(*) from jsonb_array_elements(v_educators) e where e->>'role' = 'extra') > 5 then
      raise exception 'Add at most 5 additional teachers.';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(v_educators) e where (e->>'going')::boolean
    ) then
      raise exception 'Choose at least one educator who will accompany your students.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_educators) e
      where (e->>'going')::boolean
        and (btrim(coalesce(e->>'name', '')) = '' or btrim(coalesce(e->>'phone', '')) = '')
    ) then
      raise exception 'Enter a name and phone number for every educator who is going.';
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
    registration_id, school_id, edition_year, status, educators, teacher_name, teacher_phone,
    reps_confirmed, notes, decline_reason, terms_accepted_at, responded_by, responded_at,
    updated_by, updated_at
  ) values (
    p_registration_id, v_school, v_year, p_status,
    case when p_status = 'attending' then v_educators else '[]'::jsonb end,
    null, null,
    p_status = 'attending' and p_reps_confirmed,
    nullif(btrim(coalesce(p_notes, '')), ''),
    case when p_status = 'not_attending' then btrim(p_decline_reason) end,
    case when p_status = 'attending' then now() end,
    auth.uid(), now(), auth.uid(), now()
  )
  on conflict (registration_id) do update set
    status            = excluded.status,
    educators         = excluded.educators,
    teacher_name      = null,
    teacher_phone     = null,
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
revoke all on function public.submit_camp_response(uuid, text, jsonb, boolean, text, text)
  from public, anon;
grant execute on function public.submit_camp_response(uuid, text, jsonb, boolean, text, text)
  to authenticated;
