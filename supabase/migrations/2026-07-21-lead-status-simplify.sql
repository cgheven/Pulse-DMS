-- Simplify the lead pipeline from 12 enum values down to 8, matching the
-- HMS onboarding pipeline, and add a priority column.
--
-- IMPORTANT — why the remap lives inside ALTER COLUMN ... TYPE ... USING and
-- NOT in a separate UPDATE statement:
--   dms_leads has a BEFORE UPDATE trigger that stamps updated_at = now().
--   Commission/earnings queries select closed deals with
--     status = 'converted' AND updated_at >= <start of month>
--   so a bulk `UPDATE dms_leads SET status = ...` would rewrite every row's
--   updated_at to the migration timestamp and make every historical lead look
--   like it closed this month, inflating every rep's commission. An
--   ALTER COLUMN TYPE is a DDL table rewrite and does not fire row triggers,
--   so updated_at is preserved exactly.
--
-- Postgres cannot remove values from an existing enum, so the type is
-- recreated and swapped rather than altered in place.

BEGIN;

-- 1. New enum with the 8 pipeline stages.
CREATE TYPE dms_lead_status_new AS ENUM (
  'new',
  'contacted',
  'follow_up',
  'demo_scheduled',
  'demo_done',
  'onboarding',
  'converted',
  'rejected'
);

-- 2. Swap the column over, remapping retired values.
--      demo_given, negotiating -> demo_done
--      payment_pending         -> onboarding
--      payment_received,
--      active, won             -> converted   (terminal "closed won")
--      lost                    -> rejected
ALTER TABLE dms_leads ALTER COLUMN status DROP DEFAULT;

ALTER TABLE dms_leads
  ALTER COLUMN status TYPE dms_lead_status_new
  USING (
    CASE status::text
      WHEN 'demo_given'       THEN 'demo_done'
      WHEN 'negotiating'      THEN 'demo_done'
      WHEN 'payment_pending'  THEN 'onboarding'
      WHEN 'payment_received' THEN 'converted'
      WHEN 'active'           THEN 'converted'
      WHEN 'won'              THEN 'converted'
      WHEN 'lost'             THEN 'rejected'
      ELSE status::text
    END
  )::dms_lead_status_new;

ALTER TABLE dms_leads ALTER COLUMN status SET DEFAULT 'new';

-- 3. Retire the old type. This intentionally fails loudly if any other
--    column, view, or function signature still depends on it.
DROP TYPE dms_lead_status;
ALTER TYPE dms_lead_status_new RENAME TO dms_lead_status;

-- 4. Lead priority (High / Medium / Low), shown as an inline dropdown.
ALTER TABLE dms_leads
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_dms_leads_team_id ON dms_leads(team_id);
CREATE INDEX IF NOT EXISTS idx_dms_leads_assigned_to ON dms_leads(assigned_to);

COMMIT;

-- 5. Fix a live bug: app/actions/admin-inquiries.ts inserts source 'website',
--    which is not currently a member of dms_lead_source, so converting an
--    inquiry into a lead throws today. ALTER TYPE ... ADD VALUE is kept out of
--    the transaction block above for compatibility.
ALTER TYPE dms_lead_source ADD VALUE IF NOT EXISTS 'website';

-- 6. get_sales_rep_stats() hardcodes the retired status labels ('active',
--    'lost', 'payment_received'), so every query inside it would raise
--    "invalid input value for enum" once the type is swapped. The app no
--    longer calls it (the rep dashboard it fed was removed), but leaving a
--    function that throws is a trap for the next caller — so it is repointed
--    at the new vocabulary rather than left broken.
--    get_dms_admin_stats() only GROUPs BY status with no literals, so it needs
--    no change.
CREATE OR REPLACE FUNCTION public.get_sales_rep_stats(p_user_id uuid, p_today date DEFAULT CURRENT_DATE)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result json;
BEGIN
  SELECT json_build_object(
    'calls_today',       (SELECT COUNT(*) FROM dms_lead_activities WHERE actor_id = p_user_id AND activity_type = 'call' AND created_at::date = p_today),
    'calls_week',        (SELECT COUNT(*) FROM dms_lead_activities WHERE actor_id = p_user_id AND activity_type = 'call' AND created_at >= date_trunc('week', p_today::timestamptz)),
    'whatsapp_today',    (SELECT COUNT(*) FROM dms_lead_activities WHERE actor_id = p_user_id AND activity_type IN ('whatsapp_sent','whatsapp_received') AND created_at::date = p_today),
    'whatsapp_week',     (SELECT COUNT(*) FROM dms_lead_activities WHERE actor_id = p_user_id AND activity_type IN ('whatsapp_sent','whatsapp_received') AND created_at >= date_trunc('week', p_today::timestamptz)),
    'followups_today',   (SELECT COUNT(*) FROM dms_leads WHERE assigned_to = p_user_id AND next_followup_date = p_today AND status NOT IN ('converted','rejected')),
    'total_leads',       (SELECT COUNT(*) FROM dms_leads WHERE assigned_to = p_user_id),
    'active_leads',      (SELECT COUNT(*) FROM dms_leads WHERE assigned_to = p_user_id AND status NOT IN ('converted','rejected')),
    'won_this_month',    (SELECT COUNT(*) FROM dms_leads WHERE assigned_to = p_user_id AND status = 'converted' AND updated_at >= date_trunc('month', p_today::timestamptz)),
    'lost_this_month',   (SELECT COUNT(*) FROM dms_leads WHERE assigned_to = p_user_id AND status = 'rejected' AND updated_at >= date_trunc('month', p_today::timestamptz)),
    'pipeline_by_stage', (SELECT COALESCE(json_object_agg(status::text, cnt), '{}') FROM (SELECT status::text, COUNT(*) as cnt FROM dms_leads WHERE assigned_to = p_user_id AND status NOT IN ('converted','rejected') GROUP BY status) sub)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
