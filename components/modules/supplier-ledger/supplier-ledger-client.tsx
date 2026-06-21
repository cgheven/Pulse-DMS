"use client";

import { useState, useTransition, useCallback, useMemo, useEffect, Fragment } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronDown,
  Trash2,
  Plus,
  Phone,
  Building2,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Wallet,
  CreditCard,
  Clock,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn, formatDateInput } from "@/lib/utils";
import { useBranchContext } from "@/contexts/branch-context";
import { createClient } from "@/lib/supabase/client";
import { addInvoice, recordPayment, deleteLedgerEntry } from "@/app/actions/supplier-ledger";
import type { SupplierBalance, SupplierLedgerEntry, SupplierPayment } from "@/types";
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
  }).format(new Date(dateStr + "T00:00:00"));
}

type InvoiceStatus = "paid" | "partial" | "unpaid";

function getStatus(entry: SupplierLedgerEntry): InvoiceStatus {
  const paid = Number(entry.paid_amount);
  if (paid >= entry.amount) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === "paid")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" /> Paid
      </span>
    );
  if (status === "partial")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Clock className="h-3 w-3" /> Partial
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
      <AlertCircle className="h-3 w-3" /> Unpaid
    </span>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function BalanceListSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-20 bg-white/5 rounded-xl" />
      ))}
    </div>
  );
}

function InvoiceListSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}

// ── Pay Dialog ────────────────────────────────────────────────────────────────

