-- Stable identity that survives editSale's delete+reinsert cycle (needed
-- because stock adjustment triggers only fire on INSERT/DELETE, not UPDATE).
ALTER TABLE dms_sales ADD COLUMN IF NOT EXISTS logical_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_dms_sales_logical_id ON dms_sales (logical_id);

CREATE TABLE IF NOT EXISTS dms_sale_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logical_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES dms_branches(id) ON DELETE CASCADE,
  old_product_id UUID,
  new_product_id UUID,
  old_quantity NUMERIC,
  new_quantity NUMERIC,
  old_unit_price NUMERIC,
  new_unit_price NUMERIC,
  old_total NUMERIC,
  new_total NUMERIC,
  old_payment_mode TEXT,
  new_payment_mode TEXT,
  old_customer_name TEXT,
  new_customer_name TEXT,
  old_sale_date DATE,
  new_sale_date DATE,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_by_name TEXT,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dms_sale_edits_logical_id ON dms_sale_edits (logical_id);

-- Server actions only (admin client) — no direct client access via PostgREST.
ALTER TABLE dms_sale_edits ENABLE ROW LEVEL SECURITY;
