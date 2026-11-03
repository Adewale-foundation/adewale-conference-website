-- Grand Finale attendance: open registration, admin invites and competing-school
-- delegations, all in one list. Same access model as the fan vote (ADR 0015):
-- no anon access; public pages write through the service role after validating.

alter table public.finale_settings add column if not exists attend_open boolean not null default false;
-- Null means no cap.
alter table public.finale_settings add column if not exists attend_capacity int check (attend_capacity > 0);

create table if not exists public.finale_attendees (
  id            uuid primary key default gen_random_uuid(),
  edition_year  int  not null references public.editions(year),
  ref_code      text not null unique check (ref_code ~ '^GF-[A-HJ-NP-Z2-9]{6}$'),
  first_name    text not null check (length(first_name) between 1 and 60),
  last_name     text not null check (length(last_name) between 1 and 60),
  email         text not null check (length(email) between 3 and 200),
  phone         text check (phone ~ '^\+234(70|80|81|90|91)[0-9]{8}$'),
  role          text not null check (role in ('teacher', 'proprietor', 'student', 'undergraduate', 'parent', 'other')),
  organisation  text check (length(organisation) <= 120),
  lga           text check (length(lga) <= 60),
  student_count int  not null default 0 check (student_count between 0 and 200),
  seats         int  generated always as (1 + student_count) stored,
  source        text not null default 'open' check (source in ('open', 'invited', 'school')),
  invited_by    uuid references public.profiles(id) on delete set null,
  status        text not null check (status in ('confirmed', 'waitlisted', 'cancelled')),
  checked_in_at timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists finale_attendees_email_idx
  on public.finale_attendees (edition_year, lower(email));
create index if not exists finale_attendees_list_idx
  on public.finale_attendees (edition_year, created_at desc);

create table if not exists public.finale_attendee_students (
  id          uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.finale_attendees on delete cascade,
  full_name   text not null check (length(full_name) between 1 and 80),
  class       text check (length(class) <= 20),
  sort        int  not null default 0
);
create index if not exists finale_attendee_students_attendee_idx
  on public.finale_attendee_students (attendee_id, sort);

-- Registers one attendee, or returns the existing row for that email. The
-- settings row is locked so two sign-ups cannot both take the last seats.
-- The seat rule mirrors seatDecision() in src/lib/finale-attend.ts: a group
-- that does not fit waits as a whole.
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
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select s.attend_capacity into v_capacity
    from finale_settings s where s.edition_year = p_year for update;

  return query
    select a.id, a.ref_code, a.status, a.seats, true
      from finale_attendees a
     where a.edition_year = p_year and lower(a.email) = lower(p_email);
  if found then return; end if;

  select coalesce(sum(a.seats), 0) into v_taken
    from finale_attendees a where a.edition_year = p_year and a.status = 'confirmed';
  v_status := case
    when p_force or v_capacity is null or v_taken + 1 + p_student_count <= v_capacity then 'confirmed'
    else 'waitlisted' end;

  loop
    v_ref := 'GF-' || (select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
                         from generate_series(1, 6));
    exit when not exists (select 1 from finale_attendees a where a.ref_code = v_ref);
  end loop;

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

-- Summed in SQL: a PostgREST select stops at max-rows and would under-count.
create or replace function public.finale_attend_taken(p_year int)
returns table (confirmed bigint, waitlisted bigint, checked_in bigint)
language sql
stable
set search_path = public
as $$
  select coalesce(sum(seats) filter (where status = 'confirmed'), 0),
         coalesce(sum(seats) filter (where status = 'waitlisted'), 0),
         coalesce(sum(seats) filter (where status = 'confirmed' and checked_in_at is not null), 0)
    from finale_attendees where edition_year = p_year;
$$;

revoke all on function public.finale_attend_taken(int) from public, anon, authenticated;
grant execute on function public.finale_attend_taken(int) to service_role;

revoke all on function public.finale_attend_register(int, text, text, text, text, text, text, text, int, jsonb, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.finale_attend_register(int, text, text, text, text, text, text, text, int, jsonb, text, uuid, boolean)
  to service_role;

alter table public.finale_attendees         enable row level security;
alter table public.finale_attendee_students enable row level security;
revoke all on public.finale_attendees, public.finale_attendee_students from anon;

drop policy if exists finale_attendees_read          on public.finale_attendees;
drop policy if exists finale_attendees_write         on public.finale_attendees;
drop policy if exists finale_attendee_students_read  on public.finale_attendee_students;
drop policy if exists finale_attendee_students_write on public.finale_attendee_students;

create policy finale_attendees_read on public.finale_attendees for select
  using (public.has_module_view('participants'));
create policy finale_attendees_write on public.finale_attendees for all
  using (public.has_module_manage('participants'))
  with check (public.has_module_manage('participants'));
create policy finale_attendee_students_read on public.finale_attendee_students for select
  using (public.has_module_view('participants'));
create policy finale_attendee_students_write on public.finale_attendee_students for all
  using (public.has_module_manage('participants'))
  with check (public.has_module_manage('participants'));
