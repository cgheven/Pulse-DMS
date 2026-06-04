-- Snapshot of the plans (name + price) a payment covered, captured at payment
-- time. Lets the receipt itemize multi-plan members (Strength + Cardio) and
-- stays accurate for historical receipts even if the member's plans change later.
ALTER TABLE pulse_payments ADD COLUMN IF NOT EXISTS plan_breakdown jsonb;
