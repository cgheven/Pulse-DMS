-- Rider Management — Phase 3: Order Taking.
-- Persistent client directory (dms_clients) + standalone order-taking
-- (dms_rider_orders / dms_rider_order_items). Fully independent of
-- dms_sales / dms_stock_movements / dms_stock_levels: dms_products is only
-- ever read here for name/price lookup, never mutated, and no inventory is
-- deducted. GPS is two plain NUMERIC columns (latitude/longitude) captured
-- via the browser Geolocation API — no map SDK, no API key.

-- 1. Client directory — a distributor's own customers (NOT to be confused
-- with app/actions/admin-users.ts's DmsClient type, which means a platform
-- tenant; the TS type here is named RiderClient, see types/index.ts).
CREATE TABLE IF NOT EXISTS dms_clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES dms_shops(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES dms_branches(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 150),
  phone       TEXT CHECK (phone IS NULL OR char_length(phone) BETWEEN 7 AND 20),
  address     TEXT CHECK (address IS NULL OR char_length(address) <= 500),
  notes       TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dms_clients_branch ON dms_clients(branch_id);
CREATE INDEX IF NOT EXISTS idx_dms_clients_name   ON dms_clients(branch_id, name);
ALTER TABLE dms_clients ENABLE ROW LEVEL SECURITY;
-- No PostgREST policies: admin-client server actions only, mirrors dms_riders.

DROP TRIGGER IF EXISTS trg_dms_clients_updated_at ON dms_clients;
CREATE OR REPLACE FUNCTION dms_clients_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_dms_clients_updated_at
  BEFORE UPDATE ON dms_clients
  FOR EACH ROW EXECUTE FUNCTION dms_clients_set_updated_at();

-- 2. Orders — standalone, no FK/trigger touches dms_sales/dms_stock_movements/
-- dms_stock_levels. rider_id/client_id use ON DELETE RESTRICT so a rider or
-- client with recorded orders can only be deactivated, never hard-deleted.
CREATE TABLE IF NOT EXISTS dms_rider_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL REFERENCES dms_shops(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES dms_branches(id) ON DELETE CASCADE,
  rider_id          UUID NOT NULL REFERENCES dms_riders(id) ON DELETE RESTRICT,
  client_id         UUID NOT NULL REFERENCES dms_clients(id) ON DELETE RESTRICT,
  order_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','cancelled')),
  payment_method    TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','cheque','credit')),
  total_amount      NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  notes             TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  cancelled_reason  TEXT CHECK (cancelled_reason IS NULL OR char_length(cancelled_reason) <= 500),
  delivered_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dms_rider_orders_rider_date  ON dms_rider_orders(rider_id, order_date);
CREATE INDEX IF NOT EXISTS idx_dms_rider_orders_branch_date ON dms_rider_orders(branch_id, order_date);
CREATE INDEX IF NOT EXISTS idx_dms_rider_orders_status      ON dms_rider_orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_dms_rider_orders_client      ON dms_rider_orders(client_id);
ALTER TABLE dms_rider_orders ENABLE ROW LEVEL SECURITY;
-- No PostgREST policies: admin-client server actions only.

DROP TRIGGER IF EXISTS trg_dms_rider_orders_updated_at ON dms_rider_orders;
CREATE OR REPLACE FUNCTION dms_rider_orders_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_dms_rider_orders_updated_at
  BEFORE UPDATE ON dms_rider_orders
  FOR EACH ROW EXECUTE FUNCTION dms_rider_orders_set_updated_at();

-- 3. Line items — product_id is a read-only lookup at order time (ON DELETE
-- SET NULL) with a name/price snapshot so historical orders survive product
-- renames/deletions, exactly like dms_sales stores unit_price directly.
CREATE TABLE IF NOT EXISTS dms_rider_order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES dms_rider_orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES dms_products(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  quantity      NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC NOT NULL CHECK (unit_price >= 0),
  line_total    NUMERIC NOT NULL CHECK (line_total >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dms_rider_order_items_order ON dms_rider_order_items(order_id);
ALTER TABLE dms_rider_order_items ENABLE ROW LEVEL SECURITY;
-- No PostgREST policies: admin-client server actions only.
