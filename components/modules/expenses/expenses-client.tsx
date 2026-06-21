"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import {
  Home, Zap, Wifi, Droplets, Flame, Phone,
  Users, MoreHorizontal, Trash2, Plus, Receipt,
  FileSpreadsheet, FileText,
} from "lucide-react";
import { addExpense, deleteExpense, fetchExpenses } from "@/app/actions/expenses";
import { formatDateInput } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useBranchContext } from "@/contexts/branch-context";
import { useShopContext } from "@/contexts/shop-context";
import { downloadReportCsv } from "@/lib/reports/csv-export";
import { downloadReportPdf } from "@/lib/reports/pdf-export";
import type { ReportColumn } from "@/lib/reports/types";
import { toast } from "@/hooks/use-toast";
import type { Expense } from "@/types";

// ─── Category config ──────────────────────────────────────────────────────────

type Category = Expense["category"];

const CATEGORIES: {
  value: Category;
  label: string;
  Icon: typeof Home;
  badge: string;
  noteLabel: string;
  notePlaceholder: string;
  noteRequired: boolean;
  group: "bills" | "staff" | "other";
}[] = [
  {
    value: "electricity",
    label: "Electricity",
    Icon: Zap,
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    noteLabel: "Note",
    notePlaceholder: "e.g. LESCO June bill",
    noteRequired: false,
    group: "bills",
  },
  {
    value: "internet",
    label: "Internet",
    Icon: Wifi,
    badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    noteLabel: "Note",
    notePlaceholder: "e.g. PTCL Fiber, StormFiber",
    noteRequired: false,
    group: "bills",
  },
  {
    value: "water",
    label: "Water",
    Icon: Droplets,
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    noteLabel: "Note",
    notePlaceholder: "e.g. June water bill",
    noteRequired: false,
    group: "bills",
  },
  {
    value: "gas",
    label: "Gas",
    Icon: Flame,
    badge: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    noteLabel: "Note",
    notePlaceholder: "e.g. SSGC June",
    noteRequired: false,
    group: "bills",
  },
  {
    value: "phone",
    label: "Phone",
    Icon: Phone,
    badge: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    noteLabel: "Note",
    notePlaceholder: "e.g. Staff SIM recharge",
    noteRequired: false,
    group: "bills",
  },
  {
    value: "rent",
    label: "Rent",
    Icon: Home,
    badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    noteLabel: "Period",
    notePlaceholder: "e.g. June 2026",
    noteRequired: false,
    group: "other",
  },
  {
    value: "salary",
    label: "Salary",
    Icon: Users,
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    noteLabel: "Employee Name *",
    notePlaceholder: "e.g. Ali Hassan – Sales Staff",
    noteRequired: true,
    group: "staff",
  },
  {
    value: "misc",
    label: "Misc",
    Icon: MoreHorizontal,
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    noteLabel: "Description *",
    notePlaceholder: "What was this expense for?",
    noteRequired: true,
    group: "other",
  },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c])) as Record<
  Category,
  (typeof CATEGORIES)[number]
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPKR(n: number) {
  return `PKR ${n.toLocaleString("en-PK")}`;
}

function todayStr() {
  return formatDateInput(new Date());
}

function getThisMonthRange() {
  const now = new Date();
  return {
    from: formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function groupByDate(expenses: Expense[]) {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (!map.has(e.expense_date)) map.set(e.expense_date, []);
    map.get(e.expense_date)!.push(e);
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
}

function prettyDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    weekday: "short", day: "numeric", month: "short",
  });
}

