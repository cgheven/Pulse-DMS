-- Rider Management — Phase 4: Cash Collection.
-- Individual collection-event rows (mirrors dms_supplier_payments, NOT a
-- running-balance table). "Totals per rider/day" is computed on read via
-- GROUP BY rider_id, collection_date — exactly how getSupplierBalances()
-- derives balance on the fly rather than maintaining a stored running total.
-- Fully standalone: no FK/trigger touches dms_sales/dms_stock_movements/
-- dms_stock_levels. order_id/client_id are both nullable — a rider may
-- collect an outstanding payment tied to a client/older delivery rather than
-- today's specific order; the CHECK below only requires at least one anchor.

CREATE TABLE IF NOT EXISTS dms_rider_cash_collections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES dms_shops(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES dms_branches(id) ON DELETE CASCADE,
  rider_id         UUID NOT NULL REFERENCES dms_riders(id) ON DELETE RESTRICT,
  order_id         UUID REFERENCES dms_rider_orders(id) ON DELETE SET NULL,
  client_id        UUID REFERENCES dms_clients(id) ON DELETE SET NULL,
  amount           NUMERIC NOT NULL CHECK (amount > 0),
  collection_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  note             TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dms_rider_cash_collections_anchor_chk CHECK (order_id IS NOT NULL OR client_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cash_rider_date  ON dms_rider_cash_collections(rider_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cash_branch_date ON dms_rider_cash_collections(branch_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cash_order       ON dms_rider_cash_collections(order_id);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cash_client      ON dms_rider_cash_collections(client_id);
ALTER TABLE dms_rider_cash_collections ENABLE ROW LEVEL SECURITY;
-- No PostgREST policies: admin-client server actions only, mirrors
-- dms_riders / dms_clients / dms_rider_orders / dms_shop_modules.
