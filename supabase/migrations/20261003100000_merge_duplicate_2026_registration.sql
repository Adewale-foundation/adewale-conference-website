-- One school submitted the 2026 form twice under two spellings, and the
-- Airtable sync made two registrations for it. Qualifications advanced the
-- July row and swept the June duplicate to eliminated, which also marked the
-- three reps eliminated. Pages pick "this edition's registration" with no
-- tie-break, so the school saw itself as not invited to camp.
--
-- Keep the July registration, delete the June one (only its own eliminated
-- result hangs off it), and set the reps back to the school's real outcome.
-- Guarded on both rows being exactly as found, so a re-run is a no-op.

do $$
declare
  v_keep    uuid := '7833dcca-c6ca-4de2-ad28-3d16f17111ff';
  v_drop    uuid := 'c3e37111-32f2-4b54-b998-7c1fdfb9e9b4';
  v_school  uuid := 'f078fc98-02d2-4056-8178-c018641dfa8c';
begin
  if not exists (
    select 1 from public.registrations k
    join public.registrations d on d.id = v_drop
    where k.id = v_keep
      and k.school_id = v_school and d.school_id = v_school
      and k.edition_year = 2026 and d.edition_year = 2026
  ) then
    raise notice 'Duplicate registration already merged; nothing to do.';
    return;
  end if;

  delete from public.registrations where id = v_drop;

  update public.student_stage_results ssr
  set outcome = 'advanced', note = 'Divisional Qualification', updated_at = now()
  from public.students st
  where ssr.student_id = st.id
    and st.school_id = v_school
    and st.deactivated_at is null
    and ssr.edition_year = 2026
    and ssr.stage = 'Qualifications'
    and ssr.outcome = 'eliminated';
end $$;