// ─── Category Badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: Category }) {
  const cat = CAT_MAP[category];
  if (!cat) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cat.badge}`}>
      <cat.Icon className="w-3 h-3" />
      {cat.label}
    </span>
  );
}

// ─── Report Export Buttons ────────────────────────────────────────────────────

function ReportExportButtons({ expenses, shopName }: { expenses: Expense[]; shopName: string }) {
  const COLS: ReportColumn<Expense>[] = [
    { id: "date",     label: "Date",         defaultOn: true, accessor: (r) => r.expense_date },
    { id: "category", label: "Category",     defaultOn: true, accessor: (r) => r.category },
    { id: "note",     label: "Note",         defaultOn: true, accessor: (r) => r.note ?? "" },
    { id: "amount",   label: "Amount (PKR)", defaultOn: true, numeric: true, accessor: (r) => Number(r.amount) },
  ];
  const slug = shopName.replace(/\s+/g, "-").toLowerCase();
  const base = `expenses-${slug}-${new Date().toISOString().slice(0, 10)}`;
  const disabled = expenses.length === 0;
  return (
    <div className="flex items-center gap-1">
      <button
        disabled={disabled}
        onClick={() => downloadReportCsv({ filename: base, columns: COLS, rows: expenses, totalsRow: true })}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Export Excel"
      >
        <FileSpreadsheet className="w-3.5 h-3.5" />
        Excel
      </button>
      <button
        disabled={disabled}
        onClick={() => downloadReportPdf({ meta: { title: "Expenses Report", shopName, filename: base }, columns: COLS, rows: expenses, totalsRow: true })}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Export PDF"
      >
        <FileText className="w-3.5 h-3.5" />
        PDF
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FilterMode = "this_month" | "last_month" | "custom";

export function ExpensesClient() {
  const { branchId, branch } = useBranchContext();
  const { shop } = useShopContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFilter, setLoadingFilter] = useState(false);

  // Date filter
  const [filterMode, setFilterMode] = useState<FilterMode>("this_month");
  const { from: initFrom, to: initTo } = getThisMonthRange();
  const [customFrom, setCustomFrom] = useState(initFrom);
  const [customTo, setCustomTo] = useState(initTo);

  // Add form
  const [category, setCategory] = useState<Category>("electricity");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [isPending, startTransition] = useTransition();

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  // Load on mount
  useEffect(() => {
    if (!branchId) return;
    const { from, to } = getThisMonthRange();
    const supabase = createClient();
    supabase
      .from("dms_expenses")
      .select("*")
      .eq("branch_id", branchId)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) setExpenses(data as Expense[]);
        setLoading(false);
      });
  }, [branchId]);

  // Derived
  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);

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
  const activeCat = CAT_MAP[category];

  // Load range
  async function loadExpenses(from: string, to: string) {
    if (!branchId) return;
    setLoadingFilter(true);
    const result = await fetchExpenses(branchId, from, to);
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
    if (mode === "this_month") {
      const { from, to } = getThisMonthRange();
      loadExpenses(from, to);
    } else if (mode === "last_month") {
      loadExpenses(
        formatDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        formatDateInput(new Date(now.getFullYear(), now.getMonth(), 0))
      );
    } else {
      loadExpenses(customFrom, customTo);
    }
  }

  // Add
  function handleAdd() {
    const amountNum = parseFloat(amount);
    if (!branchId) return;
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (activeCat.noteRequired && !note.trim()) {
      toast({ title: `${activeCat.noteLabel.replace(" *", "")} is required`, variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await addExpense({
        branchId,
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
        applyFilter(filterMode);
      }
    });
  }

  // Delete
  function handleDelete(id: string) {
    if (!branchId) return;
    startDeleteTransition(async () => {
      const res = await deleteExpense(id, branchId);
      if (res?.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Deleted" });
        setExpenses((prev) => prev.filter((e) => e.id !== id));
      }
      setConfirmDelete(null);
    });
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-40 bg-muted animate-pulse rounded-lg" />
        <div className="h-24 bg-muted animate-pulse rounded-xl" />
        <div className="h-36 bg-muted animate-pulse rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-11 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ── Header + total ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Track all shop costs</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold tabular-nums leading-none">{formatPKR(total)}</p>
          <p className="text-xs text-muted-foreground mt-1">total this period</p>
        </div>
      </div>

      {/* ── Category breakdown (only if data) ── */}
      {total > 0 && (
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => catTotals[c.value] > 0).map((c) => (
            <div key={c.value} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${c.badge}`}>
              <c.Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{c.label}</span>
              <span className="font-bold tabular-nums">{formatPKR(catTotals[c.value])}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Expense Form ── */}
      <div className="rounded-xl border border-sidebar-border bg-card p-4 space-y-3">

        {/* Category picker — grouped */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Utility Bills</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.filter((c) => c.group === "bills").map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => { setCategory(c.value); setNote(""); }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  category === c.value ? `${c.badge}` : "border-sidebar-border text-muted-foreground hover:bg-muted/30"
                }`}
              >
                <c.Icon className="w-3 h-3" />
                {c.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground font-medium pt-1">Other</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.filter((c) => c.group !== "bills").map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => { setCategory(c.value); setNote(""); }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  category === c.value ? `${c.badge}` : "border-sidebar-border text-muted-foreground hover:bg-muted/30"
                }`}
              >
                <c.Icon className="w-3 h-3" />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div className="flex flex-wrap items-end gap-2">
          {/* Amount */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Amount (PKR)</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">PKR</span>
              <input
                type="number" min="1" placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-36 pl-9 pr-3 h-9 rounded-md bg-background border border-sidebar-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Dynamic note field */}
          <div className="flex-1 min-w-[160px] space-y-1">
            <label className="text-xs text-muted-foreground">{activeCat.noteLabel}</label>
            <input
              type="text"
              placeholder={activeCat.notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full h-9 px-3 rounded-md bg-background border border-sidebar-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date</label>
            <input
              type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 px-3 rounded-md bg-background border border-sidebar-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !amount}
            className="h-9 px-4 self-end inline-flex items-center gap-1.5 rounded-md text-sm font-semibold transition-colors
              bg-primary text-primary-foreground hover:bg-primary/90
              disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {isPending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* ── Date filter + list ── */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">

        {/* Filter toolbar */}
        <div className="px-3 py-2 border-b border-sidebar-border flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-0.5 bg-muted/20 rounded-lg p-0.5">
            {(["this_month", "last_month", "custom"] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => mode !== "custom" ? applyFilter(mode) : setFilterMode("custom")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterMode === mode ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "this_month" ? "This Month" : mode === "last_month" ? "Last Month" : "Custom"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {filterMode === "custom" && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-7 px-2 rounded-md bg-background border border-sidebar-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="h-7 px-2 rounded-md bg-background border border-sidebar-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <button onClick={() => applyFilter("custom")}
                  className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                  Apply
                </button>
              </>
            )}
            <ReportExportButtons
              expenses={expenses}
              shopName={`${shop?.shop_name ?? "Shop"} — ${branch?.name ?? "Branch"}`}
            />
          </div>
        </div>

        {/* List */}
        {loadingFilter ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
            <Receipt className="w-8 h-8 opacity-20" />
            <p className="text-sm">No expenses this period</p>
          </div>
        ) : (
          <div className="divide-y divide-sidebar-border">
            {grouped.map(([d, items]) => (
              <div key={d}>
                {/* Date row */}
                <div className="px-4 py-2 bg-muted/20 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">{prettyDate(d)}</p>
                  <p className="text-xs font-medium text-foreground">{formatPKR(items.reduce((s, e) => s + Number(e.amount), 0))}</p>
                </div>

                {/* Expense rows */}
                {items.map((expense) => {
                  const cat = CAT_MAP[expense.category];
                  return (
                    <div key={expense.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/10 transition-colors group">
                      {/* Icon */}
                      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${cat?.badge ?? "bg-zinc-500/10 border-zinc-500/20"}`}>
                        {cat ? <cat.Icon className="w-3.5 h-3.5" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
                      </div>

                      {/* Label + description */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none">{cat?.label ?? expense.category}</p>
                        {expense.note && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{expense.note}</p>
                        )}
                      </div>

                      {/* Amount */}
                      <p className="text-sm font-bold tabular-nums shrink-0">{formatPKR(Number(expense.amount))}</p>

                      {/* Delete */}
                      {confirmDelete === expense.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleDelete(expense.id)}
                            disabled={isDeleting}
                            className="px-2 py-1 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                          >
                            {isDeleting ? "…" : "Delete"}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 rounded text-xs text-muted-foreground border border-sidebar-border hover:bg-muted/30 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(expense.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 opacity-0 group-hover:opacity-100 sm:opacity-100"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
