import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Profile, Shop, Product, Supplier, Sale, StockLevel, StockMovement,
  Expense, SupplierLedgerEntry, SupplierBalance, DashboardStats, PLReport,
} from "@/types";

// ─── Auth Context ─────────────────────────────────────────────────────────────
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from("dms_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = profileRow as Profile | null;
  if (!profile) return null;

  const profileWithEmail = { ...profile, email: user.email };

  if (!profile.shop_id) return { user, profile: profileWithEmail, shop: null };

  const { data: shopRow } = await admin
    .from("dms_shops")
    .select("*")
    .eq("id", profile.shop_id)
    .single();

  return {
    user,
    profile: profileWithEmail,
    shop: (shopRow as Shop | null),
  };
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
export async function getDashboardStats(shopId: string): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_dashboard_stats", { p_shop_id: shopId });
  return (data as DashboardStats) ?? {
    today_sales: 0, today_transactions: 0, month_sales: 0, month_cogs: 0,
    month_expenses: 0, outstanding_payables: 0, low_stock_count: 0, total_products: 0,
  };
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(shopId: string): Promise<Product[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_products")
    .select("*, supplier:dms_suppliers(id, name, brand)")
    .eq("shop_id", shopId)
    .order("name");
  return (data as Product[]) ?? [];
}

export async function getProduct(shopId: string, productId: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_products")
    .select("*, supplier:dms_suppliers(id, name, brand)")
    .eq("shop_id", shopId)
    .eq("id", productId)
    .single();
  return (data as Product | null);
}

// ─── Suppliers ────────────────────────────────────────────────────────────────
export async function getSuppliers(shopId: string): Promise<Supplier[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_suppliers")
    .select("*")
    .eq("shop_id", shopId)
    .order("name");
  return (data as Supplier[]) ?? [];
}

// ─── Stock ────────────────────────────────────────────────────────────────────
export async function getStockLevels(shopId: string): Promise<StockLevel[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_stock_levels")
    .select("*")
    .eq("shop_id", shopId)
    .order("product_name");
  return (data as StockLevel[]) ?? [];
}

export async function getStockMovements(
  shopId: string,
  opts?: { productId?: string; limit?: number }
): Promise<StockMovement[]> {
  const supabase = await createClient();
  let q = supabase
    .from("dms_stock_movements")
    .select("*, product:dms_products(id, name, unit)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.productId) q = q.eq("product_id", opts.productId);
  const { data } = await q;
  return (data as StockMovement[]) ?? [];
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export async function getSales(
  shopId: string,
  opts?: { from?: string; to?: string; limit?: number }
): Promise<Sale[]> {
  const supabase = await createClient();
  let q = supabase
    .from("dms_sales")
    .select("*, product:dms_products(id, name, unit)")
    .eq("shop_id", shopId)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.from) q = q.gte("sale_date", opts.from);
  if (opts?.to)   q = q.lte("sale_date", opts.to);
  const { data } = await q;
  return (data as Sale[]) ?? [];
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export async function getExpenses(
  shopId: string,
  opts?: { from?: string; to?: string; limit?: number }
): Promise<Expense[]> {
  const supabase = await createClient();
  let q = supabase
    .from("dms_expenses")
    .select("*")
    .eq("shop_id", shopId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.from) q = q.gte("expense_date", opts.from);
  if (opts?.to)   q = q.lte("expense_date", opts.to);
  const { data } = await q;
  return (data as Expense[]) ?? [];
}

// ─── Supplier Ledger ──────────────────────────────────────────────────────────
export async function getSupplierLedger(
  shopId: string,
  supplierId: string
): Promise<SupplierLedgerEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_supplier_ledger")
    .select("*, supplier:dms_suppliers(id, name, brand)")
    .eq("shop_id", shopId)
    .eq("supplier_id", supplierId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as SupplierLedgerEntry[]) ?? [];
}

export async function getSupplierBalances(shopId: string): Promise<SupplierBalance[]> {
  const supabase = await createClient();
  const [{ data: suppliers }, { data: ledger }] = await Promise.all([
    supabase.from("dms_suppliers").select("*").eq("shop_id", shopId).order("name"),
    supabase.from("dms_supplier_ledger").select("supplier_id, type, amount").eq("shop_id", shopId),
  ]);

  const rows = (suppliers as Supplier[]) ?? [];
  const entries = (ledger as { supplier_id: string; type: string; amount: number }[]) ?? [];

  return rows.map((s) => {
    const mine = entries.filter((e) => e.supplier_id === s.id);
    const total_purchased = mine.filter((e) => e.type === "purchase").reduce((a, e) => a + e.amount, 0);
    const total_paid      = mine.filter((e) => e.type === "payment").reduce((a, e) => a + e.amount, 0);
    return { supplier: s, total_purchased, total_paid, balance: total_purchased - total_paid };
  });
}

// ─── P&L Report ───────────────────────────────────────────────────────────────
export async function getPLReport(
  shopId: string,
  from: string,
  to: string
): Promise<PLReport> {
  const supabase = await createClient();

  const [{ data: sales }, { data: expenses }] = await Promise.all([
    supabase
      .from("dms_sales")
      .select("total, quantity, unit_price, product_id")
      .eq("shop_id", shopId)
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("dms_expenses")
      .select("amount, category")
      .eq("shop_id", shopId)
      .gte("expense_date", from)
      .lte("expense_date", to),
  ]);

  // Fetch cost prices for sold products
  const productIds = [...new Set((sales ?? []).map((s: { product_id: string }) => s.product_id))];
  let costMap: Record<string, number> = {};
  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from("dms_products")
      .select("id, cost_price")
      .in("id", productIds);
    (prods ?? []).forEach((p: { id: string; cost_price: number }) => { costMap[p.id] = p.cost_price; });
  }

  const salesRows = (sales ?? []) as { total: number; quantity: number; product_id: string }[];
  const expenseRows = (expenses ?? []) as { amount: number; category: string }[];

  const total_sales   = salesRows.reduce((a, s) => a + s.total, 0);
  const total_cogs    = salesRows.reduce((a, s) => a + s.quantity * (costMap[s.product_id] ?? 0), 0);
  const gross_profit  = total_sales - total_cogs;
  const total_expenses = expenseRows.reduce((a, e) => a + e.amount, 0);
  const net_profit    = gross_profit - total_expenses;
  const margin_pct    = total_sales > 0 ? (net_profit / total_sales) * 100 : 0;

  const catMap: Record<string, number> = {};
  expenseRows.forEach((e) => { catMap[e.category] = (catMap[e.category] ?? 0) + e.amount; });
  const expense_breakdown = Object.entries(catMap).map(([category, amount]) => ({ category, amount }));

  return { total_sales, total_cogs, gross_profit, total_expenses, net_profit, margin_pct, expense_breakdown };
}
