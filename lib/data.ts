import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Profile, Shop, Product, Supplier, Sale, StockLevel, StockMovement,
  Expense, SupplierLedgerEntry, SupplierBalance, DashboardStats, PLReport,
  DmsBranch,
} from "@/types";

// ─── Internal branch fetch ────────────────────────────────────────────────────
async function _fetchBranchesForShop(shopId: string): Promise<DmsBranch[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dms_branches")
    .select("*")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as DmsBranch[]) ?? [];
}

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

  if (!profile.shop_id) return { user, profile: profileWithEmail, shop: null, branches: [], branch: null, branchId: null };

  const { data: shopRow } = await admin
    .from("dms_shops")
    .select("*")
    .eq("id", profile.shop_id)
    .single();

  const shop = shopRow as Shop | null;

  // Fetch branches for the shop
  const branches: DmsBranch[] = shop ? await _fetchBranchesForShop(shop.id) : [];

  // Resolve active branch from cookie
  const cookieStore = await cookies();
  const activeBranchId = cookieStore.get("dms_active_branch")?.value;
  const branch =
    (activeBranchId ? branches.find((b) => b.id === activeBranchId) : null) ??
    branches.find((b) => b.is_default) ??
    branches[0] ??
    null;

  return {
    user,
    profile: profileWithEmail,
    shop,
    branches,
    branch,
    branchId: branch?.id ?? null,
  };
});

export async function resolveActiveBranchId(): Promise<string | null> {
  const ctx = await getAuthContext();
  return ctx?.branchId ?? null;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export async function getDashboardStats(branchId: string): Promise<DashboardStats> {
  const supabase = await createClient();
  const today = new Date();
  const p_today = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { data } = await supabase.rpc("get_dashboard_stats", { p_branch_id: branchId, p_today });
  return (data as DashboardStats) ?? {
    today_sales: 0, today_transactions: 0, month_sales: 0, month_cogs: 0,
    month_expenses: 0, outstanding_payables: 0, low_stock_count: 0, total_products: 0,
  };
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(branchId: string): Promise<Product[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_products")
    .select("*, supplier:dms_suppliers(id, name, brand)")
    .eq("branch_id", branchId)
    .order("name");
  return (data as Product[]) ?? [];
}

export async function getProduct(branchId: string, productId: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_products")
    .select("*, supplier:dms_suppliers(id, name, brand)")
    .eq("branch_id", branchId)
    .eq("id", productId)
    .single();
  return (data as Product | null);
}

// ─── Suppliers ────────────────────────────────────────────────────────────────
export async function getSuppliers(branchId: string): Promise<Supplier[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_suppliers")
    .select("*")
    .eq("branch_id", branchId)
    .order("name");
  return (data as Supplier[]) ?? [];
}

// ─── Stock ────────────────────────────────────────────────────────────────────
export async function getStockLevels(branchId: string): Promise<StockLevel[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_stock_levels")
    .select("*")
    .eq("branch_id", branchId)
    .order("product_name");
  return (data as StockLevel[]) ?? [];
}

export async function getStockMovements(
  branchId: string,
  opts?: { productId?: string; limit?: number }
): Promise<StockMovement[]> {
  const supabase = await createClient();
  let q = supabase
    .from("dms_stock_movements")
    .select("*, product:dms_products(id, name, unit)")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.productId) q = q.eq("product_id", opts.productId);
  const { data } = await q;
  return (data as StockMovement[]) ?? [];
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export async function getSales(
  branchId: string,
  opts?: { from?: string; to?: string; limit?: number }
): Promise<Sale[]> {
  const supabase = await createClient();
  let q = supabase
    .from("dms_sales")
    .select("*, product:dms_products(id, name, unit)")
    .eq("branch_id", branchId)
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
  branchId: string,
  opts?: { from?: string; to?: string; limit?: number }
): Promise<Expense[]> {
  const supabase = await createClient();
  let q = supabase
    .from("dms_expenses")
    .select("*")
    .eq("branch_id", branchId)
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
  branchId: string,
  supplierId: string
): Promise<SupplierLedgerEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_supplier_ledger")
    .select("*, supplier:dms_suppliers(id, name, brand)")
    .eq("branch_id", branchId)
    .eq("supplier_id", supplierId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as SupplierLedgerEntry[]) ?? [];
}

export async function getSupplierBalances(branchId: string): Promise<SupplierBalance[]> {
  const supabase = await createClient();
  const [{ data: suppliers }, { data: ledger }] = await Promise.all([
    supabase.from("dms_suppliers").select("*").eq("branch_id", branchId).order("name"),
    supabase.from("dms_supplier_ledger").select("supplier_id, type, amount").eq("branch_id", branchId),
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
  branchId: string,
  from: string,
  to: string
): Promise<PLReport> {
  const supabase = await createClient();

  const [{ data: sales }, { data: expenses }] = await Promise.all([
    supabase
      .from("dms_sales")
      .select("total, quantity, unit_price, product_id")
      .eq("branch_id", branchId)
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("dms_expenses")
      .select("amount, category")
      .eq("branch_id", branchId)
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
