-- Adds a shop/business name and GPS coordinates to the rider client
-- directory. business_name is optional (a client might just be a person,
-- not a registered business); latitude/longitude are captured via an
-- explicit "Use current location" tap in the Add Client form (never
-- automatic — the rider should be physically at the client when tagging
-- it), same as order-level GPS but a one-time capture per client rather
-- than per order.
ALTER TABLE dms_clients
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE dms_clients
  ADD CONSTRAINT dms_clients_business_name_len CHECK (business_name IS NULL OR char_length(business_name) <= 150),
  ADD CONSTRAINT dms_clients_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT dms_clients_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
