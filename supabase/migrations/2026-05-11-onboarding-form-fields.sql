-- Public onboarding form for Pulse GMS
-- Extends pulse_prospects (formerly hms_prospects) to capture inbound gym-owner
-- applications from the /onboarding wizard.
--
-- Strictly ADDITIVE — no DROP, no ALTER TYPE, no rename. Existing rows with
-- status pending/visited/onboarded/rejected continue to work unchanged.
--
-- Idempotent: re-running this migration is safe.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Core identity / contact (some already exist on hms_prospects, others new)
-- ─────────────────────────────────────────────────────────────────────────────
alter table pulse_prospects
  add column if not exists email      text,
  add column if not exists gym_name   text,
  add column if not exists gym_type   text;

-- gym_type must match the GymType enum used by gyms table when read back.
-- We do NOT enforce a CHECK to remain forward-compatible with the enum;
-- the server action validates against an allowlist instead.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Self-reported scale
-- ─────────────────────────────────────────────────────────────────────────────
alter table pulse_prospects
  add column if not exists active_members_count integer;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trial / plan choice (the evidence trail of what the prospect agreed to)
-- ─────────────────────────────────────────────────────────────────────────────
alter table pulse_prospects
  add column if not exists trial_choice          text,
  add column if not exists preferred_start_date  date,
  add column if not exists heard_from            text,
  add column if not exists plan_choice           text,
  add column if not exists billing_cycle         text,
  add column if not exists branch_type           text,
  add column if not exists branch_count          integer default 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Submission provenance / spam triage
-- ─────────────────────────────────────────────────────────────────────────────
alter table pulse_prospects
  add column if not exists submission_source text default 'admin-created',
  add column if not exists ip_address        text,
  add column if not exists user_agent        text,
  add column if not exists submitted_at      timestamptz,
  add column if not exists admin_notes       text;

-- Existing manually-created rows keep submission_source = 'admin-created'.
-- Public-form submissions write 'public-form'.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Index for sales-team queries (find newest inbound applications fast)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists pulse_prospects_submitted_at_idx
  on pulse_prospects (submitted_at desc nulls last);

create index if not exists pulse_prospects_submission_source_idx
  on pulse_prospects (submission_source);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — allow PUBLIC inserts (anon role) but only via service_role in code
-- ─────────────────────────────────────────────────────────────────────────────
-- The public form goes through the server action which uses the service_role
-- key (createAdminClient) — that already bypasses RLS, so no extra policy is
-- needed. The existing "Admins can manage prospects" policy still gates all
-- read/update/delete to admin users only. We deliberately do NOT open SELECT
-- to anon — the form is write-only from the public side.

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Tell PostgREST to refresh its schema cache so the new columns show up
-- ─────────────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
