"use client";

import { useState, useCallback, useRef } from "react";
import { Printer, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { useBranchContext } from "@/contexts/branch-context";
import { useShopContext } from "@/contexts/shop-context";
import { getPLReportData } from "@/app/actions/pl-report";
import type { PLReport as PLData } from "@/types";

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

interface PLReportClientProps {
  initialData: PLData | null;
  initialFrom: string;
  initialTo: string;
}

export function PLReportClient({ initialData, initialFrom, initialTo }: PLReportClientProps) {
  const { branch } = useBranchContext();
  const { shop } = useShopContext();

  const [preset, setPreset]       = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(initialFrom);
  const [customTo, setCustomTo]   = useState(initialTo);
  const [loading, setLoading]     = useState(false);
  const [report, setReport]       = useState<PLData | null>(initialData);
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

  // branchId is resolved server-side (never client-supplied) inside
  // getPLReportData() itself, via getAuthContext(). The initial render's data
  // already arrived as a prop from the server component (page.tsx) — this is
  // only invoked for user-driven range changes (preset click / custom apply).
  const load = useCallback(async (from: string, to: string) => {
    const seq = ++loadSeq.current;
    setLoading(true); setError(null);
    try {
      const result = await getPLReportData(from, to);
      if (seq !== loadSeq.current) return; // stale — a newer load superseded this one
      if (result.error) {
        setError(result.error);
        setReport(null);
      } else {
        setReport(result.data);
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p === "custom") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { const { from, to } = rangeFor(p); load(from, to); }, 150);
  }

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
