"use client";
import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  BarChart3, TrendingUp, TrendingDown, Users,
  AlertTriangle, Activity, UserCheck, UserX,
  Clock, Flame, ArrowUpRight, ArrowDownRight, CalendarRange,
  BadgePercent, HandCoins, Gift,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { RevenueMonth, AgingBucket, TrainerReportRow, TrainerFlowRow, MemberReportSummary, ExpiringMember, DiscountReport } from "@/types";

const RevenueChart = dynamic(() => import("./revenue-chart").then((m) => m.RevenueChart), {
  ssr: false, loading: () => <div className="h-[260px] animate-pulse bg-white/5 rounded-xl" />,
});
const ExpenseBreakdownChart = dynamic(() => import("./expense-breakdown-chart").then((m) => m.ExpenseBreakdownChart), {
  ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-white/5 rounded-xl" />,
});

interface Props {
  data: {
    gymId: string;
    revenueByMonth: RevenueMonth[];
    aging: { d30: AgingBucket; d60: AgingBucket; d90: AgingBucket; d90plus: AgingBucket };
    trainerRows: TrainerReportRow[];
    trainerFlow: TrainerFlowRow[];
    memberSummary: MemberReportSummary;
    discounts?: DiscountReport;
    totalCapacity?: number;
  } | null;
}

type RangePreset = "1" | "3" | "6" | "12" | "custom";

