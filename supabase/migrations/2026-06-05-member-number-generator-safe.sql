-- Make member-number generation collision-safe.
--
-- Before: next number = COUNT(*) + 1 for the gym. This is NOT unique-safe — after
-- any deletion the count drops and the next insert reuses an existing number,
-- silently creating duplicate member_numbers (there is no unique constraint).
--
-- After: next number = (highest existing PGM-#### suffix for the gym) + 1. This
-- never reuses a number regardless of deletions. Only PGM-formatted numbers are
-- considered when computing the max; a gym with no PGM members starts at 1.

CREATE OR REPLACE FUNCTION public.pulse_generate_member_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX((substring(member_number from '^PGM-(\d+)$'))::int), 0) + 1
    INTO next_num
  FROM pulse_members
  WHERE gym_id = NEW.gym_id
    AND member_number ~ '^PGM-\d+$';

  NEW.member_number := 'PGM-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;
