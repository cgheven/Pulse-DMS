"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  BarChart3,
  Printer,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/contexts/shop-context";
import { createClient } from "@/lib/supabase/client";
import type { PLReport } from "@/types";

// ─── Client-side P&L fetch ────────────────────────────────────────────────────

async function fetchPLReport(shopId: string, from: string, to: string): Promise<PLReport> {
  const supabase = createClient();

  const [{ data: sales }, { data: expenses }] = await Promise.all([
    supabase
      .from("dms_sales")
      .select("total, quantity, product_id")
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
    (prods ?? []).forEach((p: { id: string; cost_price: number }) => {
      costMap[p.id] = p.cost_price;
    });
  }

  const salesRows = (sales ?? []) as { total: number; quantity: number; product_id: string }[];
  const expenseRows = (expenses ?? []) as { amount: number; category: string }[];

  const total_sales    = salesRows.reduce((a, s) => a + (s.total ?? 0), 0);
  const total_cogs     = salesRows.reduce((a, s) => a + s.quantity * (costMap[s.product_id] ?? 0), 0);
  const gross_profit   = total_sales - total_cogs;
  const total_expenses = expenseRows.reduce((a, e) => a + (e.amount ?? 0), 0);
  const net_profit     = gross_profit - total_expenses;
  const margin_pct     = total_sales > 0 ? (net_profit / total_sales) * 100 : 0;

  const catMap: Record<string, number> = {};
  expenseRows.forEach((e) => { catMap[e.category] = (catMap[e.category] ?? 0) + e.amount; });
  const expense_breakdown = Object.entries(catMap).map(([category, amount]) => ({ category, amount }));

  return { total_sales, total_cogs, gross_profit, total_expenses, net_profit, margin_pct, expense_breakdown };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPKR(amount: number): string {
  const safe = isNaN(amount) || !isFinite(amount) ? 0 : amount;
  return `PKR ${safe.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPct(pct: number): string {
  const safe = isNaN(pct) || !isFinite(pct) ? 0 : pct;
  return `${safe.toFixed(1)}%`;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return toDateString(new Date());
}

function startOfWeekStr(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  return toDateString(d);
}

function startOfMonthStr(): string {
  const d = new Date();
  d.setDate(1);
  return toDateString(d);
}

function displayRange(from: string, to: string): string {
  if (from === to) return from;
  return `${from} to ${to}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Preset = "today" | "week" | "month" | "custom";

interface DateRange {
  from: string;
  to: string;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-xl border border-sidebar-border bg-card p-6 space-y-4">
        <div className="h-5 w-48 bg-muted rounded" />
        <div className="h-4 w-32 bg-muted rounded" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-sidebar-border bg-card p-6 space-y-3">
        <div className="h-4 w-36 bg-muted rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-xl border border-sidebar-border bg-card p-12 flex flex-col items-center justify-center text-center gap-3">
      <AlertCircle className="w-10 h-10 text-muted-foreground/40" />
      <p className="text-muted-foreground font-medium">No data for this period.</p>
      <p className="text-sm text-muted-foreground/70">Try a different date range.</p>
    </div>
  );
}

// ─── P&L Table ───────────────────────────────────────────────────────────────

interface PLTableProps {
  report: PLReport;
  range: DateRange;
}

function PLTable({ report, range }: PLTableProps) {
  const {
    total_sales,
    total_cogs,
    gross_profit,
    total_expenses,
    net_profit,
    margin_pct,
    expense_breakdown,
  } = report;

  const safe = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : n);

  const grossColor =
    safe(gross_profit) >= 0 ? "text-green-400" : "text-red-400";
  const netColor =
    safe(net_profit) >= 0 ? "text-green-400" : "text-red-400";
  const NetIcon = safe(net_profit) >= 0 ? TrendingUp : TrendingDown;

  const generatedOn = new Date().toLocaleDateString("en-PK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const isEmpty =
    total_sales === 0 &&
    total_cogs === 0 &&
    total_expenses === 0;

  if (isEmpty) return <EmptyState />;

  return (
    <div className="space-y-4">
      {/* ── Main P&L Card ── */}
      <div className="rounded-xl border border-sidebar-border bg-card p-6 space-y-1 print:border-none print:shadow-none">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-5">
          <div>
            <h2 className="text-lg font-semibold">
              P&amp;L Report:{" "}
              <span className="text-muted-foreground font-normal text-base">
                {displayRange(range.from, range.to)}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generated on {generatedOn}
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 w-fit">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wide">
              Profit &amp; Loss
            </span>
          </div>
        </div>

        {/* Rows */}
        <div className="space-y-0">
          {/* Total Sales Revenue */}
          <div className="flex items-center justify-between py-2.5 border-b border-border/40">
            <span className="text-sm text-foreground">Total Sales Revenue</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatPKR(safe(total_sales))}
            </span>
          </div>

          {/* COGS */}
          <div className="flex items-center justify-between py-2.5 border-b border-border/40">
            <span className="text-sm text-muted-foreground">
              Cost of Goods Sold (COGS)
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              ({formatPKR(safe(total_cogs))})
            </span>
          </div>

          {/* Divider */}
          <div className="py-1">
            <div className="border-t border-border" />
          </div>

          {/* Gross Profit */}
          <div className="flex items-center justify-between py-2.5 border-b border-border/40">
            <span className={`text-sm font-bold uppercase tracking-wide ${grossColor}`}>
              Gross Profit
            </span>
            <span className={`text-sm font-bold tabular-nums ${grossColor}`}>
              {formatPKR(safe(gross_profit))}
            </span>
          </div>

          {/* Total Expenses */}
          <div className="flex items-center justify-between py-2.5 border-b border-border/40">
            <span className="text-sm text-muted-foreground">Total Expenses</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              ({formatPKR(safe(total_expenses))})
            </span>
          </div>

          {/* Divider */}
          <div className="py-1">
            <div className="border-t border-border" />
          </div>

          {/* Net Profit */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2">
              <NetIcon className={`w-4 h-4 ${netColor}`} />
              <span className={`text-base font-bold uppercase tracking-wide ${netColor}`}>
                Net Profit
              </span>
            </div>
            <span className={`text-base font-bold tabular-nums ${netColor}`}>
              {formatPKR(safe(net_profit))}
            </span>
          </div>

          {/* Margin */}
          <div className="flex items-center justify-between py-1.5 pl-6">
            <span className="text-xs text-muted-foreground">Profit Margin</span>
            <span className={`text-xs font-semibold tabular-nums ${netColor}`}>
              {formatPct(safe(margin_pct))}
            </span>
          </div>
        </div>
      </div>

      {/* ── Expense Breakdown ── */}
      {expense_breakdown.length > 0 && (
        <div className="rounded-xl border border-sidebar-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Expense Breakdown
            </h3>
          </div>
          <div className="space-y-2">
            {expense_breakdown.map(({ category, amount }) => (
              <div
                key={category}
                className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0"
              >
                <span className="text-sm text-foreground capitalize">
                  {capitalize(category)}
                </span>
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {formatPKR(safe(amount))}
                </span>
              </div>
            ))}
            {/* Total row */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-bold tabular-nums">
                {formatPKR(safe(total_expenses))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function PLReportClient() {
  const { shopId } = useShopContext();

  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(startOfMonthStr());
  const [customTo, setCustomTo] = useState(todayStr());

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PLReport | null>(null);
  const [activeRange, setActiveRange] = useState<DateRange | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounce timer ref for custom range auto-fetch (not used for custom — manual only)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rangeForPreset = useCallback(
    (p: Preset): DateRange => {
      const today = todayStr();
      if (p === "today") return { from: today, to: today };
      if (p === "week") return { from: startOfWeekStr(), to: today };
      if (p === "month") return { from: startOfMonthStr(), to: today };
      // custom
      return { from: customFrom, to: customTo };
    },
    [customFrom, customTo]
  );

  const fetchReport = useCallback(
    async (range: DateRange) => {
      if (!shopId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPLReport(shopId, range.from, range.to);
        setReport(data);
        setActiveRange(range);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report.");
      } finally {
        setLoading(false);
      }
    },
    [shopId]
  );

  // Auto-fetch on preset click (debounced so rapid clicks don't spam)
  const handlePresetClick = useCallback(
    (p: Preset) => {
      setPreset(p);
      if (p === "custom") return; // custom waits for Generate button
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchReport(rangeForPreset(p));
      }, 150);
    },
    [fetchReport, rangeForPreset]
  );

  // Load "This Month" on mount
  useEffect(() => {
    if (shopId) {
      fetchReport(rangeForPreset("month"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  function handleGenerate() {
    const range =
      preset === "custom"
        ? { from: customFrom, to: customTo }
        : rangeForPreset(preset);
    fetchReport(range);
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>

      <div className="space-y-6">
        {/* ── Page Header ── */}
        <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              P&amp;L Report
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Profit &amp; loss summary for your selected period
            </p>
          </div>
          {/* Print button */}
          <Button
            variant="outline"
            className="gap-2 w-full sm:w-auto no-print"
            onClick={() => window.print()}
            disabled={!report || loading}
          >
            <Printer className="w-4 h-4" />
            Print Report
          </Button>
        </div>

        {/* ── Date Range Selector ── */}
        <div className="no-print rounded-xl border border-sidebar-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Date Range</span>
          </div>

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-2">
            {presets.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePresetClick(key)}
                className={[
                  "px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all",
                  preset === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 bg-transparent",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {preset === "custom" && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs text-muted-foreground w-8">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex h-9 w-full sm:w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs text-muted-foreground w-8">To</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayStr()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex h-9 w-full sm:w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <Button onClick={handleGenerate} disabled={loading} className="w-full sm:w-auto">
                {loading ? "Generating..." : "Generate Report"}
              </Button>
            </div>
          )}
        </div>

        {/* ── Report Content ── */}
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : report && activeRange ? (
          <PLTable report={report} range={activeRange} />
        ) : null}
      </div>
    </>
  );
}
