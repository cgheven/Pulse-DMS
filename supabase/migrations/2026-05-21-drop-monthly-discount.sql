-- 2026-05-21: Drop monthly_discount — recurring discounts unused in practice.
-- Per-payment discount lives on pulse_payments.discount; that's enough.
alter table pulse_members drop column if exists monthly_discount;
notify pgrst, 'reload schema';
