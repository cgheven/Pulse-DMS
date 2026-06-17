"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Printer, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { useShopContext } from "@/contexts/shop-context";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostRow    { label: string; amount: number; sub?: string; }
interface PayableRow { name: string; balance: number; }

interface PLData {
  total_sales:       number;
  total_cogs:        number;
  total_expenses:    number;
  gross_profit:      number;
  net_profit:        number;
  margin_pct:        number;
  cost_rows:         CostRow[];   // ordered breakdown for "where did money go?"
  supplier_payables: PayableRow[];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function loadPL(shopId: string, from: string, to: string): Promise<PLData> {
  const supabase = createClient();

  const [
    { data: salesData },
    { data: expensesData },
    { data: ledgerPeriod },
    { data: ledgerAll },
    { data: suppliersData },
  ] = await Promise.all([
    supabase.from("dms_sales").select("total, quantity, product_id").eq("shop_id", shopId).gte("sale_date", from).lte("sale_date", to),
    supabase.from("dms_expenses").select("id, amount, category, note").eq("shop_id", shopId).gte("expense_date", from).lte("expense_date", to).order("category").order("created_at"),
    supabase.from("dms_supplier_ledger").select("type, amount, supplier_id").eq("shop_id", shopId).gte("transaction_date", from).lte("transaction_date", to),
    supabase.from("dms_supplier_ledger").select("type, amount, supplier_id").eq("shop_id", shopId),
    supabase.from("dms_suppliers").select("id, name").eq("shop_id", shopId),
  ]);

  const supplierName: Record<string, string> = {};
  (suppliersData ?? []).forEach((s: { id: string; name: string }) => { supplierName[s.id] = s.name; });

  // Products → cost + supplier
  const productIds = [...new Set((salesData ?? []).map((s: { product_id: string }) => s.product_id))];
  const productMap: Record<string, { cost_price: number; supplier_id: string | null }> = {};
  if (productIds.length > 0) {
    const { data: prods } = await supabase.from("dms_products").select("id, cost_price, supplier_id").in("id", productIds);
    (prods ?? []).forEach((p: { id: string; cost_price: number; supplier_id: string | null }) => {
      productMap[p.id] = { cost_price: p.cost_price, supplier_id: p.supplier_id };
    });
  }

  const sales    = (salesData ?? [])    as { total: number; quantity: number; product_id: string }[];
  const expenses = (expensesData ?? []) as { id: string; amount: number; category: string; note: string | null }[];

  // Core numbers
  const total_sales    = sales.reduce((a, s) => a + (s.total ?? 0), 0);
  const total_cogs     = sales.reduce((a, s) => a + s.quantity * (productMap[s.product_id]?.cost_price ?? 0), 0);
  const gross_profit   = total_sales - total_cogs;
  const total_expenses = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const net_profit     = gross_profit - total_expenses;
  const margin_pct     = total_sales > 0 ? (net_profit / total_sales) * 100 : 0;

  // COGS by supplier (sub-rows under Product Cost)
  const cogsMap: Record<string, { name: string; amount: number }> = {};
  for (const s of sales) {
    const prod = productMap[s.product_id];
    const cogs = s.quantity * (prod?.cost_price ?? 0);
    if (!cogs) continue;
    const sid  = prod?.supplier_id ?? "__none__";
    const name = sid === "__none__" ? "No Supplier" : (supplierName[sid] ?? "Unknown");
    cogsMap[sid] = { name, amount: (cogsMap[sid]?.amount ?? 0) + cogs };
  }

  // Supplier activity in period → used as sub-label on Product Cost rows
  const actMap: Record<string, { purchased: number; paid: number }> = {};
  (ledgerPeriod ?? []).forEach((e: { type: string; amount: number; supplier_id: string }) => {
    if (!actMap[e.supplier_id]) actMap[e.supplier_id] = { purchased: 0, paid: 0 };
    if (e.type === "purchase") actMap[e.supplier_id].purchased += Number(e.amount);
    if (e.type === "payment")  actMap[e.supplier_id].paid      += Number(e.amount);
  });

  // Build cost_rows: Product Cost (with supplier breakdown) + expense categories
  const cost_rows: CostRow[] = [];

  // Product cost
  if (total_cogs > 0) {
    cost_rows.push({ label: "Product Cost", amount: total_cogs });
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
    if (utilMap[cat]) cost_rows.push({ label: CAT_LABELS[cat], amount: utilMap[cat] });
  });
  // Any extra categories not in the predefined order
  Object.entries(utilMap).filter(([cat]) => !CAT_ORDER.includes(cat))
    .forEach(([cat, amt]) => cost_rows.push({ label: CAT_LABELS[cat] ?? cat, amount: amt }));

