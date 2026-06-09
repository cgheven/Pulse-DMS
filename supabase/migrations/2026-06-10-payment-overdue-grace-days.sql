ALTER TABLE public.pulse_gyms
  ADD COLUMN IF NOT EXISTS payment_overdue_grace_days INTEGER NOT NULL DEFAULT 2;
