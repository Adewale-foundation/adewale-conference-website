-- Grand Finale school invitations: every school this edition accepts in its
-- portal and says which educators and students are coming. One row per school
-- (source = 'school'), filling a seat reserve kept apart from the public pool.

alter table public.finale_settings add column if not exists school_invite_open boolean not null default false;
-- Null means no cap on the school reserve.
alter table public.finale_settings add column if not exists school_capacity int check (school_capacity > 0);
alter table public.finale_settings add column if not exists school_respond_by timestamptz;

alter table public.finale_attendees add column if not exists school_id uuid references public.schools on delete set null;
alter table public.finale_attendees add column if not exists registration_id uuid references public.registrations on delete set null;
alter table public.finale_attendees add column if not exists educators jsonb;
alter table public.finale_attendees add column if not exists educator_count int not null default 1 check (educator_count between 1 and 20);

-- seats used to be 1 + student_count; a school group brings several educators.
do $$
begin
  if coalesce((select generation_expression from information_schema.columns
                where table_schema = 'public' and table_name = 'finale_attendees' and column_name = 'seats'), '')
     not like '%educator_count%' then
    alter table public.finale_attendees drop column if exists seats;
    alter table public.finale_attendees add column seats int generated always as (educator_count + student_count) stored;
  end if;
end $$;

-- A school's row is keyed by the school, not the email of whoever answered,
-- so a teacher may hold both a public ticket and their school's.
drop index if exists public.finale_attendees_email_idx;
create unique index if not exists finale_attendees_email_idx
  on public.finale_attendees (edition_year, lower(email)) where source <> 'school';
create unique index if not exists finale_attendees_school_idx
  on public.finale_attendees (edition_year, school_id) where source = 'school';

alter table public.finale_attendee_students
  add column if not exists student_id uuid references public.students on delete set null;

create or replace function public.finale_new_ref_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_ref text;
begin
  loop
    v_ref := 'GF-' || (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
                         from generate_series(1, 6));
    exit when not exists (select 1 from finale_attendees a where a.ref_code = v_ref);
  end loop;
  return v_ref;
end;
$$;

-- Now counts only the public pool (open + invited); schools have their own reserve.
create or replace function public.finale_attend_register(
  p_year int, p_first text, p_last text, p_email text, p_phone text, p_role text,
  p_organisation text, p_lga text, p_student_count int, p_students jsonb,
  p_source text, p_invited_by uuid, p_force boolean
)
returns table (id uuid, ref_code text, status text, seats int, existing boolean)
language plpgsql
set search_path = public
as $$
declare
  v_capacity int;
  v_taken    int;
  v_status   text;
  v_ref      text;
  v_id       uuid;
begin
  if p_source = 'school' then
    raise exception 'school groups respond through finale_school_respond';
  end if;
  select s.attend_capacity into v_capacity
    from finale_settings s where s.edition_year = p_year for update;

  return query
    select a.id, a.ref_code, a.status, a.seats, true
      from finale_attendees a
     where a.edition_year = p_year and a.source <> 'school' and lower(a.email) = lower(p_email);
  if found then return; end if;

  select coalesce(sum(a.seats), 0) into v_taken
    from finale_attendees a
   where a.edition_year = p_year and a.source <> 'school' and a.status = 'confirmed';
  v_status := case
    when p_force or v_capacity is null or v_taken + 1 + p_student_count <= v_capacity then 'confirmed'
    else 'waitlisted' end;
  v_ref := finale_new_ref_code();

  insert into finale_attendees (edition_year, ref_code, first_name, last_name, email, phone, role,
                                organisation, lga, student_count, source, invited_by, status)
  values (p_year, v_ref, p_first, p_last, lower(p_email), p_phone, p_role,
          p_organisation, p_lga, p_student_count, p_source, p_invited_by, v_status)
  returning finale_attendees.id into v_id;

  insert into finale_attendee_students (attendee_id, full_name, class, sort)
  select v_id, s.value ->> 'name', nullif(s.value ->> 'class', ''), s.ordinality::int
    from jsonb_array_elements(coalesce(p_students, '[]'::jsonb)) with ordinality s;

  return query select v_id, v_ref, v_status, 1 + p_student_count, false;
end;
$$;

