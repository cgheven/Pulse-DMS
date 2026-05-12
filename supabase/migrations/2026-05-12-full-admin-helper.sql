-- 2026-05-12: pulse_is_full_admin() helper + RLS tightening
--
-- pulse_is_admin() returns true for any is_admin=true profile regardless of
-- admin_scope. For tables that should be hidden from scope='prospects' admins
-- (audit log, gyms, users-list view), we need a stricter helper that also
-- requires admin_scope='full'.

create or replace function pulse_is_full_admin()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from pulse_profiles
    where id = auth.uid()
      and is_admin = true
      and (admin_scope is null or admin_scope = 'full')
  );
$$;

-- Tighten the audit-log RLS so prospects-scope admins cannot read the audit
-- trail via direct PostgREST. UI is already gated; this closes the wire.
drop policy if exists pulse_audit_admin_only on pulse_audit_log;
create policy pulse_audit_full_admin_only
  on pulse_audit_log
  for select
  using (pulse_is_full_admin());

notify pgrst, 'reload schema';
