// ─────────────────────────────────────────────
// DMS v1 — Core Types
// ─────────────────────────────────────────────

export type Shop = {
  id: string;
  owner_id: string;
  shop_name: string;
  city?: string | null;
  phone?: string | null;
  branch_limit: number;
  created_at: string;
  // Trial / subscription fields — required for server-side enforcement (Finding 6)
  is_active: boolean;
  trial_plan: "7_day" | "14_day" | "30_day" | "full" | null;
  trial_ends_at: string | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email?: string;
  role: "owner" | "staff";
  shop_id: string | null;
  is_admin: boolean;
  is_sales_rep: boolean;
  is_rider: boolean;
  created_at: string;
};

export type DmsStaffRole = "manager" | "sales" | "cashier" | "stock" | "accountant" | "driver" | "other";

export type Staff = {
  id: string;
  shop_id: string;
  full_name: string;
  phone: string;
  role: DmsStaffRole;
  is_active: boolean;
  profile_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Supplier = {
  id: string;
  shop_id?: string | null;
  name: string;
  brand: string | null;
  contact: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  shop_id?: string | null;
  supplier_id: string | null;
  name: string;
  size: string | null;
  unit: string;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number;
  created_at: string;
  supplier?: Pick<Supplier, "id" | "name" | "brand"> | null;
};

export type StockMovement = {
  id: string;
  shop_id?: string | null;
  product_id: string;
  type: "in" | "out";
  quantity: number;
  unit_price: number | null;
  note: string | null;
  sale_id: string | null;
  created_at: string;
  product?: Pick<Product, "id" | "name" | "unit"> | null;
};

export type StockLevel = {
  product_id: string;
  shop_id: string;
  branch_id: string;
  product_name: string;
  size: string | null;
  unit: string;
  low_stock_threshold: number;
  cost_price: number;
  sale_price: number;
  supplier_id: string | null;
  current_stock: number;
};

export type Sale = {
  id: string;
  shop_id?: string | null;
  product_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  payment_mode: "cash" | "credit";
  customer_name: string | null;
  sale_date: string;
  created_at: string;
  unit_cost: number | null;
  added_by: string | null;
  added_by_name: string | null;
  logical_id: string;
  product?: Pick<Product, "id" | "name" | "unit"> | null;
};

export type Expense = {
  id: string;
  shop_id?: string | null;
  category: "rent" | "electricity" | "internet" | "water" | "gas" | "phone" | "salary" | "misc";
  amount: number;
  note: string | null;
  expense_date: string;
  created_at: string;
};

export type SupplierLedgerEntry = {
  id: string;
  shop_id?: string | null;
  supplier_id: string;
  type: "purchase" | "payment";
  amount: number;
  paid_amount: number;
  invoice_number: string | null;
  note: string | null;
  transaction_date: string;
  created_at: string;
  supplier?: Pick<Supplier, "id" | "name" | "brand"> | null;
};

export type SupplierPayment = {
  id: string;
  shop_id?: string | null;
  invoice_id: string;
  amount: number;
  payment_date: string;
  note: string | null;
  created_at: string;
};

export type SupplierBalance = {
  supplier: Supplier;
  total_purchased: number;
  total_paid: number;
  balance: number;
};

export type DashboardStats = {
  today_sales: number;
  today_transactions: number;
  month_sales: number;
  month_cogs: number;
  month_expenses: number;
  outstanding_payables: number;
  low_stock_count: number;
  total_products: number;
};

export type PLReport = {
  total_sales: number;
  total_cogs: number;
  gross_profit: number;
  total_expenses: number;
  net_profit: number;
  margin_pct: number;
  expense_breakdown: { category: string; amount: number }[];
};

// ─── Multi-branch support ─────────────────────────────────────────────────────

export type DmsBranch = {
  id: string;
  shop_id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

// ─── Rider Management (shop-scoped, gated by the "rider_management" module) ──

export type Rider = {
  id: string;
  shop_id: string;
  branch_id: string;
  full_name: string;
  phone: string;
  vehicle_number: string | null;
  is_active: boolean;
  profile_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Order Taking (standalone: no dms_sales/dms_stock_movements linkage) ─────
// NOTE: named RiderClient (not DmsClient) to avoid colliding with
// app/actions/admin-users.ts's DmsClient, which means a platform tenant.

export type RiderClient = {
  id: string;
  shop_id: string;
  branch_id: string;
  name: string;
  business_name: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RiderOrderStatus = "pending" | "delivered" | "cancelled";
export type RiderOrderPaymentMethod = "cash" | "cheque" | "credit";

export type RiderOrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

export type RiderOrder = {
  id: string;
  shop_id: string;
  branch_id: string;
  rider_id: string;
  client_id: string;
  order_date: string;
  status: RiderOrderStatus;
  payment_method: RiderOrderPaymentMethod;
  total_amount: number;
  // Denormalized at order-creation time in createOrder() — true if ANY item
  // lacks a resolvable dms_products row (product_id IS NULL). Lets list
  // views (which select dms_rider_orders alone, no item join) show a
  // "Custom" badge without an N+1 per-order items query.
  has_custom_item: boolean;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  cancelled_reason: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined for list views (owner "all riders" view / rider "my orders" view).
  rider?: Pick<Rider, "id" | "full_name"> | null;
  client?: Pick<RiderClient, "id" | "name" | "phone"> | null;
  items?: RiderOrderItem[];
  // Plain https://www.google.com/maps?q={lat},{lng} link — no map SDK.
  mapsUrl?: string | null;
};

// ─── Cash Collection (dms_rider_cash_collections) ────────────────────────────
// Individual collection-event rows (mirrors dms_supplier_payments), not a
// running-balance table. order_id/client_id are both nullable — at least one
// must be set (enforced by a DB CHECK + app-level validation) since a rider
// may collect an outstanding payment tied to a client/older delivery rather
// than today's specific order.

export type RiderCashCollection = {
  id: string;
  shop_id: string;
  branch_id: string;
  rider_id: string;
  order_id: string | null;
  client_id: string | null;
  amount: number;
  collection_date: string;
  note: string | null;
  created_at: string;
  // Joined for list views (owner "all riders" view / rider "my history" view).
  rider?: Pick<Rider, "id" | "full_name"> | null;
  client?: Pick<RiderClient, "id" | "name" | "phone"> | null;
  order?: Pick<RiderOrder, "id" | "total_amount"> | null;
};

// Computed on read (GROUP BY rider_id, collection_date) — never stored.
export type RiderCashTotalByRiderDay = {
  riderId: string;
  riderName: string;
  date: string;
  total: number;
};

// ─── Cheque Collection (dms_rider_cheque_collections) ────────────────────────
// Individual collection-event rows (mirrors dms_rider_cash_collections), not a
// running-balance table. client_id is required (unlike cash collection) — a
// cheque must always be traceable to the client who issued it; order_id stays
// optional for the "collect against an older delivery" case. Pending aging
// (daysPending) is NOT stored — computed on read as CURRENT_DATE - collection_date.

export type RiderChequeStatus = "pending" | "cleared" | "bounced";

export type RiderChequeCollection = {
  id: string;
  shop_id: string;
  branch_id: string;
  rider_id: string;
  order_id: string | null;
  client_id: string;
  cheque_number: string;
  bank_name: string | null;
  cheque_date: string;
  amount: number;
  status: RiderChequeStatus;
  status_updated_at: string | null;
  collection_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Joined for list views (owner "all riders" view / rider "my history" view).
  rider?: Pick<Rider, "id" | "full_name"> | null;
  client?: Pick<RiderClient, "id" | "name" | "phone"> | null;
  order?: Pick<RiderOrder, "id" | "total_amount"> | null;
  // Computed on read for status='pending' rows only (CURRENT_DATE - collection_date). null otherwise.
  daysPending?: number | null;
};

// ─── Management Reports (all computed on read from the tables above; nothing
// here is stored — mirrors the totals-by-rider-day / daysPending precedent) ──

// "Daily sales by rider" — dms_rider_orders grouped by (rider_id, order_date),
// excluding cancelled orders (a cancelled order was never actually a sale).
export type RiderDailySalesRow = {
  date: string;
  riderId: string;
  riderName: string;
  orderCount: number;
  totalAmount: number;
};

// Cheque totals grouped by rider across the report's date range, split by
// status — complements RiderCashTotalByRiderDay for the cash side.
export type RiderChequeTotalByRider = {
  riderId: string;
  riderName: string;
  pendingTotal: number;
  clearedTotal: number;
  bouncedTotal: number;
};

// "Rider performance summary" — one row per rider active in the shop/branch,
// aggregated over the report's date range.
export type RiderPerformanceRow = {
  riderId: string;
  riderName: string;
  ordersTaken: number;
  delivered: number;
  cancelled: number;
  pending: number;
  deliveryRatePct: number;
  cashCollected: number;
  chequeCollected: number;
  avgOrderValue: number;
};

// "Pending orders" — status='pending' dms_rider_orders, any age, with the
// number of days it's been sitting there computed via daysSince(order_date).
export type RiderPendingOrder = RiderOrder & { daysPending: number };

export type ManagementReports = {
  dailySalesByRider: RiderDailySalesRow[];
  cashByRiderDay: RiderCashTotalByRiderDay[];
  cashGrandTotal: number;
  chequeByRider: RiderChequeTotalByRider[];
  chequePendingTotal: number;
  chequeClearedTotal: number;
  chequeBouncedTotal: number;
  riderPerformance: RiderPerformanceRow[];
  pendingOrders: RiderPendingOrder[];
};

// ─── Admin portal stubs (platform-level, not shop-level) ─────────────────────
export type AdminScope = "full" | "prospects";
export type StaffRole = "owner" | "staff";
export type AdminUser = { id: string; email: string; created_at: string };
export type AuditLog = { id: string; actor_id: string; action: string; entity: string; meta: Record<string, unknown>; created_at: string };
export type LoginLog = { id: string; user_id: string; created_at: string };
