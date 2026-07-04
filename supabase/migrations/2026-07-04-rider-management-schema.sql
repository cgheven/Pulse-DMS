-- Rider Management — Phase 2: rider entity, own Supabase Auth login.
-- Mirrors the is_sales_rep + dms_staff pattern, scoped to a shop (tenant),
-- not the platform. See lib/modules.ts / dms_shop_modules for the gate
-- ("rider_management") that every rider-facing route/action checks.

-- 1. Dedicated boolean flag on dms_profiles (identical shape to is_sales_rep).
-- role stays 'owner'|'staff' (CHECK-locked) — rider logins get role: 'staff'
-- as an inert default; the real gate is is_rider + the (rider) route group.
ALTER TABLE dms_profiles ADD COLUMN IF NOT EXISTS is_rider BOOLEAN NOT NULL DEFAULT false;

-- 2. dms_riders — structurally like dms_staff, plus branch_id (rider orders
-- need per-branch attribution) and vehicle_number.
CREATE TABLE IF NOT EXISTS dms_riders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES dms_shops(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES dms_branches(id) ON DELETE RESTRICT,
  full_name       TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 100),
  phone           TEXT NOT NULL CHECK (char_length(phone) BETWEEN 7 AND 20),
  vehicle_number  TEXT CHECK (vehicle_number IS NULL OR char_length(vehicle_number) <= 30),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  profile_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dms_riders_shop   ON dms_riders(shop_id);
CREATE INDEX IF NOT EXISTS idx_dms_riders_branch ON dms_riders(branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_riders_profile ON dms_riders(profile_id) WHERE profile_id IS NOT NULL;

ALTER TABLE dms_riders ENABLE ROW LEVEL SECURITY;
-- No PostgREST policies: admin-client server actions only, mirrors dms_staff/dms_sale_edits.

DROP TRIGGER IF EXISTS trg_dms_riders_updated_at ON dms_riders;
CREATE OR REPLACE FUNCTION dms_riders_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_dms_riders_updated_at
  BEFORE UPDATE ON dms_riders
  FOR EACH ROW EXECUTE FUNCTION dms_riders_set_updated_at();
