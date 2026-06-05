-- Hard guarantee: member numbers are unique within a gym.
--
-- Backs up the collision-safe generator (pulse_generate_member_number, max+1)
-- with a DB-level constraint so a duplicate member_number can never be written
-- again — even under a concurrent insert or a manual write. NULLs are allowed
-- and remain distinct (the BEFORE INSERT trigger fills member_number anyway).
--
-- Prerequisite (already done in data migration): all existing duplicate
-- member_numbers were resolved before this constraint could be added.

ALTER TABLE public.pulse_members
  ADD CONSTRAINT pulse_members_gym_member_number_key UNIQUE (gym_id, member_number);
