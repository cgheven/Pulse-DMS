// ─────────────────────────────────────────────
// DMS v1 — Core Types
// ─────────────────────────────────────────────

export type Shop = {
  id: string;
  owner_id: string;
  shop_name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email?: string;
  role: "owner" | "staff";
  shop_id: string | null;
  is_admin: boolean;
  created_at: string;
};

export type Supplier = {
  id: string;
  shop_id: string;
  name: string;
  brand: string | null;
  contact: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  shop_id: string;
  supplier_id: string | null;
  name: string;
  unit: string;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number;
  created_at: string;
  supplier?: Pick<Supplier, "id" | "name" | "brand"> | null;
};

export type StockMovement = {
  id: string;
  shop_id: string;
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
  product_name: string;
  unit: string;
  low_stock_threshold: number;
  cost_price: number;
  sale_price: number;
  supplier_id: string | null;
  current_stock: number;
};

export type Sale = {
  id: string;
  shop_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  payment_mode: "cash" | "credit";
  customer_name: string | null;
  sale_date: string;
  created_at: string;
  unit_cost: number | null;
  product?: Pick<Product, "id" | "name" | "unit"> | null;
};

export type Expense = {
  id: string;
  shop_id: string;
  category: "rent" | "electricity" | "internet" | "water" | "gas" | "phone" | "salary" | "misc";
  amount: number;
  note: string | null;
  expense_date: string;
  created_at: string;
};

export type SupplierLedgerEntry = {
  id: string;
  shop_id: string;
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
  shop_id: string;
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

// ─── Admin portal stubs (platform-level, not shop-level) ─────────────────────
export type AdminScope = "full" | "prospects";
export type StaffRole = "owner" | "staff";
export type AdminUser = { id: string; email: string; created_at: string };
export type AuditLog = { id: string; actor_id: string; action: string; entity: string; meta: Record<string, unknown>; created_at: string };
export type LoginLog = { id: string; user_id: string; created_at: string };