-- One response per school, editable. A new or waitlisted school is confirmed
-- while its whole group fits the reserve; a confirmed school that grows past it
-- is refused rather than losing the seats it holds. Mirrors schoolSeatDecision()
-- in src/lib/finale-attend.ts. Membership is checked by the caller.
create or replace function public.finale_school_respond(
  p_year int, p_school_id uuid, p_registration_id uuid, p_organisation text, p_lga text,
  p_first text, p_last text, p_email text, p_phone text,
  p_educators jsonb, p_student_count int, p_students jsonb, p_attending boolean
)
returns table (id uuid, ref_code text, status text, seats int)
language plpgsql
set search_path = public
as $$
declare
  v_capacity int;
  v_taken    int;
  v_existing finale_attendees%rowtype;
  v_edu      int := greatest(1, jsonb_array_length(coalesce(p_educators, '[]'::jsonb)));
  v_seats    int := greatest(1, jsonb_array_length(coalesce(p_educators, '[]'::jsonb))) + p_student_count;
  v_status   text;
  v_id       uuid;
  v_ref      text;
begin
  select s.school_capacity into v_capacity
    from finale_settings s where s.edition_year = p_year for update;
  select a.* into v_existing
    from finale_attendees a
   where a.edition_year = p_year and a.school_id = p_school_id and a.source = 'school';

  if not p_attending then
    if v_existing.id is null then return; end if;
    update finale_attendees a set status = 'cancelled' where a.id = v_existing.id;
    return query select v_existing.id, v_existing.ref_code, 'cancelled'::text, v_existing.seats;
    return;
  end if;

  select coalesce(sum(a.seats), 0) into v_taken
    from finale_attendees a
   where a.edition_year = p_year and a.source = 'school' and a.status = 'confirmed'
     and a.id is distinct from v_existing.id;
  if v_capacity is null or v_taken + v_seats <= v_capacity then
    v_status := 'confirmed';
  elsif v_existing.status = 'confirmed' then
    raise exception 'finale_school_full:%', greatest(0, v_capacity - v_taken);
  else
    v_status := 'waitlisted';
  end if;

  if v_existing.id is null then
    v_ref := finale_new_ref_code();
    insert into finale_attendees (edition_year, ref_code, first_name, last_name, email, phone, role, organisation, lga,
                                  student_count, educators, educator_count, source, school_id, registration_id, status)
    values (p_year, v_ref, p_first, p_last, lower(p_email), p_phone, 'teacher', p_organisation, p_lga,
            p_student_count, p_educators, v_edu, 'school', p_school_id, p_registration_id, v_status)
    returning finale_attendees.id into v_id;
  else
    v_id := v_existing.id;
    v_ref := v_existing.ref_code;
    update finale_attendees a
       set first_name = p_first, last_name = p_last, email = lower(p_email), phone = p_phone,
           organisation = p_organisation, lga = p_lga, student_count = p_student_count,
           educators = p_educators, educator_count = v_edu, registration_id = p_registration_id, status = v_status
     where a.id = v_id;
    delete from finale_attendee_students s where s.attendee_id = v_id;
  end if;

  insert into finale_attendee_students (attendee_id, full_name, class, student_id, sort)
  select v_id, s.value ->> 'name', nullif(s.value ->> 'class', ''), nullif(s.value ->> 'studentId', '')::uuid, s.ordinality::int
    from jsonb_array_elements(coalesce(p_students, '[]'::jsonb)) with ordinality s;

  return query select v_id, v_ref, v_status, v_seats;
end;
$$;

-- The return type changed, so it is dropped rather than replaced.
drop function if exists public.finale_attend_taken(int);
create function public.finale_attend_taken(p_year int)
returns table (public_confirmed bigint, school_confirmed bigint, waitlisted bigint, checked_in bigint)
language sql
stable
set search_path = public
as $$
  select coalesce(sum(seats) filter (where status = 'confirmed' and source <> 'school'), 0),
         coalesce(sum(seats) filter (where status = 'confirmed' and source = 'school'), 0),
         coalesce(sum(seats) filter (where status = 'waitlisted'), 0),
         coalesce(sum(seats) filter (where status = 'confirmed' and checked_in_at is not null), 0)
    from finale_attendees where edition_year = p_year;
$$;

revoke all on function public.finale_new_ref_code() from public, anon, authenticated;
revoke all on function public.finale_attend_taken(int) from public, anon, authenticated;
revoke all on function public.finale_school_respond(int, uuid, uuid, text, text, text, text, text, text, jsonb, int, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.finale_new_ref_code() to service_role;
grant execute on function public.finale_attend_taken(int) to service_role;
grant execute on function public.finale_school_respond(int, uuid, uuid, text, text, text, text, text, text, jsonb, int, jsonb, boolean)
  to service_role;