interface PayDialogProps {
  invoice: SupplierLedgerEntry;
  branchId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function PayDialog({ invoice, branchId, onClose, onSuccess }: PayDialogProps) {
  const remaining = Math.max(0, invoice.amount - Number(invoice.paid_amount));
  const [amount, setAmount] = useState(String(remaining));
  const [payDate, setPayDate] = useState(formatDateInput(new Date()));
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function handlePay() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const result = await recordPayment({
        branchId,
        invoiceId: invoice.id,
        amount: parsed,
        paymentDate: payDate,
        note: note.trim() || undefined,
      });
      if (result?.error) {
        toast({ title: "Failed to record payment", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Payment recorded", description: `${pkr(parsed)} on ${fmtDate(payDate)}.` });
      onSuccess();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          {invoice.invoice_number && (
            <p className="text-xs text-muted-foreground">Invoice #{invoice.invoice_number}</p>
          )}
        </DialogHeader>

        <div className="space-y-2 bg-muted/20 rounded-lg p-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Invoice total</span>
            <span className="font-medium">{pkr(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Already paid</span>
            <span className="font-medium text-emerald-400">{pkr(Number(invoice.paid_amount))}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-sidebar-border/50 pt-2">
            <span className="text-muted-foreground font-medium">Remaining</span>
            <span className="font-bold text-red-400">{pkr(remaining)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment Amount (PKR)</Label>
            <Input
              type="number" min="1" step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="bg-background border-sidebar-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment Date</Label>
            <Input
              type="date" value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="bg-background border-sidebar-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Input
              placeholder="e.g. Bank transfer, Cash"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePay()}
              className="bg-background border-sidebar-border"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-sidebar-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={isPending}
            className="flex-1 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending ? (
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><CreditCard className="h-4 w-4" /> Record Payment</>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SupplierLedgerClient() {
  const { branchId } = useBranchContext();

  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<SupplierLedgerEntry[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "ledger">("list");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "unpaid" | "partial" | "paid">("all");

  // Add invoice form
  const [invAmount, setInvAmount] = useState("");
  const [invNumber, setInvNumber] = useState("");
  const [invNote, setInvNote] = useState("");
  const [invDate, setInvDate] = useState(formatDateInput(new Date()));

  // Pay dialog
  const [payTarget, setPayTarget] = useState<SupplierLedgerEntry | null>(null);

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

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return balances;
    const q = supplierSearch.toLowerCase();
    return balances.filter((sb) =>
      sb.supplier.name.toLowerCase().includes(q) ||
      (sb.supplier.brand ?? "").toLowerCase().includes(q)
    );
  }, [balances, supplierSearch]);

  // Only show purchase invoices; sort newest first
  const sortedInvoices = useMemo(
    () =>
      invoices
        .filter((e) => e.type === "purchase")
        .sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime() ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [invoices]
  );

  const visibleInvoices = useMemo(() => {
    if (invoiceFilter === "all") return sortedInvoices;
    return sortedInvoices.filter((inv) => getStatus(inv) === invoiceFilter);
  }, [sortedInvoices, invoiceFilter]);

  // ── Load invoices for a supplier ──────────────────────────────────────────

  const loadInvoices = useCallback(
    async (supplierId: string) => {
      if (!branchId) return;
      setInvoicesLoading(true);
      const supabase = createClient();
      const { data: invData, error: invErr } = await supabase
        .from("dms_supplier_ledger")
        .select("*")
        .eq("branch_id", branchId)
        .eq("supplier_id", supplierId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (invErr) {
        toast({ title: "Failed to load invoices", description: invErr.message, variant: "destructive" });
        setInvoicesLoading(false);
        return;
      }
      const invoiceList = (invData as SupplierLedgerEntry[]) ?? [];
      setInvoices(invoiceList);

      // Fetch all payments for these invoices in one query
      const invoiceIds = invoiceList.filter((e) => e.type === "purchase").map((e) => e.id);
      if (invoiceIds.length > 0) {
        const { data: payData } = await supabase
          .from("dms_supplier_payments")
          .select("*")
          .eq("branch_id", branchId)
          .in("invoice_id", invoiceIds)
          .order("payment_date", { ascending: false });
        setPayments((payData as SupplierPayment[]) ?? []);
      } else {
        setPayments([]);
      }
      setInvoicesLoading(false);
    },
    [branchId]
  );

  // ── Refresh supplier balances ─────────────────────────────────────────────

  const refreshBalances = useCallback(async () => {
    if (!branchId) return;
    const supabase = createClient();
    const [{ data: suppliers }, { data: ledgerAll }] = await Promise.all([
      supabase.from("dms_suppliers").select("*").eq("branch_id", branchId).order("name"),
      supabase
        .from("dms_supplier_ledger")
        .select("supplier_id, type, amount, paid_amount")
        .eq("branch_id", branchId),
    ]);
    const rows = (suppliers ?? []) as SupplierBalance["supplier"][];
    const entries = (ledgerAll ?? []) as { supplier_id: string; type: string; amount: number; paid_amount: number }[];
    const newBalances = rows.map((s) => {
      const mine = entries.filter((e) => e.supplier_id === s.id);
      const total_purchased = mine
        .filter((e) => e.type === "purchase")
        .reduce((a, e) => a + e.amount, 0);
      // Paid = old payment rows (legacy) + paid_amount on invoice rows
      const legacy_paid = mine
        .filter((e) => e.type === "payment")
        .reduce((a, e) => a + e.amount, 0);
      const invoice_paid = mine
        .filter((e) => e.type === "purchase")
        .reduce((a, e) => a + Number(e.paid_amount), 0);
      const total_paid = legacy_paid + invoice_paid;
      return { supplier: s, total_purchased, total_paid, balance: total_purchased - total_paid };
    });
    setBalances(newBalances);
    setBalancesLoading(false);
  }, [branchId]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  // ── Select supplier ───────────────────────────────────────────────────────

  function selectSupplier(id: string) {
    setSelectedId(id);
    setMobileView("ledger");
    setExpandedId(null);
    setPayments([]);
    setInvoiceFilter("all");
    loadInvoices(id);
    setInvAmount("");
    setInvNumber("");
    setInvNote("");
    setInvDate(formatDateInput(new Date()));
  }

  // ── Add invoice ───────────────────────────────────────────────────────────

  function handleAddInvoice() {
    const parsed = parseFloat(invAmount);
    if (!branchId || !selectedId) return;
    if (!invAmount || isNaN(parsed) || parsed <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid amount greater than 0.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const result = await addInvoice({
        branchId,
        supplierId: selectedId,
        amount: parsed,
        invoiceNumber: invNumber.trim() || undefined,
        note: invNote.trim() || undefined,
        transactionDate: invDate,
      });
      if (result?.error) {
        toast({ title: "Failed to add invoice", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Invoice added" });
      setInvAmount("");
      setInvNumber("");
      setInvNote("");
      setInvDate(formatDateInput(new Date()));
      await Promise.all([loadInvoices(selectedId), refreshBalances()]);
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function confirmDelete() {
    if (!deleteTarget || !branchId) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteLedgerEntry(id, branchId);
      if (result?.error) {
        toast({ title: "Failed to delete", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Invoice deleted" });
      if (selectedId) await Promise.all([loadInvoices(selectedId), refreshBalances()]);
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
          Track invoices and payments per supplier — know exactly what's outstanding.
        </p>
      </div>

      {/* Two-pane layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 gap-4">

        {/* ── LEFT PANE: Supplier list ───────────────────────────── */}
        <div className={cn(
          "flex flex-col w-full md:w-[340px] md:flex-shrink-0",
          mobileView === "ledger" ? "hidden md:flex" : "flex"
        )}>
          {/* Total outstanding */}
          <div className="rounded-xl border border-sidebar-border bg-card p-4 mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Outstanding</p>
            <p className={cn("text-2xl font-bold tabular-nums", totalOutstanding > 0 ? "text-red-400" : "text-emerald-400")}>
              {pkr(totalOutstanding)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              across {balances.length} supplier{balances.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Supplier search */}
          <div className="p-3 border border-sidebar-border rounded-xl bg-card mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                placeholder="Search supplier…"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                className="w-full pl-8 h-8 rounded-lg bg-muted/20 border border-sidebar-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Supplier list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 scrollbar-hide">
            {balancesLoading ? (
              <BalanceListSkeleton />
            ) : balances.length === 0 ? (
              <div className="rounded-xl border border-sidebar-border bg-card p-6 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium mb-1">No suppliers yet.</p>
                <p className="text-xs text-muted-foreground mb-4">Add suppliers in Products to start tracking.</p>
                <Link href="/products" className="text-xs text-amber-400 hover:underline">Go to Products →</Link>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="rounded-xl border border-sidebar-border bg-card p-6 text-center">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium mb-1">No suppliers found.</p>
                <p className="text-xs text-muted-foreground">Try a different search term.</p>
              </div>
            ) : (
              filteredSuppliers.map((b) => (
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
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{b.supplier.name}</p>
                      {b.supplier.brand && <p className="text-xs text-muted-foreground truncate">{b.supplier.brand}</p>}
                    </div>
                    {b.balance <= 0 ? (
                      <span className="flex-shrink-0 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">Settled</span>
                    ) : (
                      <span className="flex-shrink-0 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">Due</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Invoiced</p>
                      <p className="font-medium tabular-nums">{pkr(b.total_purchased)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Paid</p>
                      <p className="font-medium tabular-nums text-emerald-400">{pkr(b.total_paid)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Remaining</p>
                      <p className={cn("font-bold tabular-nums", b.balance > 0 ? "text-red-400" : "text-emerald-400")}>
                        {pkr(Math.abs(b.balance))}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: Invoices ───────────────────────────────── */}
        <div className={cn(
          "flex flex-col flex-1 min-w-0",
          mobileView === "list" ? "hidden md:flex" : "flex"
        )}>
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-xl border border-sidebar-border bg-card text-center p-8">
              <div className="p-4 rounded-full bg-white/5 mb-4">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mb-1">Select a supplier</p>
              <p className="text-sm text-muted-foreground max-w-xs">Click any supplier on the left to view their invoices and outstanding balance.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Mobile back */}
              <button
                onClick={() => { setMobileView("list"); setSelectedId(null); }}
                className="md:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to suppliers
              </button>

              {/* Supplier summary */}
              <div className="rounded-xl border border-sidebar-border bg-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <h2 className="text-lg font-bold truncate">{selected.supplier.name}</h2>
                    </div>
                    {selected.supplier.brand && (
                      <p className="text-sm text-muted-foreground mb-1 ml-6">{selected.supplier.brand}</p>
                    )}
                    {selected.supplier.contact && (
                      <div className="flex items-center gap-1.5 ml-6 mt-1">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{selected.supplier.contact}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {selected.balance <= 0 ? (
                      <div className="flex items-center gap-2 justify-end">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <p className="text-2xl font-bold text-emerald-400">Settled</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 justify-end">
                        <AlertCircle className="h-5 w-5 text-red-400" />
                        <p className="text-2xl font-bold text-red-400">{pkr(selected.balance)} due</p>
                      </div>
                    )}
                    <div className="flex gap-4 justify-end mt-2 text-xs text-muted-foreground">
                      <span>Invoiced: <span className="text-foreground font-medium">{pkr(selected.total_purchased)}</span></span>
                      <span>Paid: <span className="text-emerald-400 font-medium">{pkr(selected.total_paid)}</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Add invoice form */}
              <div className="rounded-xl border border-sidebar-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-amber-400" />
                  New Invoice
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Amount (PKR) *</Label>
                    <Input
                      type="number" min="1" step="1" placeholder="0"
                      value={invAmount}
                      onChange={(e) => setInvAmount(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddInvoice()}
                      className="bg-background border-sidebar-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Invoice # (optional)</Label>
                    <Input
                      placeholder="e.g. INV-2024"
                      value={invNumber}
                      onChange={(e) => setInvNumber(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddInvoice()}
                      className="bg-background border-sidebar-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Input
                      type="date" value={invDate}
                      onChange={(e) => setInvDate(e.target.value)}
                      className="bg-background border-sidebar-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                    <Input
                      placeholder="e.g. Panadol delivery"
                      value={invNote}
                      onChange={(e) => setInvNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddInvoice()}
                      className="bg-background border-sidebar-border"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddInvoice}
                  disabled={isPending || !invAmount}
                  className="mt-4 inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg text-sm font-semibold transition-colors
                    bg-amber text-black hover:opacity-90
                    disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <span className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <><Plus className="h-4 w-4" /> Add Invoice</>
                  )}
                </button>
              </div>

              {/* Invoice list */}
              <div className="flex-1 min-h-0 rounded-xl border border-sidebar-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Invoices
                  {sortedInvoices.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {visibleInvoices.length}{visibleInvoices.length !== sortedInvoices.length ? ` of ${sortedInvoices.length}` : ""} invoice{sortedInvoices.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </h3>

                {sortedInvoices.length > 0 && (
                  <div className="flex items-center gap-0.5 bg-muted/20 rounded-lg p-0.5 mb-4">
                    {(["all", "unpaid", "partial", "paid"] as const).map((f) => (
                      <button key={f} type="button" onClick={() => setInvoiceFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          invoiceFilter === f ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground"
                        }`}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                )}

                {invoicesLoading ? (
                  <InvoiceListSkeleton />
                ) : sortedInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Wallet className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No invoices yet. Add the first one above.</p>
                  </div>
                ) : visibleInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Receipt className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No invoices match the selected filter.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b border-sidebar-border">
                          <th className="text-left text-xs text-muted-foreground font-medium pb-2.5 px-2">Date</th>
                          <th className="text-left text-xs text-muted-foreground font-medium pb-2.5 px-2">Invoice #</th>
                          <th className="text-right text-xs text-muted-foreground font-medium pb-2.5 px-2">Total</th>
                          <th className="text-right text-xs text-muted-foreground font-medium pb-2.5 px-2">Paid</th>
                          <th className="text-right text-xs text-muted-foreground font-medium pb-2.5 px-2">Remaining</th>
                          <th className="text-center text-xs text-muted-foreground font-medium pb-2.5 px-2">Status</th>
                          <th className="pb-2.5 px-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleInvoices.map((inv) => {
                          const paid = Number(inv.paid_amount);
                          const remaining = Math.max(0, inv.amount - paid);
                          const status = getStatus(inv);
                          const invPayments = payments.filter((p) => p.invoice_id === inv.id);
                          const isExpanded = expandedId === inv.id;
                          return (
                            <Fragment key={inv.id}>
                              <tr
                                onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                                className="border-b border-sidebar-border/50 hover:bg-white/[0.02] transition-colors group cursor-pointer"
                              >
                                <td className="py-3.5 px-2 text-muted-foreground whitespace-nowrap text-xs">
                                  {fmtDate(inv.transaction_date)}
                                </td>
                                <td className="py-3.5 px-2">
                                  {inv.invoice_number ? (
                                    <span className="font-mono text-xs bg-muted/40 px-2 py-0.5 rounded text-foreground">
                                      #{inv.invoice_number}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40 text-xs italic">—</span>
                                  )}
                                  {inv.note && (
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[120px]">{inv.note}</p>
                                  )}
                                </td>
                                <td className="py-3.5 px-2 text-right tabular-nums font-medium">
                                  {pkr(inv.amount)}
                                </td>
                                <td className="py-3.5 px-2 text-right tabular-nums text-emerald-400 font-medium">
                                  {paid > 0 ? pkr(paid) : <span className="text-muted-foreground/40">—</span>}
                                </td>
                                <td className="py-3.5 px-2 text-right tabular-nums font-bold">
                                  <span className={remaining > 0 ? "text-red-400" : "text-emerald-400"}>
                                    {pkr(remaining)}
                                  </span>
                                </td>
                                <td className="py-3.5 px-2 text-center">
                                  <StatusBadge status={status} />
                                </td>
                                <td className="py-3.5 px-2">
                                  <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                                    {status !== "paid" && (
                                      <button
                                        onClick={() => setPayTarget(inv)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                                      >
                                        <CreditCard className="h-3 w-3" /> Pay
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setDeleteTarget(inv.id)}
                                      disabled={isPending}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                      title="Delete invoice"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                    <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", isExpanded && "rotate-180")} />
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="border-b border-sidebar-border/50 bg-muted/5">
                                  <td colSpan={7} className="px-4 pb-3 pt-0">
                                    {invPayments.length === 0 ? (
                                      <p className="text-xs text-muted-foreground/50 py-2 pl-2">No payments recorded yet.</p>
                                    ) : (
                                      <div className="mt-1 space-y-1">
                                        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider px-2 pt-1 pb-0.5">Payment History</p>
                                        {invPayments.map((p) => (
                                          <div key={p.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.payment_date)}</span>
                                            <span className="text-xs font-semibold text-emerald-400 tabular-nums">{pkr(p.amount)}</span>
                                            {p.note && <span className="text-xs text-muted-foreground truncate">{p.note}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pay dialog */}
      {payTarget && branchId && (
        <PayDialog
          invoice={payTarget}
          branchId={branchId}
          onClose={() => setPayTarget(null)}
          onSuccess={() => {
            if (selectedId) Promise.all([loadInvoices(selectedId), refreshBalances()]);
          }}
        />
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete invoice?"
        description="This will permanently remove this invoice. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