  // Misc — each entry separately
  const miscs = expenses.filter((e) => e.category === "misc");
  if (miscs.length > 0) {
    const total = miscs.reduce((a, e) => a + Number(e.amount), 0);
    cost_rows.push({ label: "Miscellaneous", amount: total });
    miscs.forEach((e) => cost_rows.push({ label: `  ${e.note ?? "Misc"}`, amount: Number(e.amount) }));
  }

  // All-time supplier payables
  const payMap: Record<string, { name: string; purchased: number; paid: number }> = {};
  (ledgerAll ?? []).forEach((e: { type: string; amount: number; supplier_id: string }) => {
    const name = supplierName[e.supplier_id] ?? "Unknown";
    if (!payMap[e.supplier_id]) payMap[e.supplier_id] = { name, purchased: 0, paid: 0 };
    if (e.type === "purchase") payMap[e.supplier_id].purchased += Number(e.amount);
    if (e.type === "payment")  payMap[e.supplier_id].paid      += Number(e.amount);
  });
  const supplier_payables = Object.values(payMap)
    .map((p) => ({ name: p.name, balance: p.purchased - p.paid }))
    .filter((p) => p.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  return { total_sales, total_cogs, total_expenses, gross_profit, net_profit, margin_pct, cost_rows, supplier_payables };
}

const CAT_LABELS: Record<string, string> = {
  rent: "Rent", electricity: "Electricity", internet: "Internet",
  water: "Water", gas: "Gas", phone: "Phone", utilities: "Utilities", misc: "Misc",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safe(n: number) { return isNaN(n) || !isFinite(n) ? 0 : n; }
function fmt(n: number)  { return `PKR ${safe(n).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const todayStr      = () => toDateStr(new Date());
const startOfMonth  = () => { const d = new Date(); d.setDate(1); return toDateStr(d); };
const startOfWeek   = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return toDateStr(d); };

type Preset = "today" | "week" | "month" | "custom";

// ─── Report render ────────────────────────────────────────────────────────────

function PLReport({ data }: { data: PLData }) {
  const { total_sales, total_cogs, total_expenses, net_profit, margin_pct, cost_rows, supplier_payables } = data;

  const isEmpty = total_sales === 0 && total_cogs === 0 && total_expenses === 0;
  if (isEmpty) {
    return (
      <div className="rounded-xl border border-sidebar-border bg-card flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
        <AlertCircle className="w-8 h-8 opacity-20" />
        <p className="text-sm font-medium">No data for this period</p>
        <p className="text-xs opacity-60">Try selecting a different date range above</p>
      </div>
    );
  }

  const isProfit = safe(net_profit) >= 0;
  const totalOwed = supplier_payables.reduce((a, p) => a + p.balance, 0);

  return (
    <div className="space-y-3">

      {/* ── Hero: Net Profit ── */}
      <div className={`rounded-xl border-2 p-6 text-center ${isProfit ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-red-500/30 bg-red-500/[0.06]"}`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          {isProfit
            ? <TrendingUp className="w-5 h-5 text-emerald-400" />
            : <TrendingDown className="w-5 h-5 text-red-400" />
          }
          <p className={`text-sm font-semibold uppercase tracking-widest ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
            {isProfit ? "Net Profit" : "Net Loss"}
          </p>
        </div>
        <p className={`text-5xl font-bold tabular-nums leading-none ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
          {fmt(net_profit)}
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          {safe(margin_pct).toFixed(1)}% profit margin
          {" · "}
          {isProfit ? "You kept this after all costs" : "Costs exceeded your revenue"}
        </p>
      </div>

      {/* ── Summary: 3 numbers ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-sidebar-border bg-card p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Revenue</p>
          <p className="text-base font-bold tabular-nums leading-none">{fmt(total_sales)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">earned from sales</p>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-card p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Product Cost</p>
          <p className="text-base font-bold tabular-nums leading-none text-muted-foreground">{fmt(total_cogs)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">cost of goods sold</p>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-card p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Expenses</p>
          <p className="text-base font-bold tabular-nums leading-none text-muted-foreground">{fmt(total_expenses)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">running costs</p>
        </div>
      </div>

      {/* ── Cost Breakdown ── */}
      {cost_rows.length > 0 && (
        <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sidebar-border bg-muted/10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Where the money went</p>
          </div>
          <div className="divide-y divide-sidebar-border/40">
            {cost_rows.map((row, i) => {
              const isParent = !row.label.startsWith("  ");
              const isChild  =  row.label.startsWith("  ");
              return (
                <div key={i} className={`flex items-center justify-between px-4 py-2 ${isChild ? "bg-muted/5" : ""}`}>
                  <p className={isParent ? "text-sm font-semibold text-foreground" : "text-xs text-muted-foreground pl-3"}>
                    {row.label.trim()}
                  </p>
                  <p className={isParent ? "text-sm font-semibold tabular-nums" : "text-xs tabular-nums text-muted-foreground"}>
                    {fmt(row.amount)}
                  </p>
                </div>
              );
            })}
            {/* Total */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/10">
              <p className="text-sm font-bold text-foreground">Total Costs</p>
              <p className="text-sm font-bold tabular-nums">{fmt(safe(total_cogs) + safe(total_expenses))}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier Payables ── */}
      {supplier_payables.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-500/15 flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Owed to Suppliers</p>
            <p className="text-sm font-bold tabular-nums text-amber-400">{fmt(totalOwed)}</p>
          </div>
          <div className="divide-y divide-amber-500/10">
            {supplier_payables.map((p) => (
              <div key={p.name} className="flex items-center justify-between px-4 py-2">
                <p className="text-sm text-foreground">{p.name}</p>
                <p className="text-sm font-semibold tabular-nums text-amber-400">{fmt(p.balance)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-36 rounded-xl bg-muted" />
      <div className="grid grid-cols-3 gap-2">
        {[0,1,2].map(i => <div key={i} className="h-20 rounded-xl bg-muted" />)}
      </div>
      <div className="h-48 rounded-xl bg-muted" />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PLReportClient() {
  const { shopId } = useShopContext();

  const [preset, setPreset]       = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(startOfMonth());
  const [customTo, setCustomTo]   = useState(todayStr());
  const [loading, setLoading]     = useState(false);
  const [report, setReport]       = useState<PLData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function rangeFor(p: Preset) {
    const today = todayStr();
    if (p === "today") return { from: today, to: today };
    if (p === "week")  return { from: startOfWeek(), to: today };
    if (p === "month") return { from: startOfMonth(), to: today };
    return { from: customFrom, to: customTo };
  }

  const load = useCallback(async (from: string, to: string) => {
    if (!shopId) return;
    setLoading(true); setError(null);
    try { setReport(await loadPL(shopId, from, to)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load."); }
    finally { setLoading(false); }
  }, [shopId]);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p === "custom") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { const { from, to } = rangeFor(p); load(from, to); }, 150);
  }

  useEffect(() => {
    if (shopId) { const { from, to } = rangeFor("month"); load(from, to); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week",  label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">P&amp;L Report</h1>
          <p className="text-xs text-muted-foreground mt-0.5">How much did you make?</p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={!report || loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>
      </div>

      {/* Period selector */}
      <div className="rounded-xl border border-sidebar-border bg-card p-3 no-print space-y-3">
        <div className="flex items-center gap-0.5 bg-muted/20 rounded-lg p-0.5 w-fit">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePreset(key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                preset === key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">From</span>
            <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={customTo} min={customFrom} max={todayStr()} onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <button
              onClick={() => load(customFrom, customTo)}
              disabled={loading}
              className="h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Generate"}
            </button>
          </div>
        )}
      </div>

      {/* Report */}
      {loading ? <Skeleton /> : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      ) : report ? (
        <PLReport data={report} />
      ) : null}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
