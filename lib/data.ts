import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Profile, Shop, Product, Supplier, Sale, StockLevel, StockMovement,
  Expense, SupplierLedgerEntry, SupplierBalance, DashboardStats, PLReport,
  CostRow, ProductRow, DmsBranch,
} from "@/types";

// ─── Cache tags ───────────────────────────────────────────────────────────────
// Mutation actions (sales/expenses/stock/products/supplier-ledger) call
// revalidateTag() with these same tags so the unstable_cache entries below
// don't serve stale pre-mutation data for their revalidate window.
export const dashboardStatsTag = (branchId: string) => `dashboard-stats-${branchId}`;
export const supplierBalancesTag = (branchId: string) => `supplier-balances-${branchId}`;
export const plReportTag = (branchId: string) => `pl-report-${branchId}`;

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

  const fetch = unstable_cache(
    async () => {
      const { data } = await supabase.rpc("get_dashboard_stats", { p_branch_id: branchId, p_today });
      const row = Array.isArray(data) ? data[0] : data;
      return (row as DashboardStats) ?? {
        today_sales: 0, today_transactions: 0, month_sales: 0, month_cogs: 0,
        month_expenses: 0, outstanding_payables: 0, low_stock_count: 0, total_products: 0,
      };
    },
    [`dashboard-stats-${branchId}-${p_today}`],
    { tags: [dashboardStatsTag(branchId)], revalidate: 30 }
  );

  return fetch();
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

// Bounded history for client-side FIFO batch/cost computation. Fetching ALL
// historical movements with no limit gets slower every month as a real shop
// accumulates data — a 12-month window is more than enough runway for FIFO
// batch math in practice, and computeBatches() (lib/stock-batches.ts) covers
// the edge case where older, still-unconsumed batches fall outside the
// window by reconciling against the product's real current stock.
export async function getStockBatchMovements(
  branchId: string,
  months = 12
): Promise<{ product_id: string; type: string; quantity: number; unit_price: number | null; created_at: string }[]> {
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const { data } = await supabase
    .from("dms_stock_movements")
    .select("product_id, type, quantity, unit_price, created_at")
    .eq("branch_id", branchId)
    .gte("created_at", cutoff.toISOString())
    .order("created_at", { ascending: true });
  return (data as { product_id: string; type: string; quantity: number; unit_price: number | null; created_at: string }[]) ?? [];
}

// Narrow, per-product fallback for products whose windowed FIFO history
// (getStockBatchMovements above) can't fully account for their real current
// stock — i.e. they still hold unsold stock purchased more than the window's
// `months` ago. Bounded to ONE product's full history (not every product's),
// so it stays cheap even as the shop's overall transaction volume grows;
// only called for the rare product that actually needs it, to recover its
// real historical unit price instead of falling back to current cost_price.
export async function getFullProductMovements(
  branchId: string,
  productId: string
): Promise<{ type: string; quantity: number; unit_price: number | null; created_at: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dms_stock_movements")
    .select("type, quantity, unit_price, created_at")
    .eq("branch_id", branchId)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  return (data as { type: string; quantity: number; unit_price: number | null; created_at: string }[]) ?? [];
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

  const fetch = unstable_cache(
    async () => {
      const [{ data: suppliers }, { data: ledger }] = await Promise.all([
        supabase.from("dms_suppliers").select("*").eq("branch_id", branchId).order("name"),
        supabase
          .from("dms_supplier_ledger")
          .select("supplier_id, type, amount, paid_amount")
          .eq("branch_id", branchId),
      ]);

      const rows = (suppliers as Supplier[]) ?? [];
      const entries =
        (ledger as { supplier_id: string; type: string; amount: number; paid_amount: number }[]) ?? [];

      return rows.map((s) => {
        const mine = entries.filter((e) => e.supplier_id === s.id);
        const total_purchased = mine
          .filter((e) => e.type === "purchase")
          .reduce((a, e) => a + e.amount, 0);
        // Paid = old payment rows (legacy) + paid_amount tracked on invoice rows
        const legacy_paid = mine
          .filter((e) => e.type === "payment")
          .reduce((a, e) => a + e.amount, 0);
        const invoice_paid = mine
          .filter((e) => e.type === "purchase")
          .reduce((a, e) => a + Number(e.paid_amount), 0);
        const total_paid = legacy_paid + invoice_paid;
        return { supplier: s, total_purchased, total_paid, balance: total_purchased - total_paid };
      });
    },
    [`supplier-balances-${branchId}`],
    { tags: [supplierBalancesTag(branchId)], revalidate: 30 }
  );

  return fetch();
}

// ─── P&L Report ───────────────────────────────────────────────────────────────
const PL_CAT_LABELS: Record<string, string> = {
  rent: "Rent", electricity: "Electricity", internet: "Internet",
  water: "Water", gas: "Gas", phone: "Phone", utilities: "Utilities", misc: "Misc",
};

