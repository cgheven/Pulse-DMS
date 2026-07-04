-- Rider Management — Phase 5: Cheque Collection.
-- Individual collection-event rows (mirrors dms_rider_cash_collections /
-- dms_supplier_payments), not a running-balance table. Pending aging
-- ("days outstanding") is NOT stored — it's computed at query time as
-- CURRENT_DATE - collection_date for status='pending' rows, exactly how
-- getSupplierBalances() derives balance on the fly. Fully standalone: no
-- FK/trigger touches dms_sales/dms_stock_movements/dms_stock_levels.
--
-- Unlike cash collection, client_id is NOT NULL here — a cheque must always
-- be traceable to the client who issued it (order_id remains optional, for
-- the same "collect against an older delivery" case as cash collection).

CREATE TABLE IF NOT EXISTS dms_rider_cheque_collections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id            UUID NOT NULL REFERENCES dms_shops(id) ON DELETE CASCADE,
  branch_id          UUID NOT NULL REFERENCES dms_branches(id) ON DELETE CASCADE,
  rider_id           UUID NOT NULL REFERENCES dms_riders(id) ON DELETE RESTRICT,
  order_id           UUID REFERENCES dms_rider_orders(id) ON DELETE SET NULL,
  client_id          UUID NOT NULL REFERENCES dms_clients(id) ON DELETE RESTRICT,
  cheque_number      TEXT NOT NULL CHECK (char_length(cheque_number) BETWEEN 1 AND 50),
  bank_name          TEXT CHECK (bank_name IS NULL OR char_length(bank_name) <= 100),
  cheque_date        DATE NOT NULL,               -- date printed on the cheque
  amount             NUMERIC NOT NULL CHECK (amount > 0),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cleared','bounced')),
  status_updated_at  TIMESTAMPTZ,
  collection_date    DATE NOT NULL DEFAULT CURRENT_DATE,  -- date rider physically received it
  note               TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cheque_rider_status  ON dms_rider_cheque_collections(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cheque_branch_status ON dms_rider_cheque_collections(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cheque_order         ON dms_rider_cheque_collections(order_id);
CREATE INDEX IF NOT EXISTS idx_dms_rider_cheque_client        ON dms_rider_cheque_collections(client_id);
ALTER TABLE dms_rider_cheque_collections ENABLE ROW LEVEL SECURITY;
-- No PostgREST policies: admin-client server actions only, mirrors
-- dms_riders / dms_clients / dms_rider_orders / dms_rider_cash_collections.

DROP TRIGGER IF EXISTS trg_dms_rider_cheque_collections_updated_at ON dms_rider_cheque_collections;
CREATE OR REPLACE FUNCTION dms_rider_cheque_collections_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_dms_rider_cheque_collections_updated_at
  BEFORE UPDATE ON dms_rider_cheque_collections
  FOR EACH ROW EXECUTE FUNCTION dms_rider_cheque_collections_set_updated_at();
