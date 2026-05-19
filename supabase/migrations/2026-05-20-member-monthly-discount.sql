-- 2026-05-20: Recurring monthly discount on members.
--
-- monthly_fee stays as the plan sticker price. monthly_discount is the
-- recurring monthly discount owner grants the member. Actual cash collected
-- per month = monthly_fee - monthly_discount.
--
-- Trainer commission is computed with the discount split equally between the
-- gym's floor and the trainer's share — see lib/data.ts + app/actions/trainer.ts
-- for the math (netFee = monthly_fee - floor - discount/2).
--
-- Existing members get default 0 → behavior unchanged for everyone today.

alter table pulse_members
  add column if not exists monthly_discount numeric not null default 0
  check (monthly_discount >= 0);

notify pgrst, 'reload schema';
