"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import {
  BookOpen,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
  Trash2,
  Plus,
  Phone,
  Building2,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { cn, formatDateInput } from "@/lib/utils";
import { useShopContext } from "@/contexts/shop-context";
import { createClient } from "@/lib/supabase/client";
import { addLedgerEntry, deleteLedgerEntry } from "@/app/actions/supplier-ledger";
import type { SupplierBalance, SupplierLedgerEntry } from "@/types";
import Link from "next/link";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pkr(amount: number) {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function LedgerTableSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialBalances: SupplierBalance[];
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SupplierLedgerClient({ initialBalances }: Props) {
  const { shopId } = useShopContext();

  // ── State ─────────────────────────────────────────────────────────────────
  const [balances, setBalances] = useState<SupplierBalance[]>(initialBalances);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<SupplierLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // On mobile, show full-screen ledger pane when a supplier is selected
  const [mobileView, setMobileView] = useState<"list" | "ledger">("list");

  // Entry form
  const [entryType, setEntryType] = useState<"purchase" | "payment">("purchase");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [txDate, setTxDate] = useState(formatDateInput(new Date()));

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // ── Derived ───────────────────────────────────────────────────────────────

  const selected = useMemo(
    () => balances.find((b) => b.supplier.id === selectedId) ?? null,
    [balances, selectedId]
  );

  const totalOutstanding = useMemo(
    () => balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0),
    [balances]
  );

  // Ledger sorted by date desc; running balance computed ascending then reversed
  const ledgerWithBalance = useMemo(() => {
    const ascending = [...ledger].sort(
      (a, b) =>
        new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime() ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let running = 0;
    const withBal = ascending.map((e) => {
      running += e.type === "purchase" ? e.amount : -e.amount;
      return { ...e, running };
    });
    return withBal.reverse(); // most recent first
  }, [ledger]);

  // ── Load ledger for a supplier ────────────────────────────────────────────

  const loadLedger = useCallback(
    async (supplierId: string) => {
      if (!shopId) return;
      setLedgerLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("dms_supplier_ledger")
        .select("*, supplier:dms_suppliers(id, name, brand)")
        .eq("shop_id", shopId)
        .eq("supplier_id", supplierId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        toast({ title: "Failed to load ledger", description: error.message, variant: "destructive" });
      } else {
        setLedger((data as SupplierLedgerEntry[]) ?? []);
      }
      setLedgerLoading(false);
    },
    [shopId]
  );

  // ── Refresh balances ──────────────────────────────────────────────────────

  const refreshBalances = useCallback(async () => {
    if (!shopId) return;
    const supabase = createClient();
    const [{ data: suppliers }, { data: ledgerAll }] = await Promise.all([
      supabase.from("dms_suppliers").select("*").eq("shop_id", shopId).order("name"),
      supabase
        .from("dms_supplier_ledger")
        .select("supplier_id, type, amount")
        .eq("shop_id", shopId),
    ]);
    const rows = (suppliers ?? []) as SupplierBalance["supplier"][];
    const entries = (ledgerAll ?? []) as { supplier_id: string; type: string; amount: number }[];
    const newBalances = rows.map((s) => {
      const mine = entries.filter((e) => e.supplier_id === s.id);
      const total_purchased = mine
        .filter((e) => e.type === "purchase")
        .reduce((a, e) => a + e.amount, 0);
      const total_paid = mine
        .filter((e) => e.type === "payment")
        .reduce((a, e) => a + e.amount, 0);
      return { supplier: s, total_purchased, total_paid, balance: total_purchased - total_paid };
    });
    setBalances(newBalances);
  }, [shopId]);

  // ── Select supplier ───────────────────────────────────────────────────────

  function selectSupplier(id: string) {
    setSelectedId(id);
    setMobileView("ledger");
    loadLedger(id);
    // Reset form
    setEntryType("purchase");
    setAmount("");
    setNote("");
    setTxDate(formatDateInput(new Date()));
  }

  // ── Add entry ─────────────────────────────────────────────────────────────

  function handleAddEntry() {
    const parsedAmount = parseFloat(amount);
    if (!shopId || !selectedId) return;
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid amount greater than 0.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const result = await addLedgerEntry({
        shopId,
        supplierId: selectedId,
        type: entryType,
        amount: parsedAmount,
        note: note.trim() || undefined,
        transactionDate: txDate,
      });
      if (result?.error) {
        toast({ title: "Failed to add entry", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Entry added", description: `${entryType === "purchase" ? "Purchase" : "Payment"} of ${pkr(parsedAmount)} recorded.` });
      setAmount("");
      setNote("");
      setTxDate(formatDateInput(new Date()));
      await Promise.all([loadLedger(selectedId), refreshBalances()]);
    });
  }

  // ── Delete entry ──────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    setDeleteTarget(id);
  }

  function confirmDelete() {
    if (!deleteTarget || !shopId) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteLedgerEntry(id, shopId);
      if (result?.error) {
        toast({ title: "Failed to delete", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Entry deleted" });
      if (selectedId) {
        await Promise.all([loadLedger(selectedId), refreshBalances()]);
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-0">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <BookOpen className="h-5 w-5 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Supplier Ledger</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">
          Track purchases and payments to suppliers — your khata book.
        </p>
      </div>

      {/* Two-pane layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 gap-4">
        {/* ── LEFT PANE: Supplier list ───────────────────────────── */}
        <div
          className={cn(
            "flex flex-col w-full md:w-[340px] md:flex-shrink-0",
            // On mobile: hide list when in ledger view
            mobileView === "ledger" ? "hidden md:flex" : "flex"
          )}
        >
          {/* Total outstanding summary */}
          <div className="rounded-xl border border-sidebar-border bg-card p-4 mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Total Outstanding
            </p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                totalOutstanding > 0 ? "text-red-400" : "text-green-400"
              )}
            >
              {pkr(totalOutstanding)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              across {balances.length} supplier{balances.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Supplier list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 scrollbar-hide">
            {balances.length === 0 ? (
              <div className="rounded-xl border border-sidebar-border bg-card p-6 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">No suppliers yet.</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Add suppliers in Products to start tracking.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/products">Go to Products</Link>
                </Button>
              </div>
            ) : (
              balances.map((b) => (
                <button
                  key={b.supplier.id}
                  onClick={() => selectSupplier(b.supplier.id)}
                  className={cn(
                    "w-full text-left rounded-xl border p-4 transition-all duration-150",
                    "hover:border-amber-500/40 hover:bg-amber-500/5",
                    selectedId === b.supplier.id
                      ? "border-amber-500/60 bg-amber-500/8 ring-1 ring-amber-500/30"
                      : "border-sidebar-border bg-card"
                  )}
                >
                  {/* Supplier name + brand */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {b.supplier.name}
                      </p>
                      {b.supplier.brand && (
                        <p className="text-xs text-muted-foreground truncate">{b.supplier.brand}</p>
                      )}
                    </div>
                    {b.balance <= 0 ? (
                      <span className="flex-shrink-0 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                        Settled
                      </span>
                    ) : (
                      <span className="flex-shrink-0 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                        Due
                      </span>
                    )}
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Purchased</p>
                      <p className="font-medium tabular-nums text-foreground">
                        {pkr(b.total_purchased)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Paid</p>
                      <p className="font-medium tabular-nums text-green-400">
                        {pkr(b.total_paid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Balance</p>
                      <p
                        className={cn(
                          "font-bold tabular-nums",
                          b.balance > 0 ? "text-red-400" : "text-green-400"
                        )}
                      >
                        {pkr(Math.abs(b.balance))}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: Selected supplier ledger ───────────────── */}
        <div
          className={cn(
            "flex flex-col flex-1 min-w-0",
            mobileView === "list" ? "hidden md:flex" : "flex"
          )}
        >
          {!selected ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-xl border border-sidebar-border bg-card text-center p-8">
              <div className="p-4 rounded-full bg-white/5 mb-4">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold text-foreground mb-1">
                Select a supplier to view their ledger
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Click any supplier on the left to see their full transaction history and add new entries.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Mobile back button */}
              <button
                onClick={() => {
                  setMobileView("list");
                  setSelectedId(null);
                }}
                className="md:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to suppliers
              </button>

              {/* Summary header */}
              <div className="rounded-xl border border-sidebar-border bg-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <h2 className="text-lg font-bold text-foreground truncate">
                        {selected.supplier.name}
                      </h2>
                    </div>
                    {selected.supplier.brand && (
                      <p className="text-sm text-muted-foreground mb-1 ml-6">
                        {selected.supplier.brand}
                      </p>
                    )}
                    {selected.supplier.contact && (
                      <div className="flex items-center gap-1.5 ml-6 mt-1">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {selected.supplier.contact}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Big balance display */}
                  <div className="text-right flex-shrink-0">
                    {selected.balance <= 0 ? (
                      <div className="flex items-center gap-2 justify-end">
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                        <p className="text-2xl font-bold text-green-400">Settled</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 justify-end">
                        <AlertCircle className="h-5 w-5 text-red-400" />
                        <p className="text-2xl font-bold text-red-400">
                          {pkr(selected.balance)} outstanding
                        </p>
                      </div>
                    )}
                    <div className="flex gap-4 justify-end mt-2 text-xs text-muted-foreground">
                      <span>
                        Purchased:{" "}
                        <span className="text-foreground font-medium">
                          {pkr(selected.total_purchased)}
                        </span>
                      </span>
                      <span>
                        Paid:{" "}
                        <span className="text-green-400 font-medium">
                          {pkr(selected.total_paid)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Add entry form */}
              <div className="rounded-xl border border-sidebar-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-amber-400" />
                  Add Entry
                </h3>

                {/* Type toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setEntryType("purchase")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium border transition-all",
                      entryType === "purchase"
                        ? "bg-red-500/15 border-red-500/40 text-red-300"
                        : "bg-transparent border-sidebar-border text-muted-foreground hover:border-red-500/25 hover:text-red-400"
                    )}
                  >
                    <TrendingDown className="h-4 w-4" />
                    Purchase
                  </button>
                  <button
                    onClick={() => setEntryType("payment")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium border transition-all",
                      entryType === "payment"
                        ? "bg-green-500/15 border-green-500/40 text-green-300"
                        : "bg-transparent border-sidebar-border text-muted-foreground hover:border-green-500/25 hover:text-green-400"
                    )}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Payment
                  </button>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Amount (PKR)</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddEntry()}
                      className="bg-background border-sidebar-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Input
                      type="date"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="bg-background border-sidebar-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                    <Input
                      placeholder="e.g. Invoice #42"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddEntry()}
                      className="bg-background border-sidebar-border"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAddEntry}
                  disabled={isPending || !amount}
                  className="mt-4 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Adding...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add Entry
                    </span>
                  )}
                </Button>
              </div>

              {/* Transaction history */}
              <div className="flex-1 min-h-0 rounded-xl border border-sidebar-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Transaction History
                  {ledger.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {ledger.length} entr{ledger.length === 1 ? "y" : "ies"}
                    </span>
                  )}
                </h3>

                {ledgerLoading ? (
                  <LedgerTableSkeleton />
                ) : ledgerWithBalance.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Wallet className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No transactions yet. Add the first entry above.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm min-w-[540px]">
                      <thead>
                        <tr className="border-b border-sidebar-border">
                          <th className="text-left text-xs text-muted-foreground font-medium pb-2.5 px-1">
                            Date
                          </th>
                          <th className="text-left text-xs text-muted-foreground font-medium pb-2.5 px-1">
                            Type
                          </th>
                          <th className="text-right text-xs text-muted-foreground font-medium pb-2.5 px-1">
                            Amount
                          </th>
                          <th className="text-left text-xs text-muted-foreground font-medium pb-2.5 px-1">
                            Note
                          </th>
                          <th className="text-right text-xs text-muted-foreground font-medium pb-2.5 px-1">
                            Balance
                          </th>
                          <th className="pb-2.5 px-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerWithBalance.map((entry) => (
                          <tr
                            key={entry.id}
                            className="border-b border-sidebar-border/50 last:border-0 hover:bg-white/[0.02] transition-colors group"
                          >
                            <td className="py-3 px-1 text-muted-foreground whitespace-nowrap">
                              {fmtDate(entry.transaction_date)}
                            </td>
                            <td className="py-3 px-1">
                              {entry.type === "purchase" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                                  <TrendingDown className="h-3 w-3" />
                                  Purchase
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                                  <TrendingUp className="h-3 w-3" />
                                  Payment
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-1 text-right tabular-nums font-medium">
                              <span
                                className={
                                  entry.type === "purchase" ? "text-red-400" : "text-green-400"
                                }
                              >
                                {entry.type === "purchase" ? "+" : "-"}
                                {pkr(entry.amount)}
                              </span>
                            </td>
                            <td className="py-3 px-1 text-muted-foreground max-w-[160px] truncate">
                              {entry.note ?? (
                                <span className="text-white/20 text-xs italic">—</span>
                              )}
                            </td>
                            <td className="py-3 px-1 text-right tabular-nums font-semibold">
                              <span
                                className={
                                  entry.running > 0
                                    ? "text-red-400"
                                    : entry.running === 0
                                    ? "text-green-400"
                                    : "text-green-400"
                                }
                              >
                                {pkr(Math.abs(entry.running))}
                                {entry.running < 0 && (
                                  <span className="text-xs font-normal ml-1 text-green-500">
                                    (overpaid)
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-3 px-1">
                              <button
                                onClick={() => handleDelete(entry.id)}
                                disabled={isPending}
                                className="opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                title="Delete entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete entry?"
        description="This will permanently remove this transaction from the ledger. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
