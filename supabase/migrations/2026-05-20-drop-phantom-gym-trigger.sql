-- 2026-05-20: Drop the phantom-gym trigger entirely.
--
-- History: trigger was added to auto-create "My Gym" when a profile row was
-- inserted, so self-signup owners had a gym to land on. The 2026-05-11 fix
-- scoped it to role='owner' or NULL so non-owner staff didn't get gyms.
--
-- Why drop now: there is no self-signup flow anymore. All accounts are
-- admin-provisioned (Create User / Invite / Create Partner). The admin adds
-- the gym explicitly via "Add Branch" in the same dialog. With branch_limit
-- defaulting to 1, the auto-created "My Gym" consumes the only slot — admin
-- has to delete the placeholder before adding the real branch. That's a
-- footgun with no upside.
--
-- Function kept around in case we resurrect self-signup later.

drop trigger if exists pulse_on_profile_created on pulse_profiles;
