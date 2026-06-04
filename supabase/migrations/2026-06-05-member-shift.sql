-- Member attendance shift (time slot they come in) — purely for record-keeping.
-- Distinct from assigned_shift_id (which is a trainer commission rule).
ALTER TABLE pulse_members
  ADD COLUMN IF NOT EXISTS shift text
  CHECK (shift IS NULL OR shift IN ('morning', 'evening', 'night'));
