-- 2026-05-21: Named default shift for trainers.
--
-- Owners can now label the trainer's default commission rule (used when a
-- member has no `assigned_shift_id`). Pure display/reporting field — math
-- still uses pulse_staff.commission_percentage + commission_floor.
--
-- Default 'Full Time' so existing trainers get a sensible label.

alter table pulse_staff
  add column if not exists default_shift_name text not null default 'Full Time'
  check (length(default_shift_name) > 0 and length(default_shift_name) <= 60);

notify pgrst, 'reload schema';
