-- Pending signup discount — captures the discount intent when admission is
-- unpaid at signup. Cleared when admission payment is recorded (discount
-- moves to pulse_payments.discount on the realized payment row).
alter table pulse_members
  add column if not exists pending_signup_discount numeric not null default 0
  check (pending_signup_discount >= 0);

notify pgrst, 'reload schema';
