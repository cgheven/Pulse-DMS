-- Add phone number to profiles so sales reps (and future roles) can have
-- a contact number captured at creation time for WhatsApp credential delivery.

ALTER TABLE dms_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE dms_profiles ADD CONSTRAINT dms_profiles_phone_check
  CHECK (phone IS NULL OR (char_length(phone) >= 7 AND char_length(phone) <= 20));