export async function getPLReport(
  branchId: string,
  from: string,
  to: string
): Promise<PLReport> {
  const supabase = await createClient();

  const fetch = unstable_cache(
    async () => {
      const [
        { data: salesData,    error: salesErr },
        { data: expensesData, error: expErr },
        { data: ledgerAll,    error: ledgerErr },
        { data: suppliersData },
        { data: stockInData,  error: stockErr },
      ] = await Promise.all([
        supabase.from("dms_sales").select("total, quantity, product_id, sale_date, unit_cost").eq("branch_id", branchId).gte("sale_date", from).lte("sale_date", to),
        supabase.from("dms_expenses").select("id, amount, category, note").eq("branch_id", branchId).gte("expense_date", from).lte("expense_date", to).order("category").order("created_at"),
        supabase.from("dms_supplier_ledger").select("type, amount, paid_amount, supplier_id").eq("branch_id", branchId),
        supabase.from("dms_suppliers").select("id, name").eq("branch_id", branchId),
        supabase
          .from("dms_stock_movements")
          .select("product_id, quantity, unit_price, created_at")
          .eq("branch_id", branchId)
          .eq("type", "in")
          .order("created_at", { ascending: true }),
      ]);

      if (salesErr)  throw new Error(salesErr.message);
      if (expErr)    throw new Error(expErr.message);
      if (ledgerErr) throw new Error(ledgerErr.message);
      if (stockErr)  throw new Error(stockErr.message);

      const supplierName: Record<string, string> = {};
      (suppliersData ?? []).forEach((s: { id: string; name: string }) => { supplierName[s.id] = s.name; });

      // Products → cost + supplier + name
      const productIds = [...new Set((salesData ?? []).map((s: { product_id: string }) => s.product_id))];
      const productMap: Record<string, { name: string; cost_price: number; supplier_id: string | null }> = {};
      if (productIds.length > 0) {
        const { data: prods } = await supabase.from("dms_products").select("id, name, cost_price, supplier_id").eq("branch_id", branchId).in("id", productIds);
        (prods ?? []).forEach((p: { id: string; name: string; cost_price: number; supplier_id: string | null }) => {
          productMap[p.id] = { name: p.name, cost_price: p.cost_price, supplier_id: p.supplier_id };
        });
      }

      const sales    = (salesData ?? [])    as { total: number; quantity: number; product_id: string; sale_date: string; unit_cost: number | null }[];
      const expenses = (expensesData ?? []) as { id: string; amount: number; category: string; note: string | null }[];

      // FIFO COGS
      type FifoBatch = { remaining: number; unitPrice: number };
      const stockIn = (stockInData ?? []) as { product_id: string; quantity: number; unit_price: number | null; created_at: string }[];

      const batchQueues: Record<string, FifoBatch[]> = {};
      for (const m of stockIn) {
        if (!batchQueues[m.product_id]) batchQueues[m.product_id] = [];
        const price = m.unit_price != null ? m.unit_price : (productMap[m.product_id]?.cost_price ?? 0);
        batchQueues[m.product_id].push({ remaining: m.quantity, unitPrice: price });
      }

      const fifoQueues: Record<string, FifoBatch[]> = {};
      for (const pid of Object.keys(batchQueues)) {
        fifoQueues[pid] = batchQueues[pid].map((b) => ({ ...b }));
      }

      const fifoCogsByProduct: Record<string, number> = {};
      const sortedSales = [...sales].sort((a, b) => a.sale_date.localeCompare(b.sale_date));
      for (const sale of sortedSales) {
        let saleCogs = 0;
        if (sale.unit_cost != null) {
          // Sale was recorded with an explicit batch cost — use it directly
          saleCogs = sale.quantity * sale.unit_cost;
          // Still consume from FIFO queues to keep batch tracking consistent for later sales
          let toConsume = sale.quantity;
          const queue = fifoQueues[sale.product_id] ?? [];
          for (const batch of queue) {
            if (toConsume <= 0) break;
            const consumed = Math.min(batch.remaining, toConsume);
            batch.remaining -= consumed;
            toConsume -= consumed;
          }
        } else {
          // Older sale (no stored cost) — fall back to FIFO
          let toConsume = sale.quantity;
          const queue = fifoQueues[sale.product_id] ?? [];
          for (const batch of queue) {
            if (toConsume <= 0) break;
            const consumed = Math.min(batch.remaining, toConsume);
            saleCogs += consumed * batch.unitPrice;
            batch.remaining -= consumed;
            toConsume -= consumed;
          }
          if (toConsume > 0) {
            saleCogs += toConsume * (productMap[sale.product_id]?.cost_price ?? 0);
          }
        }
        fifoCogsByProduct[sale.product_id] = (fifoCogsByProduct[sale.product_id] ?? 0) + saleCogs;
      }

      // Per-product revenue + units (for product performance section)
      const revenueByProduct: Record<string, number> = {};
      const unitsByProduct:   Record<string, number> = {};
      for (const sale of sales) {
        revenueByProduct[sale.product_id] = (revenueByProduct[sale.product_id] ?? 0) + (sale.total ?? 0);
        unitsByProduct[sale.product_id]   = (unitsByProduct[sale.product_id]   ?? 0) + sale.quantity;
      }

      const product_rows: ProductRow[] = productIds
        .map((pid) => {
          const revenue     = revenueByProduct[pid] ?? 0;
          const cogs        = fifoCogsByProduct[pid] ?? 0;
          const gross_profit = revenue - cogs;
          const margin_pct  = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
          return {
            name:        productMap[pid]?.name ?? "Unknown Product",
            units_sold:  unitsByProduct[pid] ?? 0,
            revenue,
            cogs,
            gross_profit,
            margin_pct,
          };
        })
        .filter((p) => p.revenue > 0)
        .sort((a, b) => b.gross_profit - a.gross_profit);

      // Core numbers
      const total_sales    = sales.reduce((a, s) => a + (s.total ?? 0), 0);
      const total_cogs     = Object.values(fifoCogsByProduct).reduce((a: number, v: number) => a + v, 0);
      const gross_profit   = total_sales - total_cogs;
      const total_expenses = expenses.reduce((a, e) => a + Number(e.amount), 0);
      const net_profit     = gross_profit - total_expenses;
      const margin_pct     = total_sales > 0 ? (net_profit / total_sales) * 100 : 0;

      // COGS by supplier (sub-rows under Product Cost)
      const cogsMap: Record<string, { name: string; amount: number }> = {};
      for (const [pid, cogs] of Object.entries(fifoCogsByProduct)) {
        if (!cogs) continue;
        const prod = productMap[pid];
        const sid  = prod?.supplier_id ?? "__none__";
        const name = sid === "__none__" ? "No Supplier" : (supplierName[sid] ?? "Unknown");
        cogsMap[sid] = { name, amount: (cogsMap[sid]?.amount ?? 0) + cogs };
      }

      // Build cost_rows: Product Cost (with supplier breakdown) + expense categories
      const cost_rows: CostRow[] = [];

      // Product cost
      if ((total_cogs as number) > 0) {
        cost_rows.push({ label: "Product Cost", amount: total_cogs as number });
        Object.values(cogsMap)
          .sort((a, b) => b.amount - a.amount)
          .forEach((c) => cost_rows.push({ label: `  ${c.name}`, amount: c.amount }));
      }

      // Salary — each employee separately
      const salaries = expenses.filter((e) => e.category === "salary");
      if (salaries.length > 0) {
        const total = salaries.reduce((a, e) => a + Number(e.amount), 0);
        cost_rows.push({ label: "Staff Salaries", amount: total });
        salaries.forEach((e) => cost_rows.push({ label: `  ${e.note ?? "Staff"}`, amount: Number(e.amount) }));
      }

      // Utility categories (rent, electricity, etc.)
      const CAT_ORDER = ["rent", "electricity", "gas", "water", "internet", "phone", "utilities"];
      const utilMap: Record<string, number> = {};
      expenses.filter((e) => !["salary", "misc"].includes(e.category))
        .forEach((e) => { utilMap[e.category] = (utilMap[e.category] ?? 0) + Number(e.amount); });

      CAT_ORDER.forEach((cat) => {
        if (utilMap[cat]) cost_rows.push({ label: PL_CAT_LABELS[cat], amount: utilMap[cat] });
      });
      // Any extra categories not in the predefined order
      Object.entries(utilMap).filter(([cat]) => !CAT_ORDER.includes(cat))
        .forEach(([cat, amt]) => cost_rows.push({ label: PL_CAT_LABELS[cat] ?? cat, amount: amt }));

      // Misc — each entry separately
      const miscs = expenses.filter((e) => e.category === "misc");
      if (miscs.length > 0) {
        const total = miscs.reduce((a, e) => a + Number(e.amount), 0);
        cost_rows.push({ label: "Miscellaneous", amount: total });
        miscs.forEach((e) => cost_rows.push({ label: `  ${e.note ?? "Misc"}`, amount: Number(e.amount) }));
      }

      // All-time supplier payables
      // New invoices: paid_amount on the purchase row (updated by dms_supplier_payments)
      // Legacy:       separate type:"payment" rows
      const payMap: Record<string, { name: string; purchased: number; paid: number }> = {};
      (ledgerAll ?? []).forEach((e: { type: string; amount: number; paid_amount: number | null; supplier_id: string }) => {
        const name = supplierName[e.supplier_id] ?? "Unknown";
        if (!payMap[e.supplier_id]) payMap[e.supplier_id] = { name, purchased: 0, paid: 0 };
        if (e.type === "purchase") {
          payMap[e.supplier_id].purchased += Number(e.amount);
          payMap[e.supplier_id].paid      += Number(e.paid_amount ?? 0);
        }
        if (e.type === "payment") {
          payMap[e.supplier_id].paid      += Number(e.amount);
        }
      });
      const supplier_payables = Object.values(payMap)
        .map((p) => ({ name: p.name, balance: p.purchased - p.paid }))
        .filter((p) => p.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      return {
        total_sales, total_cogs: total_cogs as number, total_expenses,
        gross_profit, net_profit, margin_pct, cost_rows, supplier_payables, product_rows,
      };
    },
    [`pl-report-${branchId}-${from}-${to}`],
    { tags: [plReportTag(branchId)], revalidate: 60 }
  );

  return fetch();
}
