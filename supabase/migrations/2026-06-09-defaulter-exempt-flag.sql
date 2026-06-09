-- Fix: manually-cleared defaulters must not be immediately re-flagged by check_defaulters.
--
-- Problem: clearDefaulter() sets status → 'active', but the next call to _fetchMembers()
-- re-runs check_defaulters, which scans all 'active' members with unpaid months and
-- immediately re-flags the just-cleared member as 'defaulter' before the fetch completes.
-- The UI reload shows the member still in the Defaulters tab.
--
-- Solution: add a `defaulter_exempt` boolean column. When an owner manually clears a
-- defaulter, set defaulter_exempt = TRUE. check_defaulters skips exempt members.
-- The flag resets to FALSE when the owner explicitly re-marks them as a defaulter.

ALTER TABLE public.pulse_members
  ADD COLUMN IF NOT EXISTS defaulter_exempt BOOLEAN NOT NULL DEFAULT FALSE;

-- Update check_defaulters to skip manually-exempted members.
CREATE OR REPLACE FUNCTION public.check_defaulters(p_gym_id uuid, p_threshold integer DEFAULT 2)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member       RECORD;
  v_consecutive  int;
  v_month_start  date;
  v_month_str    text;
  v_has_payment  bool;
BEGIN
  FOR v_member IN
    SELECT m.id, m.join_date
    FROM pulse_members m
    LEFT JOIN pulse_membership_plans p ON p.id = m.plan_id
    WHERE m.gym_id = p_gym_id
      AND m.status = 'active'
      AND (m.plan_id IS NULL OR p.duration_type IN ('monthly', 'daily', 'dropin'))
      AND m.monthly_fee > 0
      AND m.join_date <= (date_trunc('month', CURRENT_DATE) - (p_threshold || ' months')::interval)::date
      -- Skip members the owner has manually cleared — they opted this member out.
      AND m.defaulter_exempt = FALSE
  LOOP
    v_consecutive := 0;

    FOR i IN 1..p_threshold LOOP
      v_month_start := (date_trunc('month', CURRENT_DATE) - (i || ' months')::interval)::date;
      v_month_str   := to_char(v_month_start, 'YYYY-MM');

      SELECT EXISTS (
        SELECT 1 FROM pulse_payments
        WHERE member_id = v_member.id
          AND for_period = v_month_str
          AND status     = 'paid'
      ) INTO v_has_payment;

      IF NOT v_has_payment THEN
        v_consecutive := v_consecutive + 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;

    IF v_consecutive >= p_threshold THEN
      UPDATE pulse_members
      SET status          = 'defaulter',
          defaulter_since = CURRENT_DATE,
          updated_at      = now()
      WHERE id = v_member.id AND status = 'active';
    END IF;
  END LOOP;
END;
$function$;
