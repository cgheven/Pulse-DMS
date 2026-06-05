-- Defaulters: derive `defaulter_since` from the member's billing timeline
-- (anchored on their join date) instead of stamping CURRENT_DATE.
--
-- Before: a member flagged as a defaulter got `defaulter_since = CURRENT_DATE`
-- (whatever day the page load / cron happened to run the check). A member who
-- joined long ago and never paid showed "defaulter since today, 0d overdue".
--
-- After: `defaulter_since` = the due date of the FIRST unpaid billing month in
-- their current unpaid streak, where the billing day is the day-of-month of
-- their join_date (clamped to month length). A never-paid member is therefore
-- "overdue since their join date"; a member who last paid for 2026-03 is overdue
-- since their billing anniversary in 2026-04. Days-overdue now reflects reality.
--
-- Detection rule is unchanged in spirit: a member is a defaulter once they have
-- >= threshold consecutive unpaid *completed* billing months. Zero-fee members
-- (no obligation) are still skipped.

CREATE OR REPLACE FUNCTION public.check_defaulters(p_gym_id uuid, p_threshold integer DEFAULT 2)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member          RECORD;
  v_join_day        int;
  v_join_month      date;
  v_last_paid_str   text;
  v_last_paid_month date;
  v_streak_start    date;   -- first day of the first unpaid billing month
  v_current_month   date;
  v_last_due_month  date;   -- most recent COMPLETED billing month (current - 1)
  v_unpaid_count    int;
  v_anchor_day      int;
  v_defaulter_since date;
BEGIN
  v_current_month  := date_trunc('month', CURRENT_DATE)::date;
  v_last_due_month := (v_current_month - interval '1 month')::date;

  FOR v_member IN
    SELECT m.id, m.join_date
    FROM pulse_members m
    LEFT JOIN pulse_membership_plans p ON p.id = m.plan_id
    WHERE m.gym_id = p_gym_id
      AND m.status = 'active'
      -- Only monthly/daily/dropin (or no-plan) are fee-recurring. Quarterly+
      -- pay upfront and are governed by plan_expiry_date / auto_expire_members.
      AND (m.plan_id IS NULL OR p.duration_type IN ('monthly', 'daily', 'dropin'))
      -- A member who owes nothing (no monthly fee) can never be a defaulter.
      AND m.monthly_fee > 0
  LOOP
    v_join_month := date_trunc('month', v_member.join_date)::date;
    v_join_day   := EXTRACT(day FROM v_member.join_date)::int;

    -- Most recent billing month actually PAID for (ignore 'admission' etc.)
    SELECT max(for_period)
      INTO v_last_paid_str
      FROM pulse_payments
     WHERE member_id = v_member.id
       AND status = 'paid'
       AND for_period ~ '^\d{4}-\d{2}$';

    IF v_last_paid_str IS NULL THEN
      -- Never paid → owed since the month they joined.
      v_streak_start := v_join_month;
    ELSE
      v_last_paid_month := to_date(v_last_paid_str, 'YYYY-MM');
      -- Unpaid streak begins the month after their most recent payment,
      -- but never before they joined.
      v_streak_start := GREATEST(v_join_month, (v_last_paid_month + interval '1 month')::date);
    END IF;

    -- Count consecutive unpaid COMPLETED billing months (exclude current month).
    IF v_streak_start > v_last_due_month THEN
      v_unpaid_count := 0;  -- paid up to date, or too new
    ELSE
      v_unpaid_count :=
          (EXTRACT(year  FROM v_last_due_month)::int - EXTRACT(year  FROM v_streak_start)::int) * 12
        + (EXTRACT(month FROM v_last_due_month)::int - EXTRACT(month FROM v_streak_start)::int)
        + 1;
    END IF;

    IF v_unpaid_count >= p_threshold THEN
      -- Billing anniversary (join day-of-month) of the first unpaid month,
      -- clamped to that month's length.
      v_anchor_day := LEAST(
        v_join_day,
        EXTRACT(day FROM (v_streak_start + interval '1 month' - interval '1 day'))::int
      );
      v_defaulter_since := make_date(
        EXTRACT(year  FROM v_streak_start)::int,
        EXTRACT(month FROM v_streak_start)::int,
        v_anchor_day
      );

      UPDATE pulse_members
         SET status          = 'defaulter',
             defaulter_since = v_defaulter_since,
             updated_at      = now()
       WHERE id = v_member.id AND status = 'active';
    END IF;
  END LOOP;
END;
$function$;
