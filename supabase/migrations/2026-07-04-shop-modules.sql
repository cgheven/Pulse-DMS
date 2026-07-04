-- Generic per-shop module gating system.
-- No row for (shop_id, module_key) means the module is disabled — no backfill
-- needed for existing shops, everything is opt-in.
CREATE TABLE IF NOT EXISTS dms_shop_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES dms_shops(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  enabled_at  TIMESTAMPTZ,
  enabled_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_dms_shop_modules_shop ON dms_shop_modules(shop_id);

-- Server actions only (admin/service-role client after an explicit is_admin
-- check) — no direct client access via PostgREST, mirrors dms_sale_edits.
ALTER TABLE dms_shop_modules ENABLE ROW LEVEL SECURITY;
