"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Printer, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { useBranchContext } from "@/contexts/branch-context";
import { useShopContext } from "@/contexts/shop-context";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostRow    { label: string; amount: number; sub?: string; }
interface PayableRow { name: string; balance: number; }
interface ProductRow {
  name:        string;
  units_sold:  number;
  revenue:     number;
  cogs:        number;
  gross_profit: number;
  margin_pct:  number;
}

interface PLData {
  total_sales:       number;
  total_cogs:        number;
  total_expenses:    number;
  gross_profit:      number;
  net_profit:        number;
  margin_pct:        number;
  cost_rows:         CostRow[];
  supplier_payables: PayableRow[];
  product_rows:      ProductRow[];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function loadPL(branchId: string, from: string, to: string): Promise<PLData> {
  const supabase = createClient();

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

  return { total_sales, total_cogs: total_cogs as number, total_expenses, gross_profit, net_profit, margin_pct, cost_rows, supplier_payables, product_rows };
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
const startOfYear   = () => { const d = new Date(); return toDateStr(new Date(d.getFullYear(), 0, 1)); };

type Preset = "today" | "week" | "month" | "year" | "custom";

// ─── Report render ────────────────────────────────────────────────────────────

function marginColor(pct: number) {
  if (pct >= 30) return "text-emerald-400";
  if (pct >= 15) return "text-amber";
  return "text-red-400";
}

function PLReport({ data }: { data: PLData }) {
  const { total_sales, total_cogs, total_expenses, gross_profit, net_profit, margin_pct, cost_rows, supplier_payables, product_rows } = data;

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

  const isProfit     = safe(net_profit) >= 0;
  const gpPositive   = safe(gross_profit) >= 0;
  const totalOwed    = supplier_payables.reduce((a, p) => a + p.balance, 0);

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

      {/* ── Income Statement Waterfall ── */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-sidebar-border bg-muted/10">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Income Statement</p>
        </div>
        <div className="divide-y divide-sidebar-border/50">

          {/* Revenue */}
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Revenue</p>
            <p className="text-sm font-semibold tabular-nums">{fmt(total_sales)}</p>
          </div>

          {/* COGS */}
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-muted-foreground">(−) Cost of Goods Sold</p>
            <p className="text-sm tabular-nums text-muted-foreground">{fmt(total_cogs)}</p>
          </div>

          {/* Gross Profit */}
          <div className={`flex items-center justify-between px-4 py-3 ${gpPositive ? "bg-emerald-500/[0.06]" : "bg-red-500/[0.06]"}`}>
            <p className={`text-sm font-bold ${gpPositive ? "text-emerald-400" : "text-red-400"}`}>= Gross Profit</p>
            <p className={`text-sm font-bold tabular-nums ${gpPositive ? "text-emerald-400" : "text-red-400"}`}>{fmt(gross_profit)}</p>
          </div>

          {/* Expenses */}
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-muted-foreground">(−) Expenses</p>
            <p className="text-sm tabular-nums text-muted-foreground">{fmt(total_expenses)}</p>
          </div>

          {/* Net Profit */}
          <div className={`flex items-center justify-between px-4 py-3 ${isProfit ? "bg-emerald-500/[0.06]" : "bg-red-500/[0.06]"}`}>
            <p className={`text-sm font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>= Net Profit</p>
            <p className={`text-sm font-bold tabular-nums ${isProfit ? "text-emerald-400" : "text-red-400"}`}>{fmt(net_profit)}</p>
          </div>

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

      {/* ── Product Performance ── */}
      {product_rows.length > 0 && (
        <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sidebar-border bg-muted/10 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product Performance</p>
            <p className="text-xs text-muted-foreground">{product_rows.length} product{product_rows.length !== 1 ? "s" : ""}</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-sidebar-border/40 bg-muted/5">
                <th className="px-4 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Product</th>
                <th className="px-4 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Revenue</th>
                <th className="px-4 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Cost</th>
                <th className="px-4 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sidebar-border/40">
              {product_rows.map((p, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{p.units_sold} unit{p.units_sold !== 1 ? "s" : ""}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className={`text-xs font-semibold ${marginColor(p.margin_pct)}`}>
                        {safe(p.margin_pct).toFixed(1)}% margin
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">{fmt(p.revenue)}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">{fmt(p.cogs)}</td>
                  <td className={`px-4 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap ${p.gross_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmt(p.gross_profit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-sidebar-border bg-muted/10">
                <td className="px-4 py-2.5 text-sm font-bold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right text-xs tabular-nums font-semibold whitespace-nowrap">{fmt(total_sales)}</td>
                <td className="px-4 py-2.5 text-right text-xs tabular-nums font-semibold whitespace-nowrap">{fmt(total_cogs)}</td>
                <td className={`px-4 py-2.5 text-right text-sm font-bold tabular-nums whitespace-nowrap ${gross_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmt(gross_profit)}
                </td>
              </tr>
            </tfoot>
          </table>
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

async function downloadPlPdf(pl: PLData, shopName: string, branchName: string) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 20;
  const INK: [number, number, number] = [15, 23, 42];
  const MUTED: [number, number, number] = [100, 116, 139];
  const GREEN: [number, number, number] = [34, 197, 94];
  const RED: [number, number, number] = [239, 68, 68];
  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...INK);
  doc.text("Profit & Loss Report", M, 22);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(`${shopName} — ${branchName}`, M, 30);
  doc.text("Generated: " + new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" }), M, 36);
  doc.setDrawColor(215, 215, 222); doc.setLineWidth(0.3); doc.line(M, 40, 190, 40);

  let y = 52;
  function row(label: string, value: string, color?: [number, number, number]) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
    doc.text(label, M, y);
    if (color) doc.setTextColor(...color); else doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text("PKR " + value, 190, y, { align: "right" });
    doc.setTextColor(...MUTED); doc.setLineWidth(0.2); doc.line(M, y + 3, 190, y + 3);
    y += 14;
  }
  row("Total Sales", fmt(pl.total_sales));
  row("Cost of Goods Sold", fmt(pl.total_cogs));
  row("Gross Profit", fmt(pl.gross_profit), pl.gross_profit >= 0 ? GREEN : RED);
  row("Total Expenses", fmt(pl.total_expenses));
  y += 4;
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.setTextColor(...(pl.net_profit >= 0 ? GREEN : RED));
  doc.text("Net Profit: PKR " + fmt(pl.net_profit), M, y);
  doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED);
  doc.text(`Margin: ${pl.margin_pct.toFixed(1)}%`, M, y + 9);

  doc.save(`pl-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function PLReportClient() {
  const { branchId, branch } = useBranchContext();
  const { shop } = useShopContext();

  const [preset, setPreset]       = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(startOfMonth());
  const [customTo, setCustomTo]   = useState(todayStr());
  const [loading, setLoading]     = useState(false);
  const [report, setReport]       = useState<PLData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq     = useRef(0);

  function rangeFor(p: Preset) {
    const today = todayStr();
    if (p === "today") return { from: today, to: today };
    if (p === "week")  return { from: startOfWeek(), to: today };
    if (p === "month") return { from: startOfMonth(), to: today };
    if (p === "year")  return { from: startOfYear(), to: today };
    return { from: customFrom, to: customTo };
  }

  const load = useCallback(async (from: string, to: string) => {
    if (!branchId) return;
    const seq = ++loadSeq.current;
    setLoading(true); setError(null);
    try {
      const result = await loadPL(branchId, from, to);
      if (seq !== loadSeq.current) return; // stale — a newer load superseded this one
      setReport(result);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [branchId]);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p === "custom") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { const { from, to } = rangeFor(p); load(from, to); }, 150);
  }

  useEffect(() => {
    if (branchId) { const { from, to } = rangeFor("month"); load(from, to); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "today",  label: "Today" },
    { key: "week",   label: "This Week" },
    { key: "month",  label: "This Month" },
    { key: "year",   label: "This Year" },
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => report && downloadPlPdf(report, shop?.shop_name ?? "Shop", branch?.name ?? "Branch")}
            disabled={!report || loading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            PDF
          </button>
          <button
            onClick={() => window.print()}
            disabled={!report || loading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
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
