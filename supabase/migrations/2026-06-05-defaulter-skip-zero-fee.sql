-- Fix: members who owe nothing must never be auto-flagged as defaulters.
--
-- Problem: check_defaulters flagged any active member with plan_id IS NULL whose
-- join_date was older than the threshold and who had no recent paid payment.
-- After a bulk member import (members added with old join dates, no plan, Rs.0 fee)
-- this marked the entire historical roster as "defaulters" with defaulter_since = today.
--
-- A member with monthly_fee = 0 has no payment obligation, so they cannot be a
-- defaulter. Add `m.monthly_fee > 0` to the selection. Everything else is unchanged.

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
      -- Only check monthly/daily/dropin plans.
      -- Quarterly/biannual/annual members pay upfront and are managed
      -- purely by plan_expiry_date via auto_expire_members.
      AND (m.plan_id IS NULL OR p.duration_type IN ('monthly', 'daily', 'dropin'))
      -- A member who owes nothing (no fee) cannot be a defaulter.
      AND m.monthly_fee > 0
      -- Must have been a member for at least threshold full months
      AND m.join_date <= (date_trunc('month', CURRENT_DATE) - (p_threshold || ' months')::interval)::date
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
        EXIT; -- break on first paid month → streak ends
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
