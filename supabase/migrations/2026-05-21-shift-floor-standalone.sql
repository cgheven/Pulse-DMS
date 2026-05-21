-- 2026-05-21: Shift commission_floor becomes a standalone field — no
-- trainer-floor fallback. Owner's mental model: shift = self-contained rule.
-- Blank/0 in shift form = "no Gym Fee on this shift" (direct commission %
-- on full member fee).
--
-- Backfill snapshots each existing shift's trainer's current floor into the
-- shift row so behavior for already-defined shifts stays exactly the same.
-- Owner then explicitly edits (delete + re-add) the shift to set floor=0.

update pulse_trainer_shifts s
   set commission_floor = coalesce(t.commission_floor, 0)
  from pulse_staff t
 where s.staff_id = t.id
   and s.commission_floor is null;

alter table pulse_trainer_shifts
  alter column commission_floor set default 0,
  alter column commission_floor set not null;

-- Drop the old "is null or >= 0" check (now redundant since NOT NULL).
-- Re-add a tighter "non-negative" constraint.
alter table pulse_trainer_shifts
  drop constraint if exists pulse_trainer_shifts_commission_floor_check;
alter table pulse_trainer_shifts
  add constraint pulse_trainer_shifts_commission_floor_check
  check (commission_floor >= 0);

notify pgrst, 'reload schema';
