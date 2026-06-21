"use client";

import { useState, useTransition } from "react";
import { getInsightsData } from "@/app/actions/insights";
import type { InsightsData } from "@/app/actions/insights";
import {
  TrendingUp, ShoppingCart, Package, CreditCard, Banknote,
  Users, Calendar, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPKR(n: number) {
  return `PKR ${n.toLocaleString("en-PK")}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function startOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
      {children}
    </p>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-sidebar-border bg-card", className)}>
      {children}
    </div>
  );
}

function ProgressBar({
  pct,
  colorClass = "bg-amber-500/70",
}: {
  pct: number;
  colorClass?: string;
}) {
  return (
    <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

// ─── Summary Bar ─────────────────────────────────────────────────────────────

function SummaryBar({ data }: { data: InsightsData }) {
  const metrics = [
    {
      label: "Total Revenue",
      value: formatPKR(data.totalRevenue),
      icon: TrendingUp,
      amber: true,
    },
    {
      label: "Total Transactions",
      value: data.totalTransactions.toLocaleString("en-PK"),
      icon: ShoppingCart,
      amber: false,
    },
    {
      label: "Avg Transaction",
      value: formatPKR(Math.round(data.avgTransactionValue)),
      icon: CreditCard,
      amber: true,
    },
    {
      label: "Unique Products Sold",
      value: data.uniqueProductsSold.toLocaleString("en-PK"),
      icon: Package,
      amber: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <Card key={m.label} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1.5">{m.label}</p>
              <p
                className={cn(
                  "text-xl font-bold truncate",
                  m.amber ? "text-amber-400" : "text-foreground"
                )}
              >
                {m.value}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Product Performance ──────────────────────────────────────────────────────

function ProductPerformance({ data }: { data: InsightsData }) {
  const topRevenue = data.topProducts[0]?.revenue ?? 1;

  return (
    <Card className="p-6">
      <SectionHeader>Product Performance</SectionHeader>

      {data.topProducts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No product data for this period.</p>
      ) : (
        <div className="space-y-3">
          {data.topProducts.map((p, i) => {
            const pct = (p.revenue / topRevenue) * 100;
            const isTop3 = i < 3;
            return (
              <div
                key={p.productId}
                className={cn(
                  "rounded-lg p-3 transition-colors",
                  isTop3 ? "bg-green-500/5 border border-green-500/15" : "bg-muted/10"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      isTop3
                        ? "bg-green-500/20 text-green-400"
                        : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground truncate">
                    {p.productName}
                  </span>
                  <span className="text-amber-400 font-semibold text-sm shrink-0">
                    {formatPKR(p.revenue)}
                  </span>
                </div>
                <div className="pl-9 space-y-1.5">
                  <ProgressBar pct={pct} colorClass="bg-amber-500/70" />
                  <p className="text-xs text-muted-foreground">
                    {p.unitsSold.toLocaleString("en-PK")} units sold
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.bottomProducts.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mb-3">
            Least Performing
          </p>
          <div className="space-y-2">
            {data.bottomProducts.map((p) => (
              <div
                key={p.productId}
                className="rounded-lg p-3 bg-red-500/5 border border-red-500/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground truncate">
                    {p.productName}
                  </span>
                  <span className="text-amber-400 font-semibold text-sm shrink-0">
                    {formatPKR(p.revenue)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.unitsSold.toLocaleString("en-PK")} units sold
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Staff Performance ────────────────────────────────────────────────────────

function StaffPerformance({ data }: { data: InsightsData }) {
  if (data.staffPerformance.length === 0) return null;

  const topRevenue = data.staffPerformance[0]?.revenue ?? 1;

  return (
    <Card className="p-6">
      <SectionHeader>Staff Performance</SectionHeader>
      <div className="space-y-3">
        {data.staffPerformance.map((s, i) => {
          const pct = (s.revenue / topRevenue) * 100;
          return (
            <div key={s.name} className="rounded-lg p-3 bg-muted/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.transactions} txn · avg{" "}
                    <span className="text-amber-400 font-medium">
                      {formatPKR(Math.round(s.avgPerTransaction))}
                    </span>
                  </p>
                </div>
                <span className="text-amber-400 font-semibold text-sm shrink-0">
                  {formatPKR(s.revenue)}
                </span>
              </div>
              <div className="pl-10">
                <ProgressBar pct={pct} colorClass="bg-blue-500/70" />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Payment Mode Breakdown ───────────────────────────────────────────────────

function PaymentBreakdown({ data }: { data: InsightsData }) {
  const totalTxns = data.paymentModes.reduce((s, m) => s + m.count, 0);
  const totalRev = data.paymentModes.reduce((s, m) => s + m.revenue, 0);

  return (
    <Card className="p-6">
      <SectionHeader>Payment Mode Breakdown</SectionHeader>
      <div className="space-y-4">
        {data.paymentModes.map((m) => {
          const countPct = totalTxns > 0 ? (m.count / totalTxns) * 100 : 0;
          const revPct = totalRev > 0 ? (m.revenue / totalRev) * 100 : 0;
          const isCash = m.mode === "cash";

          return (
            <div key={m.mode} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isCash ? (
                    <Banknote className="w-4 h-4 text-green-400" />
                  ) : (
                    <CreditCard className="w-4 h-4 text-blue-400" />
                  )}
                  <span className="text-sm font-medium capitalize text-foreground">
                    {m.mode}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-amber-400 font-semibold text-sm">
                    {formatPKR(m.revenue)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({revPct.toFixed(0)}%)
                  </span>
                </div>
              </div>
              <ProgressBar
                pct={revPct}
                colorClass={isCash ? "bg-green-500/70" : "bg-blue-500/70"}
              />
              <p className="text-xs text-muted-foreground">
                {m.count.toLocaleString("en-PK")} transactions ·{" "}
                {countPct.toFixed(0)}% of total
              </p>
            </div>
          );
        })}
        {data.paymentModes.every((m) => m.count === 0) && (
          <p className="text-sm text-muted-foreground">No payment data for this period.</p>
        )}
      </div>
    </Card>
  );
}

// ─── Date Filter ──────────────────────────────────────────────────────────────

type Preset = "today" | "week" | "month" | "custom";

interface DateFilterProps {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  isPending: boolean;
}

function DateFilter({ from, to, onApply, isPending }: DateFilterProps) {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p === "today") {
      const d = todayStr();
      onApply(d, d);
    } else if (p === "week") {
      onApply(startOfWeekStr(), todayStr());
    } else if (p === "month") {
      onApply(startOfMonthStr(), todayStr());
    }
    // custom: wait for manual apply
  }

  function handleCustomApply() {
    if (customFrom && customTo && customFrom <= customTo) {
      onApply(customFrom, customTo);
    }
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
      {presets.map((p) => (
        <button
          key={p.key}
          onClick={() => handlePreset(p.key)}
          disabled={isPending}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            preset === p.key
              ? "bg-primary/15 text-primary border border-primary/25"
              : "bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground border border-transparent"
          )}
        >
          {p.label}
        </button>
      ))}

      {preset === "custom" && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2 py-1 rounded-lg bg-muted/20 border border-sidebar-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2 py-1 rounded-lg bg-muted/20 border border-sidebar-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={handleCustomApply}
            disabled={isPending || !customFrom || !customTo || customFrom > customTo}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      {isPending && (
        <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-xl bg-muted/30 flex items-center justify-center mb-4">
        <TrendingUp className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground mb-1">No data for this period</p>
      <p className="text-sm text-muted-foreground">
        Try selecting a different date range to see insights.
      </p>
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────

interface InsightsClientProps {
  initialData: InsightsData | null;
  initialError?: string;
  initialFrom: string;
  initialTo: string;
}

export function InsightsClient({
  initialData,
  initialError,
  initialFrom,
  initialTo,
}: InsightsClientProps) {
  const [data, setData] = useState<InsightsData | null>(initialData);
  const [error, setError] = useState<string | undefined>(initialError);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [isPending, startTransition] = useTransition();

  function handleDateChange(newFrom: string, newTo: string) {
    setFrom(newFrom);
    setTo(newTo);
    startTransition(async () => {
      const result = await getInsightsData(newFrom, newTo);
      setData(result.data);
      setError(result.error);
    });
  }

  const hasData =
    data &&
    (data.totalTransactions > 0 ||
      data.topProducts.length > 0 ||
      data.staffPerformance.length > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Insights</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Business analytics &amp; decision metrics
          </p>
        </div>
        <DateFilter
          from={from}
          to={to}
          onApply={handleDateChange}
          isPending={isPending}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading skeleton overlay */}
      {isPending && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-muted/30 rounded-xl h-24" />
          ))}
        </div>
      )}

      {/* Content */}
      {!isPending && !hasData && !error && <EmptyState />}

      {!isPending && hasData && data && (
        <>
          {/* Summary Bar */}
          <SummaryBar data={data} />

          {/* Main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProductPerformance data={data} />
            <div className="space-y-6">
              <StaffPerformance data={data} />
              <PaymentBreakdown data={data} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
