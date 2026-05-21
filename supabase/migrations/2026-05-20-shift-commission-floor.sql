-- 2026-05-20: Shift-level commission_floor override.
--
-- Lets owners run different Gym Fee deduction per shift (e.g. morning shift
-- deducts Rs 2,500 before commission, evening shift = no deduction).
--
-- NULL = fall back to trainer.commission_floor (preserves existing behavior
-- for all currently-defined shifts). Owner sets 0 explicitly when they want
-- "no floor for this shift".

alter table pulse_trainer_shifts
  add column if not exists commission_floor numeric
  check (commission_floor is null or commission_floor >= 0);

notify pgrst, 'reload schema';
