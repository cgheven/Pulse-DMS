"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Home, Zap, Users, MoreHorizontal, Trash2, Plus, Receipt,
} from "lucide-react";
import { addExpense, deleteExpense, fetchExpenses } from "@/app/actions/expenses";
import { toast } from "@/hooks/use-toast";
import type { Expense } from "@/types";

// ─── Types & constants ────────────────────────────────────────────────────────

type Category = Expense["category"];

const CATEGORIES: { value: Category; label: string; Icon: typeof Home; color: string; badge: string }[] = [
  {
    value: "rent",
    label: "Rent",
    Icon: Home,
    color: "text-blue-400",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    value: "utilities",
    label: "Utilities",
    Icon: Zap,
    color: "text-yellow-400",
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  },
  {
    value: "salary",
    label: "Salary",
    Icon: Users,
    color: "text-purple-400",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    value: "misc",
    label: "Misc",
    Icon: MoreHorizontal,
    color: "text-zinc-400",
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c])) as Record<
  Category,
  (typeof CATEGORIES)[number]
>;

function formatPKR(amount: number) {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function groupByDate(expenses: Expense[]) {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = e.expense_date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
}

function prettyDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ─── Category badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: Category }) {
  const cat = CAT_MAP[category];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cat.badge}`}
    >
      <cat.Icon className="w-3 h-3" />
      {cat.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  shopId: string;
  initialExpenses: Expense[];
  defaultFrom: string;
  defaultTo: string;
}

export function ExpensesClient({ shopId, initialExpenses, defaultFrom, defaultTo }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);

  // ── Date filter ───────────────────────────────────────────────────────────
  type FilterMode = "this_month" | "last_month" | "custom";
  const [filterMode, setFilterMode] = useState<FilterMode>("this_month");
  const [customFrom, setCustomFrom] = useState(defaultFrom);
  const [customTo, setCustomTo] = useState(defaultTo);
  const [loadingFilter, setLoadingFilter] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [category, setCategory] = useState<Category>("misc");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [isPending, startTransition] = useTransition();

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  // ─── Derived ───────────────────────────────────────────────────────────────
  const total = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  );

  const catTotals = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((c) => [
          c.value,
          expenses.filter((e) => e.category === c.value).reduce((s, e) => s + Number(e.amount), 0),
        ])
      ) as Record<Category, number>,
    [expenses]
  );

  const grouped = useMemo(() => groupByDate(expenses), [expenses]);

  // ─── Load expenses for a date range ───────────────────────────────────────
  async function loadExpenses(from: string, to: string) {
    setLoadingFilter(true);
    const result = await fetchExpenses(shopId, from, to);
    if (result.error) {
      toast({ title: "Failed to load", description: result.error, variant: "destructive" });
    } else {
      setExpenses(result.expenses as Expense[]);
    }
    setLoadingFilter(false);
  }

  function applyFilter(mode: FilterMode) {
    setFilterMode(mode);
    const now = new Date();
    let from: string;
    let to: string;
    if (mode === "this_month") {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else if (mode === "last_month") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else {
      from = customFrom;
      to = customTo;
    }
    loadExpenses(from, to);
  }

  // ─── Add expense ───────────────────────────────────────────────────────────
  function handleAdd() {
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await addExpense({
        shopId,
        category,
        amount: amountNum,
        note: note.trim() || undefined,
        expenseDate: date,
      });
      if (res?.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Expense added" });
        setAmount("");
        setNote("");
        setDate(todayStr());
        // Re-fetch current filter range
        applyFilter(filterMode);
      }
    });
  }

  // ─── Delete expense ────────────────────────────────────────────────────────
  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      const res = await deleteExpense(id, shopId);
      if (res?.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Deleted" });
        setExpenses((prev) => prev.filter((e) => e.id !== id));
      }
      setConfirmDelete(null);
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-foreground">Expenses</h1>
        <p className="text-muted-foreground text-sm mt-1">Track and manage shop expenses</p>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Total this period
            </p>
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {formatPKR(total)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <span
                key={c.value}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${c.badge}`}
              >
                <c.Icon className="w-3 h-3" />
                {c.label}
                <span className="font-bold">{formatPKR(catTotals[c.value])}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Category breakdown bars */}
        {total > 0 && (
          <div className="space-y-1.5 pt-1">
            {CATEGORIES.filter((c) => catTotals[c.value] > 0).map((c) => {
              const pct = Math.round((catTotals[c.value] / total) * 100);
              return (
                <div key={c.value} className="flex items-center gap-2">
                  <span className={`w-16 text-xs ${c.color}`}>{c.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        c.value === "rent"
                          ? "bg-blue-500"
                          : c.value === "utilities"
                          ? "bg-yellow-500"
                          : c.value === "salary"
                          ? "bg-purple-500"
                          : "bg-zinc-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Add Form ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Add Expense
          </p>
        </div>

        {/* Category selector — button tabs */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  active
                    ? `${c.badge} border-current`
                    : "border-sidebar-border text-muted-foreground hover:bg-white/5"
                }`}
              >
                <c.Icon className="w-3.5 h-3.5" />
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Inputs row */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Amount */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">
              PKR
            </span>
            <input
              type="number"
              min="1"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full sm:w-40 pl-10 pr-3 py-2 rounded-lg bg-background border border-sidebar-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Note */}
          <input
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-sidebar-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Date */}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 rounded-lg bg-background border border-sidebar-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Submit */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !amount}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isPending ? "Adding…" : "Add Expense"}
          </button>
        </div>
      </div>

      {/* ── Date filter tabs ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex rounded-lg border border-sidebar-border overflow-hidden">
          {(["this_month", "last_month", "custom"] as FilterMode[]).map((mode) => {
            const labels: Record<FilterMode, string> = {
              this_month: "This Month",
              last_month: "Last Month",
              custom: "Custom Range",
            };
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode !== "custom") applyFilter(mode);
                  else setFilterMode("custom");
                }}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  filterMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>

        {filterMode === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-sidebar-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-sidebar-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => applyFilter("custom")}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ── Expenses list ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
        {loadingFilter ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Receipt className="w-10 h-10 opacity-20" />
            <p className="text-sm">No expenses this period.</p>
          </div>
        ) : (
          <div className="divide-y divide-sidebar-border">
            {grouped.map(([date, items]) => (
              <div key={date}>
                {/* Date header */}
                <div className="px-5 py-2.5 bg-muted/30 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">{prettyDate(date)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPKR(items.reduce((s, e) => s + Number(e.amount), 0))}
                  </p>
                </div>

                {/* Items */}
                <div className="divide-y divide-sidebar-border/50">
                  {items.map((expense) => (
                    <div
                      key={expense.id}
                      className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
                    >
                      <CategoryBadge category={expense.category} />

                      <div className="flex-1 min-w-0">
                        {expense.note && (
                          <p className="text-sm text-foreground/80 truncate">{expense.note}</p>
                        )}
                      </div>

                      <p className="text-sm font-bold text-foreground tabular-nums shrink-0">
                        {formatPKR(Number(expense.amount))}
                      </p>

                      {/* Delete */}
                      {confirmDelete === expense.id ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDelete(expense.id)}
                            disabled={isDeleting}
                            className="px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
                          >
                            {isDeleting ? "…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="px-2.5 py-1 rounded-md text-muted-foreground border border-sidebar-border text-xs hover:bg-white/5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(expense.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
