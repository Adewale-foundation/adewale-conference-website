-- Hand a retired rep's exam identity — number, sheet, score, attendance — to
-- the rep who replaced them, when the school filed the replacement after the
-- sitting because the incoming rep is the one who actually sat. Idempotent.
-- Called only from the replacement approval, and only when the reviewing admin
-- says so: see docs/adr/0013, which has the case where transferring is wrong.

create or replace function public.transfer_exam_identity(
  p_exam_id      uuid,
  p_from_student uuid,
  p_to_student   uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_edition int;
  v_stage   text;
  v_school  uuid;
  v_exam_no text;
  v_papers  int := 0;
  v_results int := 0;
  v_attend  int := 0;
begin
  if not public.has_module_manage('registrations') then
    raise exception 'Not permitted';
  end if;

  select edition_year, stage into v_edition, v_stage
  from public.paper_exams where id = p_exam_id;
  if v_edition is null then
    raise exception 'paper exam % does not exist', p_exam_id;
  end if;

  -- Bounded to the hand-over an approval just created: same school, source
  -- retired, target active. Unbounded, this is a way to move any score onto any
  -- row from /rest/v1/rpc — see the guard note in 20260822091000.
  select s.school_id into v_school
  from public.students s
  where s.id = p_from_student and s.deactivated_at is not null;
  if v_school is null then
    raise exception 'the outgoing student is not a retired rep';
  end if;

  if not exists (
    select 1 from public.students s
    where s.id = p_to_student
      and s.school_id = v_school
      and s.deactivated_at is null
  ) then
    raise exception 'the incoming student is not an active rep of the same school';
  end if;

  -- A target holding a record of their own sat this exam themselves. Two sheets
  -- for one seat is a decision for the admin, not a merge to guess at.
  if exists (select 1 from public.paper_exam_candidates
              where exam_id = p_exam_id and student_id = p_to_student)
     or exists (select 1 from public.paper_exam_papers
                 where exam_id = p_exam_id and student_id = p_to_student)
     or exists (select 1 from public.paper_exam_attendance
                 where exam_id = p_exam_id and student_id = p_to_student)
     or exists (select 1 from public.student_stage_results
                 where student_id = p_to_student
                   and stage = v_stage and edition_year = v_edition)
  then
    raise exception 'the incoming student already has a record for this exam';
  end if;

  update public.paper_exam_candidates
  set    student_id = p_to_student
  where  exam_id = p_exam_id and student_id = p_from_student
  returning exam_no into v_exam_no;

  with moved as (
    update public.paper_exam_papers
    set    student_id = p_to_student, updated_at = now()
    where  exam_id = p_exam_id and student_id = p_from_student
    returning 1
  )
  select count(*)::int into v_papers from moved;

  -- Scoped to this exam's own stage and edition: the outgoing rep's earlier
  -- stages, and every past year, stay hers.
  with moved as (
    update public.student_stage_results
    set    student_id = p_to_student, updated_at = now()
    where  student_id = p_from_student
      and  stage = v_stage and edition_year = v_edition
    returning 1
  )
  select count(*)::int into v_results from moved;

  with moved as (
    update public.paper_exam_attendance
    set    student_id = p_to_student
    where  exam_id = p_exam_id and student_id = p_from_student
    returning 1
  )
  select count(*)::int into v_attend from moved;

  update public.paper_exam_attendance_events
  set    student_id = p_to_student
  where  exam_id = p_exam_id and student_id = p_from_student;

  -- students.exam_id mirrors the candidate row for display. Only touched when
  -- a number actually moved, or clearing it would wipe the outgoing rep's
  -- historical zone-scoped value from an edition this exam knows nothing about.
  if v_exam_no is not null then
    update public.students set exam_id = v_exam_no where id = p_to_student;
    update public.students set exam_id = null     where id = p_from_student;
  end if;

  return jsonb_build_object(
    'exam_no',    v_exam_no,
    'papers',     v_papers,
    'results',    v_results,
    'attendance', v_attend);
end $$;

revoke all on function public.transfer_exam_identity(uuid, uuid, uuid) from public, anon;
grant execute on function public.transfer_exam_identity(uuid, uuid, uuid) to authenticated;
