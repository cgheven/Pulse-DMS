-- Multi-plan support: a member can be assigned multiple plans (e.g. Strength + Cardio).
-- member.plan_id stays as the PRIMARY plan (drives billing cycle/expiry + all existing
-- reads). This junction holds the FULL set, including the primary. Backward-compatible.
CREATE TABLE IF NOT EXISTS pulse_member_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES pulse_gyms(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES pulse_members(id) ON DELETE CASCADE,
  plan_id    uuid NOT NULL REFERENCES pulse_membership_plans(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_member_plans_member ON pulse_member_plans(member_id);
CREATE INDEX IF NOT EXISTS idx_member_plans_gym ON pulse_member_plans(gym_id);

ALTER TABLE pulse_member_plans ENABLE ROW LEVEL SECURITY;

-- Backfill: every current single-plan member gets one junction row for their plan.
INSERT INTO pulse_member_plans (gym_id, member_id, plan_id)
SELECT gym_id, id, plan_id
FROM pulse_members
WHERE plan_id IS NOT NULL
ON CONFLICT (member_id, plan_id) DO NOTHING;
