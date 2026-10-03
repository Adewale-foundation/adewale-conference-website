-- The camp budget covers one accompanying educator per school. A second is a
-- request an admin approves or declines; the place itself is secured either
-- way. Schools that confirmed several before this keep their first and have
-- the next turned into a pending request. Idempotent.

alter table public.camp_confirmations
  add column if not exists extra_educator   jsonb,
  add column if not exists extra_reason     text,
  add column if not exists extra_status     text,
  add column if not exists extra_decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists extra_decided_at timestamptz,
  add column if not exists extra_admin_note text;
alter table public.camp_confirmations drop constraint if exists camp_confirmations_extra_status_check;
alter table public.camp_confirmations add constraint camp_confirmations_extra_status_check
  check (extra_status in ('pending', 'approved', 'declined'));

-- Over-limit answers: first going stays, second becomes the pending request,
-- any more are marked not going. Once converted a row has one going, so a
-- re-run skips it.
with over as (
  select c.id
  from public.camp_confirmations c
  where c.status = 'attending'
    and (select count(*) from jsonb_array_elements(c.educators) e where (e->>'going')::boolean) > 1
), ranked as (
  select o.id, t.e, t.i,
         case when (t.e->>'going')::boolean
              then row_number() over (partition by o.id, (t.e->>'going')::boolean order by t.i) end as rn
  from over o
  join public.camp_confirmations c on c.id = o.id
  cross join lateral jsonb_array_elements(c.educators) with ordinality t(e, i)
)
update public.camp_confirmations c set
  extra_educator = (
    select jsonb_build_object('name', r.e->>'name', 'phone', r.e->>'phone', 'email', r.e->'email', 'role', r.e->>'role')
    from ranked r where r.id = c.id and r.rn = 2
  ),
  extra_reason = 'Submitted before the one-educator limit',
  extra_status = 'pending',
  educators = (
    select coalesce(jsonb_agg(
             case when r.rn > 1 then jsonb_set(r.e, '{going}', 'false'::jsonb) else r.e end
             order by r.i), '[]'::jsonb)
    from ranked r
    where r.id = c.id
      -- Extras live in extra_educator now; only a primary may be one.
      and not (r.e->>'role' = 'extra' and coalesce(r.rn, 0) <> 1)
  )
where c.id in (select id from over);

drop function if exists public.submit_camp_response(uuid, text, jsonb, boolean, text, text);

-- Rules mirror validateCampResponse / campWindow in src/lib/camp.ts.
create or replace function public.submit_camp_response(
  p_registration_id uuid,
  p_status          text,
  p_educators       jsonb,
  p_extra           jsonb,
  p_extra_reason    text,
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
  v_primary jsonb;
  v_extra jsonb := case when jsonb_typeof(p_extra) = 'object' then p_extra end;
  v_same_extra boolean;
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
    if (select count(*) from jsonb_array_elements(v_educators) e where (e->>'going')::boolean) <> 1 then
      raise exception 'Choose the one educator who will accompany your students.';
    end if;
    select e into v_primary from jsonb_array_elements(v_educators) e where (e->>'going')::boolean;
    if btrim(coalesce(v_primary->>'name', '')) = '' or btrim(coalesce(v_primary->>'phone', '')) = '' then
      raise exception 'Enter a name and phone number for the educator who is going.';
    end if;
    if v_extra is not null then
      if btrim(coalesce(v_extra->>'name', '')) = '' or btrim(coalesce(v_extra->>'phone', '')) = '' then
        raise exception 'Enter a name and phone number for the second educator.';
      end if;
      if btrim(coalesce(p_extra_reason, '')) = '' then
        raise exception 'Tell us why you need a second educator.';
      end if;
      if lower(btrim(v_extra->>'name')) = lower(btrim(v_primary->>'name'))
         or regexp_replace(v_extra->>'phone', '\D', '', 'g') = regexp_replace(v_primary->>'phone', '\D', '', 'g') then
        raise exception 'The second educator must be a different person.';
      end if;
    end if;
    if not coalesce(p_reps_confirmed, false) then
      raise exception 'Confirm that your three registered contestants will attend.';
    end if;
  elsif p_status = 'not_attending' then
    v_extra := null;
    if btrim(coalesce(p_decline_reason, '')) = '' then
      raise exception 'Tell us why your school cannot attend.';
    end if;
  else
    raise exception 'Choose whether your school is attending.';
  end if;

  -- Re-saving the same second educator keeps an approval or a decline; a new
  -- or changed one goes back to the admins.
  v_same_extra := v_extra is not null and v_conf.extra_educator is not null
    and lower(btrim(v_extra->>'name')) = lower(btrim(v_conf.extra_educator->>'name'))
    and regexp_replace(v_extra->>'phone', '\D', '', 'g') = regexp_replace(v_conf.extra_educator->>'phone', '\D', '', 'g');

  insert into public.camp_confirmations as c (
    registration_id, school_id, edition_year, status, educators,
    extra_educator, extra_reason, extra_status, extra_decided_by, extra_decided_at, extra_admin_note,
    reps_confirmed, notes, decline_reason, terms_accepted_at, responded_by, responded_at,
    updated_by, updated_at
  ) values (
    p_registration_id, v_school, v_year, p_status,
    case when p_status = 'attending' then v_educators else '[]'::jsonb end,
    v_extra,
    case when v_extra is not null then btrim(p_extra_reason) end,
    case when v_extra is not null then 'pending' end,
    null, null, null,
    p_status = 'attending' and p_reps_confirmed,
    nullif(btrim(coalesce(p_notes, '')), ''),
    case when p_status = 'not_attending' then btrim(p_decline_reason) end,
    case when p_status = 'attending' then now() end,
    auth.uid(), now(), auth.uid(), now()
  )
  on conflict (registration_id) do update set
    status            = excluded.status,
    educators         = excluded.educators,
    extra_educator    = excluded.extra_educator,
    extra_reason      = excluded.extra_reason,
    extra_status      = case when v_same_extra then c.extra_status else excluded.extra_status end,
    extra_decided_by  = case when v_same_extra then c.extra_decided_by end,
    extra_decided_at  = case when v_same_extra then c.extra_decided_at end,
    extra_admin_note  = case when v_same_extra then c.extra_admin_note end,
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
revoke all on function public.submit_camp_response(uuid, text, jsonb, jsonb, text, boolean, text, text)
  from public, anon;
grant execute on function public.submit_camp_response(uuid, text, jsonb, jsonb, text, boolean, text, text)
  to authenticated;
