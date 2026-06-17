"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Receipt,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  Plus,
  PackagePlus,
  Wallet,
  BarChart2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useShopContext } from "@/contexts/shop-context";
import type { DashboardStats } from "@/types";

function formatPKR(amount: number) {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <div className="animate-pulse bg-muted rounded-xl h-9 w-48" />
        <div className="animate-pulse bg-muted rounded-xl h-4 w-36" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-28" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-20" />
        ))}
      </div>
    </div>
  );
}

export function DashboardClient() {
  const { shopId } = useShopContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;

    const supabase = createClient();

    async function fetchStats() {
      setLoading(true);
      try {
        const today = new Date();
        const p_today = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const { data, error } = await supabase.rpc("get_dashboard_stats", {
          p_shop_id: shopId,
          p_today,
        });
        if (!error && data) {
          setStats(Array.isArray(data) ? data[0] : data);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [shopId]);

  if (loading || !stats) {
    return <DashboardSkeleton />;
  }

  const grossProfit = stats.month_sales - stats.month_cogs;
  const netProfit = stats.month_sales - stats.month_cogs - stats.month_expenses;
  const isNetPositive = netProfit >= 0;
  const isGrossPositive = grossProfit >= 0;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} overview
        </p>
      </div>

      {/* ── KPI Cards — Top Row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Today's Sales */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today&apos;s Sales</p>
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground leading-none">{formatPKR(stats.today_sales)}</p>
          <p className="text-xs text-muted-foreground">Revenue recorded today</p>
        </div>

        {/* Today's Transactions */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today&apos;s Transactions</p>
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground leading-none">{stats.today_transactions}</p>
          <p className="text-xs text-muted-foreground">Sales recorded today</p>
        </div>

        {/* Month Revenue */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month Revenue</p>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-400 leading-none">{formatPKR(stats.month_sales)}</p>
          <p className="text-xs text-muted-foreground">Total sales this month</p>
        </div>

        {/* Outstanding Payables */}
        <div className={`rounded-xl border p-5 space-y-3 ${stats.outstanding_payables > 0 ? "border-rose-500/25 bg-rose-500/[0.05]" : "border-sidebar-border bg-card"}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outstanding Payables</p>
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${stats.outstanding_payables > 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-white/5 border-white/10"}`}>
              <AlertTriangle className={`w-4 h-4 ${stats.outstanding_payables > 0 ? "text-rose-400" : "text-muted-foreground"}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold leading-none ${stats.outstanding_payables > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
            {formatPKR(stats.outstanding_payables)}
          </p>
          <p className="text-xs text-muted-foreground">Owed to suppliers</p>
        </div>
      </div>

      {/* ── Second Row: Gross & Net Profit ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Month Gross Profit */}
        <div className={`rounded-xl border p-5 space-y-3 ${isGrossPositive ? "border-sidebar-border bg-card" : "border-rose-500/25 bg-rose-500/[0.05]"}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month Gross Profit</p>
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${isGrossPositive ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
              {isGrossPositive
                ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                : <TrendingDown className="w-4 h-4 text-rose-400" />}
            </div>
          </div>
          <p className={`text-2xl font-bold leading-none ${isGrossPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {isGrossPositive ? "" : "-"}{formatPKR(Math.abs(grossProfit))}
          </p>
          <p className="text-xs text-muted-foreground">
            Sales <span className="text-foreground font-medium">{formatPKR(stats.month_sales)}</span> minus COGS <span className="text-foreground font-medium">{formatPKR(stats.month_cogs)}</span>
          </p>
        </div>

        {/* Month Net Profit */}
        <div className={`rounded-xl border p-5 space-y-3 ${isNetPositive ? "border-sidebar-border bg-card" : "border-rose-500/25 bg-rose-500/[0.05]"}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month Net Profit</p>
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${isNetPositive ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
              {isNetPositive
                ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                : <TrendingDown className="w-4 h-4 text-rose-400" />}
            </div>
          </div>
          <p className={`text-2xl font-bold leading-none ${isNetPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {isNetPositive ? "" : "-"}{formatPKR(Math.abs(netProfit))}
          </p>
          <p className="text-xs text-muted-foreground">
            After expenses <span className="text-foreground font-medium">{formatPKR(stats.month_expenses)}</span>
          </p>
        </div>
      </div>

      {/* ── Alert Row ───────────────────────────────────────────── */}
      {stats.total_products === 0 && (
        <Link
          href="/products"
          className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 hover:bg-primary/[0.08] transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">No products yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add your first product to start tracking inventory and sales</p>
          </div>
          <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors shrink-0">Add product →</span>
        </Link>
      )}

      {stats.low_stock_count > 0 && (
        <Link
          href="/stock"
          className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 hover:bg-amber-500/[0.08] transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Low stock alert</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-amber-400 font-semibold">{stats.low_stock_count}</span> product{stats.low_stock_count !== 1 ? "s are" : " is"} running low on stock
            </p>
          </div>
          <span className="text-xs text-muted-foreground group-hover:text-amber-400 transition-colors shrink-0">View stock →</span>
        </Link>
      )}

      {/* ── Quick Links ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/sales"
          className="rounded-xl border border-sidebar-border bg-card p-4 flex flex-col items-center gap-2 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors group"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground">Record Sale</span>
        </Link>

        <Link
          href="/stock"
          className="rounded-xl border border-sidebar-border bg-card p-4 flex flex-col items-center gap-2 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] transition-colors group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
            <PackagePlus className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-xs font-medium text-foreground">Add Stock</span>
        </Link>

        <Link
          href="/expenses"
          className="rounded-xl border border-sidebar-border bg-card p-4 flex flex-col items-center gap-2 hover:border-rose-500/30 hover:bg-rose-500/[0.04] transition-colors group"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center group-hover:bg-rose-500/20 transition-colors">
            <Plus className="w-5 h-5 text-rose-400" />
          </div>
          <span className="text-xs font-medium text-foreground">Add Expense</span>
        </Link>

        <Link
          href="/pl-report"
          className="rounded-xl border border-sidebar-border bg-card p-4 flex flex-col items-center gap-2 hover:border-amber-500/30 hover:bg-amber-500/[0.04] transition-colors group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
            <BarChart2 className="w-5 h-5 text-amber-400" />
          </div>
          <span className="text-xs font-medium text-foreground">View P&amp;L</span>
        </Link>
      </div>

    </div>
  );
}
