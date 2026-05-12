-- 2026-05-12: Admin scope + prospect follow-up tracking
--
-- 1) admin_scope on pulse_profiles
--    Adds a coarse RBAC scope for admin users. 'full' (default) keeps the
--    existing behavior — admin sees the whole admin surface. 'prospects'
--    restricts an admin (e.g. a marketing partner) so they can only access
--    /admin/prospects. Server actions and the admin layout guard enforce
--    this — the column is just the source of truth.
--
-- 2) Follow-up tracking on pulse_prospects
--    Adds counters/timestamps so the prospects UI can show "contacted N
--    times, last on <date>" and which template the operator used. Filled
--    by the recordProspectFollowup server action.
--
-- Notify PostgREST so the new columns are visible without a manual reload.

alter table pulse_profiles
  add column if not exists admin_scope text not null default 'full'
  check (admin_scope in ('full', 'prospects'));

create index if not exists idx_pulse_profiles_admin_scope
  on pulse_profiles(admin_scope)
  where is_admin = true;

alter table pulse_prospects
  add column if not exists followup_count int not null default 0,
  add column if not exists last_followup_at timestamptz,
  add column if not exists last_followup_template text;

notify pgrst, 'reload schema';