export function ReportsClient({ data }: Props) {
  const [preset, setPreset]       = useState<RangePreset>("6");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [flowMonth, setFlowMonth]   = useState<string>("");

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-2 text-muted-foreground">
        <BarChart3 className="w-10 h-10 opacity-20" />
        <p className="text-sm">No data available. Add members and payments to see reports.</p>
      </div>
    );
  }

  const { revenueByMonth, aging, trainerRows, trainerFlow, memberSummary, discounts } = data;

  const minMonth = revenueByMonth[0]?.monthKey ?? "";
  const maxMonth = revenueByMonth[revenueByMonth.length - 1]?.monthKey ?? "";

  const months = useMemo(() => {
    if (preset === "custom") {
      const from = customFrom || minMonth;
      const to   = customTo   || maxMonth;
      return revenueByMonth.filter((m) => m.monthKey >= from && m.monthKey <= to);
    }
    return revenueByMonth.slice(-Number(preset));
  }, [revenueByMonth, preset, customFrom, customTo, minMonth, maxMonth]);

  // ── Financial KPIs ─────────────────────────────────────────────────────────
  const totalCollected  = useMemo(() => months.reduce((s, m) => s + m.collected, 0), [months]);
  const totalExpenses   = useMemo(() => months.reduce((s, m) => s + m.expenses, 0), [months]);
  const totalProfit     = useMemo(() => months.reduce((s, m) => s + m.profit, 0), [months]);
  const totalSalaries   = useMemo(() => months.reduce((s, m) => s + m.salaries, 0), [months]);
  const totalOperating  = totalExpenses - totalSalaries;
  const totalNewMembers       = useMemo(() => months.reduce((s, m) => s + m.newMembers, 0), [months]);
  const totalCancelledMembers = useMemo(() => months.reduce((s, m) => s + m.cancelledMembers, 0), [months]);
  const profitMargin    = totalCollected > 0 ? Math.round((totalProfit / totalCollected) * 100) : 0;
  const avgMonthly      = months.length > 0 ? Math.round(totalCollected / months.length) : 0;
  const avgCollectionRate = useMemo(() => {
    const withDue = months.filter((m) => m.due > 0);
    return withDue.length > 0 ? Math.round(withDue.reduce((s, m) => s + m.collectionRate, 0) / withDue.length) : 0;
  }, [months]);

  const bestMonth  = useMemo(() => months.length > 1 ? months.reduce((b, m) => m.profit > b.profit ? m : b, months[0]) : null, [months]);
  const worstMonth = useMemo(() => months.length > 1 ? months.reduce((w, m) => m.profit < w.profit ? m : w, months[0]) : null, [months]);
  const maxCollected = useMemo(() => Math.max(...months.map((m) => m.collected), 1), [months]);

  const agingRows = [
    { label: "0–30 days",  bucket: aging.d30,     color: "bg-yellow-400",   text: "text-yellow-400" },
    { label: "31–60 days", bucket: aging.d60,     color: "bg-orange-400",   text: "text-orange-400" },
    { label: "61–90 days", bucket: aging.d90,     color: "bg-rose-400",     text: "text-rose-400" },
    { label: "90+ days",   bucket: aging.d90plus, color: "bg-rose-600",     text: "text-rose-600" },
  ];
  const totalAgingCount  = agingRows.reduce((s, r) => s + r.bucket.count, 0);
  const totalAgingAmount = agingRows.reduce((s, r) => s + r.bucket.amount, 0);

  // ── Trainer KPIs ───────────────────────────────────────────────────────────
  const totalFeeGenerated  = trainerRows.reduce((s, t) => s + t.monthlyFeeGenerated, 0);
  const totalTrainerCost   = trainerRows.reduce((s, t) => s + t.totalCost, 0);
  const totalNetContrib    = trainerRows.reduce((s, t) => s + t.netContribution, 0);

  // ── Range selector (Financial tab only) ───────────────────────────────────
  const PRESETS: { label: string; value: RangePreset }[] = [
    { label: "1M", value: "1" },
    { label: "3M", value: "3" },
    { label: "6M", value: "6" },
    { label: "12M", value: "12" },
    { label: "Custom", value: "custom" },
  ];

  const RangeSelector = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-sidebar-border bg-card p-1 shrink-0">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              preset === p.value ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.value === "custom" && <CalendarRange className="w-3 h-3" />}
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2 text-xs">
          <input
            type="month"
            value={customFrom}
            min={minMonth}
            max={customTo || maxMonth}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-sidebar-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="month"
            value={customTo}
            min={customFrom || minMonth}
            max={maxMonth}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-sidebar-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Financial, trainer, and member analytics</p>
      </div>

      <Tabs defaultValue="financial" className="space-y-6">
        <TabsList>
          <TabsTrigger value="financial"><BarChart3 className="w-3.5 h-3.5 mr-1.5" />Financial</TabsTrigger>
          <TabsTrigger value="trainers"><UserCheck className="w-3.5 h-3.5 mr-1.5" />Trainers</TabsTrigger>
          <TabsTrigger value="members"><Users className="w-3.5 h-3.5 mr-1.5" />Members</TabsTrigger>
          <TabsTrigger value="discounts"><BadgePercent className="w-3.5 h-3.5 mr-1.5" />Discounts</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════ FINANCIAL TAB ════════════════════════════ */}
        <TabsContent value="financial" className="space-y-6">

          {/* Range selector */}
          {RangeSelector}

          {/* 4 KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collected</p>
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold leading-none">{formatCurrency(totalCollected)}</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Collection rate</span>
                  <span className="text-primary font-semibold">{avgCollectionRate}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${avgCollectionRate}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expenses</p>
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-rose-400" />
                </div>
              </div>
              <p className="text-3xl font-bold leading-none">{formatCurrency(totalExpenses)}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Ops <span className="text-rose-400 font-semibold">{formatCurrency(totalOperating)}</span></span>
                <span>·</span>
                <span>Sal <span className="text-purple-400 font-semibold">{formatCurrency(totalSalaries)}</span></span>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 space-y-3 ${totalProfit >= 0 ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-rose-500/25 bg-rose-500/[0.05]"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</p>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${totalProfit >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                  {totalProfit >= 0
                    ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                    : <TrendingDown className="w-4 h-4 text-rose-400" />}
                </div>
              </div>
              <p className={`text-3xl font-bold leading-none ${totalProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {totalProfit >= 0 ? "+" : ""}{formatCurrency(totalProfit)}
              </p>
              <p className={`text-xs font-semibold ${totalProfit >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
                {profitMargin >= 0 ? "+" : ""}{profitMargin}% margin
              </p>
            </div>

            <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg / Month</p>
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-purple-400" />
                </div>
              </div>
              <p className="text-3xl font-bold leading-none">{formatCurrency(avgMonthly)}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {bestMonth && <span className="text-emerald-400 font-medium">↑ {bestMonth.month}</span>}
                {worstMonth && worstMonth.monthKey !== bestMonth?.monthKey && (
                  <span className="text-rose-400 font-medium">↓ {worstMonth.month}</span>
                )}
              </div>
            </div>
          </div>

          {/* Revenue chart */}
          <div className="rounded-2xl border border-sidebar-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Revenue vs Expenses</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Collected fees vs total costs — {months.length} month{months.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-primary inline-block" />Collected</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-rose-400 inline-block" />Expenses</span>
              </div>
            </div>
            <RevenueChart data={months} />
          </div>

          {/* Monthly P&L table */}
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sidebar-border">
              <div>
                <h2 className="text-sm font-semibold">Monthly P&amp;L</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{months.length} month{months.length !== 1 ? "s" : ""} breakdown</p>
              </div>
              {(bestMonth || worstMonth) && (
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                  {bestMonth && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500/50" />{bestMonth.month} best</span>}
                  {worstMonth && worstMonth.monthKey !== bestMonth?.monthKey && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500/50" />{worstMonth.month} worst</span>}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sidebar-border">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collected</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Operating</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Salaries</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Members</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sidebar-border/50">
                  {months.map((m) => {
                    const isBest  = bestMonth?.monthKey === m.monthKey;
                    const isWorst = worstMonth?.monthKey === m.monthKey && worstMonth.monthKey !== bestMonth?.monthKey;
                    const barPct  = Math.round((m.collected / maxCollected) * 100);
                    return (
                      <tr key={m.monthKey} className={`transition-colors ${isBest ? "bg-emerald-500/[0.04]" : isWorst ? "bg-rose-500/[0.04]" : "hover:bg-white/[0.02]"}`}>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-muted-foreground font-medium">{m.month}</span>
                            {isBest  && <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">Best</span>}
                            {isWorst && <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full">Worst</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="hidden sm:block w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full bg-primary/50 rounded-full" style={{ width: `${barPct}%` }} />
                            </div>
                            <span className="text-primary font-semibold tabular-nums">{formatCurrency(m.collected)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-rose-400 tabular-nums hidden md:table-cell">{formatCurrency(Math.max(0, m.expenses - m.salaries))}</td>
                        <td className="px-4 py-3 text-right text-purple-400 tabular-nums hidden md:table-cell">{formatCurrency(m.salaries)}</td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-2 text-xs">
                            {m.newMembers > 0 && <span className="text-emerald-400 font-medium">+{m.newMembers}</span>}
                            {m.cancelledMembers > 0 && <span className="text-rose-400 font-medium">-{m.cancelledMembers}</span>}
                            {m.newMembers === 0 && m.cancelledMembers === 0 && <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className={`px-6 py-3 text-right font-bold tabular-nums ${m.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {m.profit >= 0 ? "+" : ""}{formatCurrency(m.profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-sidebar-border">
                    <td className="px-6 py-3 text-sm font-semibold text-muted-foreground">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-primary tabular-nums">{formatCurrency(totalCollected)}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-400 tabular-nums hidden md:table-cell">{formatCurrency(totalOperating)}</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-400 tabular-nums hidden md:table-cell">{formatCurrency(totalSalaries)}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <div className="flex items-center justify-end gap-2 text-xs font-semibold">
                        {totalNewMembers > 0 && <span className="text-emerald-400">+{totalNewMembers}</span>}
                        {totalCancelledMembers > 0 && <span className="text-rose-400">-{totalCancelledMembers}</span>}
                      </div>
                    </td>
                    <td className={`px-6 py-3 text-right font-bold tabular-nums ${totalProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {totalProfit >= 0 ? "+" : ""}{formatCurrency(totalProfit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Expense breakdown + Overdue aging */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-sidebar-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold">Expense Breakdown</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Operating vs salaries per month</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" />Operating</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-400 inline-block" />Salaries</span>
                </div>
              </div>
              <ExpenseBreakdownChart data={months} />
            </div>

            <div className="rounded-2xl border border-sidebar-border bg-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h2 className="text-sm font-semibold">Overdue Aging</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-5">Pending payments by age bucket</p>
              {totalAgingCount === 0 ? (
                <div className="flex flex-col items-center justify-center h-[160px] gap-2 text-emerald-400">
                  <TrendingUp className="w-8 h-8 opacity-40" />
                  <p className="text-sm font-medium">No overdue payments</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {agingRows.map(({ label, bucket, color, text }) => {
                    const pct = totalAgingCount > 0 ? Math.round((bucket.count / totalAgingCount) * 100) : 0;
                    return (
                      <div key={label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${color}`} />
                            <span className="text-muted-foreground">{label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-semibold ${text}`}>{bucket.count} member{bucket.count !== 1 ? "s" : ""}</span>
                            <span className="text-foreground font-semibold w-24 text-right tabular-nums">{formatCurrency(bucket.amount)}</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-sidebar-border flex items-center justify-between text-xs font-semibold">
                    <span className="text-muted-foreground">Total overdue</span>
                    <div className="flex items-center gap-3">
                      <span className="text-rose-400">{totalAgingCount} members</span>
                      <span className="text-rose-400 w-24 text-right tabular-nums">{formatCurrency(totalAgingAmount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════ TRAINERS TAB ═════════════════════════════ */}
        <TabsContent value="trainers" className="space-y-6">

          {/* Trainer KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee Generated</p>
              <p className="text-3xl font-bold text-primary">{formatCurrency(totalFeeGenerated)}</p>
              <p className="text-xs text-muted-foreground">Sum of all active members&apos; fees across trainers</p>
            </div>
            <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trainer Cost</p>
              <p className="text-3xl font-bold text-purple-400">{formatCurrency(totalTrainerCost)}</p>
              <p className="text-xs text-muted-foreground">Base salaries + commissions this month</p>
            </div>
            <div className={`rounded-2xl border p-5 space-y-2 ${totalNetContrib >= 0 ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-rose-500/25 bg-rose-500/[0.05]"}`}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Contribution</p>
              <p className={`text-3xl font-bold ${totalNetContrib >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {totalNetContrib >= 0 ? "+" : ""}{formatCurrency(totalNetContrib)}
              </p>
              <p className="text-xs text-muted-foreground">Fee generated minus trainer costs</p>
            </div>
          </div>

          {/* Trainer performance table */}
          {/* Estimate notice — shown when at least one trainer has no generated salary record */}
          {trainerRows.some((t) => !t.salaryGenerated) && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5 flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Commission figures are estimated (salary not yet generated for this month). Generate salaries on the Trainers page for exact numbers.
            </div>
          )}

          {trainerRows.length === 0 ? (
            <div className="rounded-2xl border border-sidebar-border bg-card flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
              <UserCheck className="w-10 h-10 opacity-20" />
              <p className="text-sm">No active trainers found.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-sidebar-border">
                <h2 className="text-sm font-semibold">Trainer Performance — Current Month</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Sorted by net contribution. Commission uses generated salary records when available, otherwise estimated from member fees × rate.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trainer</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee Generated</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Base Salary</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Commission</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Cost</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Contrib.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {trainerRows.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {t.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-semibold tabular-nums ${t.activeMembers === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                            {t.activeMembers}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-primary font-semibold tabular-nums">
                          {t.monthlyFeeGenerated > 0 ? formatCurrency(t.monthlyFeeGenerated) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-purple-400 tabular-nums hidden md:table-cell">{formatCurrency(t.baseSalary)}</td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                          {t.commissionEarned > 0
                            ? <span className="text-amber-400">{formatCurrency(t.commissionEarned)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-rose-400 font-semibold tabular-nums">{formatCurrency(t.totalCost)}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {t.netContribution >= 0
                              ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                            <span className={`font-bold tabular-nums ${t.netContribution >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {t.netContribution >= 0 ? "+" : ""}{formatCurrency(t.netContribution)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-sidebar-border bg-white/[0.01]">
                      <td className="px-6 py-3 text-sm font-semibold text-muted-foreground">Total</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        {trainerRows.reduce((s, t) => s + t.activeMembers, 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-primary tabular-nums">{formatCurrency(totalFeeGenerated)}</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-400 tabular-nums hidden md:table-cell">
                        {formatCurrency(trainerRows.reduce((s, t) => s + t.baseSalary, 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-400 tabular-nums hidden md:table-cell">
                        {formatCurrency(trainerRows.reduce((s, t) => s + t.commissionEarned, 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-400 tabular-nums">{formatCurrency(totalTrainerCost)}</td>
                      <td className={`px-6 py-3 text-right font-bold tabular-nums ${totalNetContrib >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {totalNetContrib >= 0 ? "+" : ""}{formatCurrency(totalNetContrib)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          {/* Member Flow by Trainer */}
          {trainerFlow.length > 0 && (() => {
            const allMonths = trainerFlow[0]?.months ?? [];
            const selectedKey = flowMonth || (allMonths[allMonths.length - 1]?.monthKey ?? "");
            return (
              <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-sidebar-border">
                  <div>
                    <h2 className="text-sm font-semibold">Member Flow by Trainer</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Members gained and lost per trainer. Averages based on last 6 months.</p>
                  </div>
                  <select
                    value={selectedKey}
                    onChange={(e) => setFlowMonth(e.target.value)}
                    className="text-xs bg-white/5 border border-sidebar-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {allMonths.map((m) => (
                      <option key={m.monthKey} value={m.monthKey}>{m.month}</option>
                    ))}
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sidebar-border">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trainer</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-400 uppercase tracking-wider">Gained</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Lost</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Avg Gained<span className="font-normal ml-1">(6mo)</span></th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Avg Lost<span className="font-normal ml-1">(6mo)</span></th>
                        <th className="text-center px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Avg Net<span className="font-normal ml-1">(6mo)</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sidebar-border/50">
                      {trainerFlow.map((t) => {
                        const m = t.months.find((x) => x.monthKey === selectedKey) ?? { gained: 0, lost: 0, net: 0 };
                        return (
                          <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                  {t.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium">{t.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center justify-center gap-1 text-sm font-bold tabular-nums ${m.gained > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {m.gained > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}{m.gained}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center justify-center gap-1 text-sm font-bold tabular-nums ${m.lost > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                                {m.lost > 0 && <ArrowDownRight className="w-3.5 h-3.5" />}{m.lost}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-sm font-bold tabular-nums ${m.net > 0 ? "text-emerald-400" : m.net < 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                                {m.net > 0 ? "+" : ""}{m.net}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center hidden md:table-cell">
                              <span className={`text-sm tabular-nums ${t.avgGained > 0 ? "text-emerald-400/70" : "text-muted-foreground"}`}>{t.avgGained}</span>
                            </td>
                            <td className="px-4 py-3 text-center hidden md:table-cell">
                              <span className={`text-sm tabular-nums ${t.avgLost > 0 ? "text-rose-400/70" : "text-muted-foreground"}`}>{t.avgLost}</span>
                            </td>
                            <td className="px-6 py-3 text-center hidden md:table-cell">
                              <span className={`text-sm font-semibold tabular-nums ${t.avgNet > 0 ? "text-emerald-400/70" : t.avgNet < 0 ? "text-rose-400/70" : "text-muted-foreground"}`}>
                                {t.avgNet > 0 ? "+" : ""}{t.avgNet}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </TabsContent>

        {/* ═══════════════════════ MEMBERS TAB ══════════════════════════════ */}
        <TabsContent value="members" className="space-y-6">

          {/* 1 — Status snapshot + intake */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {[
              { label: "Active",     value: memberSummary.active,     icon: UserCheck,     color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Frozen",     value: memberSummary.frozen,     icon: Clock,         color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "Defaulters", value: memberSummary.defaulters, icon: AlertTriangle, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
              { label: "Lapsed",     value: memberSummary.lapsed,     icon: UserX,         color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${bg}`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                </div>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New This Month</p>
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-primary" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-3xl font-bold">{memberSummary.newThisMonth}</p>
                {memberSummary.newLastMonth > 0 && (
                  <span className={`text-xs font-semibold ${memberSummary.newThisMonth >= memberSummary.newLastMonth ? "text-emerald-400" : "text-rose-400"}`}>
                    {memberSummary.newThisMonth >= memberSummary.newLastMonth ? "↑" : "↓"} {memberSummary.newLastMonth}
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Members</p>
                <div className="w-8 h-8 rounded-xl bg-white/5 border border-sidebar-border flex items-center justify-center">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-3xl font-bold">{memberSummary.total}</p>
                <span className="text-xs text-muted-foreground">
                  {memberSummary.total > 0 ? `${Math.round((memberSummary.active / memberSummary.total) * 100)}% active` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* 2 — Defaulter list */}
          <div className="rounded-2xl border border-amber-500/20 bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-sidebar-border">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold">Defaulter List</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Members with unpaid dues — oldest first</p>
              </div>
            </div>
            {memberSummary.defaulterList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-emerald-400">
                <UserCheck className="w-8 h-8 opacity-40" />
                <p className="text-sm font-medium">No defaulters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sidebar-border">
                      <th className="text-left px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Since</th>
                      <th className="text-right px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee/mo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border/50">
                    {memberSummary.defaulterList.slice(0, 10).map((d) => (
                      <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-3">
                          <p className="font-medium text-sm">{d.name}</p>
                          {d.phone && <p className="text-xs text-muted-foreground">{d.phone}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden sm:table-cell">
                          {d.defaulterSince ? formatDate(d.defaulterSince) : "—"}
                        </td>
                        <td className="px-6 py-3 text-right text-amber-400 font-semibold tabular-nums text-sm">
                          {formatCurrency(d.monthlyFee)}
                        </td>
                      </tr>
                    ))}
                    {memberSummary.defaulterList.length > 10 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-2.5 text-xs text-muted-foreground text-center">
                          and {memberSummary.defaulterList.length - 10} more...
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-sidebar-border">
                      <td className="px-6 py-2.5 text-xs font-semibold text-muted-foreground">{memberSummary.defaulterList.length} member{memberSummary.defaulterList.length !== 1 ? "s" : ""}</td>
                      <td className="hidden sm:table-cell" />
                      <td className="px-6 py-2.5 text-right font-bold text-amber-400 tabular-nums text-sm">
                        {formatCurrency(memberSummary.defaulterList.reduce((s, d) => s + d.monthlyFee, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* 3 — Expiring in 7 days */}
          <div className="rounded-2xl border border-rose-500/25 bg-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold">Expiring in 7 Days</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Active members whose plan expires soon — renew proactively</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/20">
                {memberSummary.expiringIn7Days.length}
              </span>
            </div>
            {memberSummary.expiringIn7Days.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <UserCheck className="w-8 h-8 opacity-20" />
                <p className="text-sm">No plans expiring in the next 7 days.</p>
              </div>
            ) : (
              <div className="divide-y divide-sidebar-border/50">
                {memberSummary.expiringIn7Days.slice(0, 10).map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-6 py-3 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-xs font-bold text-rose-400 shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{m.name}</p>
                        {m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{formatDate(m.planExpiry)}</p>
                      <p className={`text-xs font-semibold ${m.daysLeft <= 2 ? "text-rose-400" : "text-amber-400"}`}>
                        {m.daysLeft === 0 ? "Expires today" : `${m.daysLeft}d left`}
                      </p>
                    </div>
                  </div>
                ))}
                {memberSummary.expiringIn7Days.length > 10 && (
                  <div className="px-6 py-2.5 text-xs text-muted-foreground text-center">
                    and {memberSummary.expiringIn7Days.length - 10} more...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4 — Plan distribution */}
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-sidebar-border">
              <h2 className="text-sm font-semibold">Plan Distribution</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Which plans active members are on</p>
            </div>
            {memberSummary.planDistribution.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">No active members</div>
            ) : (
              <div className="divide-y divide-sidebar-border/50">
                {memberSummary.planDistribution.map((p, i) => (
                  <div key={p.planId ?? "__none__"} className="px-6 py-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {i === 0 && <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">Top</span>}
                        <span className="font-medium">{p.planName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs tabular-nums">
                        <span className="text-muted-foreground">{p.memberCount} member{p.memberCount !== 1 ? "s" : ""}</span>
                        <span className="text-primary font-semibold w-20 text-right">{formatCurrency(p.monthlyRevenue)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full transition-all duration-500" style={{ width: `${p.percentage}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{p.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5 — Monthly intake vs churn */}
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-sidebar-border">
              <h2 className="text-sm font-semibold">Monthly Intake vs Churn</h2>
              <p className="text-xs text-muted-foreground mt-0.5">New members joined vs cancelled/lapsed — last 12 months</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sidebar-border">
                    <th className="text-left px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-emerald-400 uppercase tracking-wider">Joined</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wider">Left</th>
                    <th className="text-right px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sidebar-border/50">
                  {revenueByMonth.map((m) => {
                    const net = m.newMembers - m.cancelledMembers;
                    return (
                      <tr key={m.monthKey} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-2.5 text-muted-foreground font-medium">{m.month}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {m.newMembers > 0 ? <span className="text-emerald-400 font-semibold">+{m.newMembers}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {m.cancelledMembers > 0 ? <span className="text-rose-400 font-semibold">-{m.cancelledMembers}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-6 py-2.5 text-right tabular-nums font-bold">
                          <span className={net > 0 ? "text-emerald-400" : net < 0 ? "text-rose-400" : "text-muted-foreground"}>
                            {net > 0 ? "+" : ""}{net === 0 ? "—" : net}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </TabsContent>

        {/* ═══════════════════════ DISCOUNTS TAB ═════════════════════════════ */}
        <TabsContent value="discounts" className="space-y-6">
          <DiscountsPanel discounts={discounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Discounts tab ──────────────────────────────────────────────────────────
function DiscountsPanel({ discounts }: { discounts: DiscountReport | undefined }) {
  const [scope, setScope] = useState<"all" | "month">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [search, setSearch] = useState("");

  if (!discounts) {
    return (
      <div className="rounded-2xl border border-sidebar-border bg-card flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
        <BadgePercent className="w-10 h-10 opacity-20" />
        <p className="text-sm">No discount data available.</p>
      </div>
    );
  }

  const months = discounts.byMonth;
  const defaultMonth = months[months.length - 1]?.monthKey ?? "";
  const activeMonth = selectedMonth || defaultMonth;
  const monthRow = months.find((m) => m.monthKey === activeMonth);

  // Switch between aggregate (all rows) and a single-month focus (filter trend).
  // Note: byMonth currently only tracks realized payment-row discounts; the
  // promised pledge book is global (not date-bounded), so we keep it visible
  // in the single-month view too.
  const summary = scope === "month" && monthRow
    ? {
        totalDiscountAmount: monthRow.totalDiscount + discounts.summary.promisedDiscountAmount,
        realizedDiscountAmount: monthRow.totalDiscount,
        promisedDiscountAmount: discounts.summary.promisedDiscountAmount,
        paymentsWithDiscount: monthRow.discountCount,
        uniqueMembersDiscounted: monthRow.uniqueMembers,
        uniqueMembersPromised: discounts.summary.uniqueMembersPromised,
      }
    : discounts.summary;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return discounts.rows;
    return discounts.rows.filter((r) =>
      r.memberName.toLowerCase().includes(q) ||
      (r.memberNumber ?? "").toLowerCase().includes(q)
    );
  }, [discounts.rows, search]);

  const maxDiscount = Math.max(...discounts.rows.map((r) => r.totalDiscount), 1);
  const maxMonth = Math.max(...months.map((m) => m.totalDiscount), 1);

  const SCOPES: { label: string; value: "all" | "month" }[] = [
    { label: "All time", value: "all" },
    { label: "Single month", value: "month" },
  ];

  return (
    <>
      {/* Scope selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-sidebar-border bg-card p-1 shrink-0">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                scope === s.value ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scope === "month" && months.length > 0 && (
          <select
            value={activeMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs bg-card border border-sidebar-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {months.map((m) => (
              <option key={m.monthKey} value={m.monthKey}>{m.month}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI cards — 4 tiles: total, realized, promised, member-count */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Discount</p>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <HandCoins className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-bold leading-none text-amber-400">{formatCurrency(summary.totalDiscountAmount)}</p>
          <p className="text-xs text-muted-foreground">Realized + Promised</p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Realized</p>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <BadgePercent className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold leading-none text-emerald-400">{formatCurrency(summary.realizedDiscountAmount)}</p>
          <p className="text-xs text-muted-foreground">{summary.paymentsWithDiscount} payments • {scope === "month" ? monthRow?.month ?? "—" : "all time"}</p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Promised (unpaid)</p>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Gift className="w-4 h-4 text-sky-400" />
            </div>
          </div>
          <p className="text-3xl font-bold leading-none text-sky-400">{formatCurrency(summary.promisedDiscountAmount)}</p>
          <p className="text-xs text-muted-foreground">{summary.uniqueMembersPromised} member{summary.uniqueMembersPromised === 1 ? "" : "s"} • open pledge</p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unique Members</p>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Gift className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          <p className="text-3xl font-bold leading-none">{summary.uniqueMembersDiscounted}</p>
          <p className="text-xs text-muted-foreground">Received at least one realized discount</p>
        </div>
      </div>

      {/* Monthly trend */}
      {months.some((m) => m.totalDiscount > 0) && (
        <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-sidebar-border">
            <h2 className="text-sm font-semibold">Monthly Trend</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Discounts given per month — last 12 months</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Discount</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Payments</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/50">
                {months.map((m) => {
                  const barPct = Math.round((m.totalDiscount / maxMonth) * 100);
                  return (
                    <tr key={m.monthKey} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-2.5 text-muted-foreground font-medium">{m.month}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="hidden sm:block w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-amber-400/60 rounded-full" style={{ width: `${barPct}%` }} />
                          </div>
                          <span className={`tabular-nums font-semibold ${m.totalDiscount > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                            {m.totalDiscount > 0 ? formatCurrency(m.totalDiscount) : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">
                        {m.discountCount > 0 ? m.discountCount : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-2.5 text-right tabular-nums hidden md:table-cell">
                        {m.uniqueMembers > 0 ? m.uniqueMembers : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-member breakdown */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sidebar-border gap-3">
          <div>
            <h2 className="text-sm font-semibold">Per-Member Breakdown</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sorted by total discount. Top {discounts.rows.length} member{discounts.rows.length !== 1 ? "s" : ""}.</p>
          </div>
          <input
            type="text"
            placeholder="Search member..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs bg-white/5 border border-sidebar-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-44 sm:w-56"
          />
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <BadgePercent className="w-10 h-10 opacity-20" />
            <p className="text-sm">{search ? "No members match your search." : "No discounts recorded yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Realized</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Promised</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Payments</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Avg / Payment</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Last Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/50">
                {rows.map((r) => {
                  const barPct = Math.round((r.totalDiscount / maxDiscount) * 100);
                  return (
                    <tr key={r.memberId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                            {r.memberName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{r.memberName}</p>
                            {r.memberNumber && (
                              <p className="text-xs text-muted-foreground">#{r.memberNumber}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="hidden sm:block w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-amber-400/60 rounded-full" style={{ width: `${barPct}%` }} />
                          </div>
                          {r.realizedDiscount > 0 ? (
                            <span className="text-emerald-400 font-semibold tabular-nums">{formatCurrency(r.realizedDiscount)}</span>
                          ) : (
                            <span className="text-muted-foreground tabular-nums">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.pendingDiscount > 0 ? (
                          <span className="text-sky-400 font-semibold">{formatCurrency(r.pendingDiscount)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                        <span className="text-foreground font-semibold">{r.discountCount}</span>
                        {r.totalPayments > r.discountCount && (
                          <span className="text-muted-foreground"> / {r.totalPayments}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums hidden md:table-cell">
                        {formatCurrency(r.avgDiscount)}
                      </td>
                      <td className="px-6 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                        {r.lastDiscountDate ? formatDate(r.lastDiscountDate) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-sidebar-border">
                  <td className="px-6 py-3 text-xs font-semibold text-muted-foreground">
                    {rows.length} member{rows.length !== 1 ? "s" : ""}{search && ` (filtered)`}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-400 tabular-nums">
                    {formatCurrency(rows.reduce((s, r) => s + r.realizedDiscount, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-sky-400 tabular-nums">
                    {formatCurrency(rows.reduce((s, r) => s + r.pendingDiscount, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums hidden sm:table-cell">
                    {rows.reduce((s, r) => s + r.discountCount, 0)}
                  </td>
                  <td className="hidden md:table-cell" />
                  <td className="hidden md:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
