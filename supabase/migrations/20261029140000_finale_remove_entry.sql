-- Admins with participants manage may remove a supporter's entry, so someone
-- who backed the wrong school by mistake can join again with the same phone.
-- Idempotent.
drop policy if exists finale_supporters_remove on public.finale_supporters;
create policy finale_supporters_remove on public.finale_supporters for delete
  using (public.has_module_manage('participants'));
