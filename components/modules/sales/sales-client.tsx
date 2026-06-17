"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ShoppingCart, Plus, Pencil, Trash2, Search, Calendar,
  CreditCard, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { formatDateInput } from "@/lib/utils";
import { addSale, editSale, deleteSale } from "@/app/actions/sales";
import { fetchSales } from "@/app/actions/sales-data";
import type { Sale, Product } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPKR(amount: number) {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

function todayStr() {
  return formatDateInput(new Date());
}

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return formatDateInput(d);
}

function startOfMonth() {
  const d = new Date();
  return formatDateInput(new Date(d.getFullYear(), d.getMonth(), 1));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DateFilter = "today" | "week" | "month" | "custom";

interface AddFormState {
  productId: string;
  quantity: string;
  unitPrice: string;
  paymentMode: "cash" | "credit";
  customerName: string;
  saleDate: string;
}

const emptyAddForm = (): AddFormState => ({
  productId: "",
  quantity: "1",
  unitPrice: "",
  paymentMode: "cash",
  customerName: "",
  saleDate: todayStr(),
});

interface EditFormState {
  productId: string;
  quantity: string;
  unitPrice: string;
  paymentMode: "cash" | "credit";
  customerName: string;
  saleDate: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialSales: Sale[];
  initialProducts: Product[];
  shopId: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PaymentBadge({ mode }: { mode: "cash" | "credit" }) {
  if (mode === "cash") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <Banknote className="w-3 h-3" /> Cash
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
      <CreditCard className="w-3 h-3" /> Credit
    </span>
  );
}

function PaymentToggle({
  value,
  onChange,
}: {
  value: "cash" | "credit";
  onChange: (v: "cash" | "credit") => void;
}) {
  return (
    <div className="flex rounded-lg border border-sidebar-border overflow-hidden">
      {(["cash", "credit"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={[
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
            value === mode && mode === "cash"
              ? "bg-emerald-500/20 text-emerald-400"
              : value === mode && mode === "credit"
                ? "bg-blue-500/20 text-blue-400"
                : "text-muted-foreground hover:bg-muted/30",
            mode === "cash" ? "border-r border-sidebar-border" : "",
          ].join(" ")}
        >
          {mode === "cash" ? <Banknote className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
          {mode === "cash" ? "Cash" : "Credit"}
        </button>
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 8 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-muted rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SalesClient({ initialSales, initialProducts, shopId }: Props) {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [products] = useState<Product[]>(initialProducts);
  const [loadingSales, setLoadingSales] = useState(false);

  // ── Date filter state ────────────────────────────────────────────────────────
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());

  // ── Quick-add form ───────────────────────────────────────────────────────────
  const [addForm, setAddForm] = useState<AddFormState>(emptyAddForm());
  const [addSubmitting, setAddSubmitting] = useState(false);

  // ── Search ───────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");

  // ── Edit dialog ──────────────────────────────────────────────────────────────
  const [editSaleRow, setEditSaleRow] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── Delete dialog ────────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ── Derived: product map ─────────────────────────────────────────────────────
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // ── Derived: computed total in add form ──────────────────────────────────────
  const addFormTotal = useMemo(() => {
    const qty = parseFloat(addForm.quantity) || 0;
    const price = parseFloat(addForm.unitPrice) || 0;
    return qty * price;
  }, [addForm.quantity, addForm.unitPrice]);

  // ── Derived: filtered sales (search) ────────────────────────────────────────
  const filteredSales = useMemo(() => {
    if (!search.trim()) return sales;
    const q = search.toLowerCase();
    return sales.filter(
      (s) =>
        (s.product?.name ?? "").toLowerCase().includes(q) ||
        (s.customer_name ?? "").toLowerCase().includes(q)
    );
  }, [sales, search]);

  // ── Derived: today's running total ──────────────────────────────────────────
  const { dailyTotal, dailyCount } = useMemo(() => {
    const today = todayStr();
    const todaySales = sales.filter((s) => s.sale_date === today);
    return {
      dailyTotal: todaySales.reduce((acc, s) => acc + s.total, 0),
      dailyCount: todaySales.length,
    };
  }, [sales]);

  // ── Active date range ────────────────────────────────────────────────────────
  const { activeFrom, activeTo } = useMemo(() => {
    switch (dateFilter) {
      case "today":  return { activeFrom: todayStr(),     activeTo: todayStr() };
      case "week":   return { activeFrom: startOfWeek(), activeTo: todayStr() };
      case "month":  return { activeFrom: startOfMonth(), activeTo: todayStr() };
      case "custom": return { activeFrom: customFrom,    activeTo: customTo };
    }
  }, [dateFilter, customFrom, customTo]);

  // ── Reload sales for current date range ─────────────────────────────────────
  const reloadSales = useCallback(
    async (f: string, t: string) => {
      setLoadingSales(true);
      try {
        const result = await fetchSales(shopId, f, t);
        setSales(result);
      } catch {
        toast({ title: "Error", description: "Failed to load sales.", variant: "destructive" });
      } finally {
        setLoadingSales(false);
      }
    },
    [shopId]
  );

  // ── Handle date filter tab change ────────────────────────────────────────────
  async function handleDateFilterChange(filter: DateFilter) {
    setDateFilter(filter);
    let f: string, t: string;
    switch (filter) {
      case "today":  f = todayStr();      t = todayStr(); break;
      case "week":   f = startOfWeek();   t = todayStr(); break;
      case "month":  f = startOfMonth();  t = todayStr(); break;
      case "custom": f = customFrom;      t = customTo;   break;
      default:       f = todayStr();      t = todayStr();
    }
    await reloadSales(f, t);
  }

  // ── Product selection in add form ────────────────────────────────────────────
  function handleAddProductChange(productId: string) {
    const product = productMap.get(productId);
    setAddForm((prev) => ({
      ...prev,
      productId,
      unitPrice: product ? String(product.sale_price) : "",
    }));
  }

  // ── Submit add form ──────────────────────────────────────────────────────────
  async function handleAddSale(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.productId) {
      toast({ title: "Select a product", variant: "destructive" });
      return;
    }
    const quantity = parseFloat(addForm.quantity);
    const unitPrice = parseFloat(addForm.unitPrice);
    if (!quantity || quantity <= 0) {
      toast({ title: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }

    setAddSubmitting(true);
    const result = await addSale({
      shopId,
      productId: addForm.productId,
      quantity,
      unitPrice,
      paymentMode: addForm.paymentMode,
      customerName: addForm.customerName.trim() || undefined,
      saleDate: addForm.saleDate,
    });
    setAddSubmitting(false);

    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Sale recorded" });
    setAddForm(emptyAddForm());
    await reloadSales(activeFrom, activeTo);
  }

  // ── Open edit dialog ─────────────────────────────────────────────────────────
  function openEdit(sale: Sale) {
    setEditSaleRow(sale);
    setEditForm({
      productId: sale.product_id,
      quantity: String(sale.quantity),
      unitPrice: String(sale.unit_price),
      paymentMode: sale.payment_mode,
      customerName: sale.customer_name ?? "",
      saleDate: sale.sale_date,
    });
  }

  function closeEdit() {
    setEditSaleRow(null);
    setEditForm(null);
  }

  // ── Computed total in edit form ──────────────────────────────────────────────
  const editFormTotal = useMemo(() => {
    if (!editForm) return 0;
    return (parseFloat(editForm.quantity) || 0) * (parseFloat(editForm.unitPrice) || 0);
  }, [editForm]);

  // ── Submit edit ──────────────────────────────────────────────────────────────
  async function handleEditSave() {
    if (!editSaleRow || !editForm) return;
    const quantity = parseFloat(editForm.quantity);
    const unitPrice = parseFloat(editForm.unitPrice);
    if (!quantity || quantity <= 0) {
      toast({ title: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }
    setEditSubmitting(true);
    const result = await editSale(editSaleRow.id, shopId, {
      productId: editForm.productId,
      quantity,
      unitPrice,
      paymentMode: editForm.paymentMode,
      customerName: editForm.customerName.trim() || undefined,
      saleDate: editForm.saleDate,
    });
    setEditSubmitting(false);

    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Sale updated" });
    closeEdit();
    await reloadSales(activeFrom, activeTo);
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return;
    setDeleteSubmitting(true);
    const result = await deleteSale(deleteId, shopId);
    setDeleteSubmitting(false);

    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Sale deleted" });
      await reloadSales(activeFrom, activeTo);
    }
    setDeleteId(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
        <p className="text-muted-foreground text-sm mt-1">Record and review sales transactions</p>
      </div>

      {/* ── Running Daily Total ── */}
      <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/20">
            <ShoppingCart className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Today&apos;s Sales</p>
            <p className="text-3xl font-bold text-amber-400 tabular-nums">{formatPKR(dailyTotal)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-xl font-semibold text-foreground">{dailyCount}</span>
          <span>transaction{dailyCount !== 1 ? "s" : ""} today</span>
        </div>
      </div>

      {/* ── Quick Add Form ── */}
      <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick Add Sale</h2>
        </div>

        <form onSubmit={handleAddSale} className="space-y-4">
          {/* Row 1: Product + Qty + Unit Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* Product dropdown — spans 2 cols on xl */}
            <div className="space-y-1.5 xl:col-span-2">
              <Label htmlFor="add-product">Product *</Label>
              <Select value={addForm.productId} onValueChange={handleAddProductChange}>
                <SelectTrigger id="add-product" className="w-full">
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No products found
                    </div>
                  ) : (
                    products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span>{p.name}</span>
                        <span className="ml-2 text-muted-foreground text-xs">
                          — {formatPKR(p.sale_price)}/{p.unit}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="add-qty">Quantity *</Label>
              <Input
                id="add-qty"
                type="number"
                min="0.001"
                step="any"
                placeholder="1"
                value={addForm.quantity}
                onChange={(e) => setAddForm((prev) => ({ ...prev, quantity: e.target.value }))}
              />
            </div>

            {/* Unit Price */}
            <div className="space-y-1.5">
              <Label htmlFor="add-price">Unit Price (PKR) *</Label>
              <Input
                id="add-price"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={addForm.unitPrice}
                onChange={(e) => setAddForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
              />
            </div>
          </div>

          {/* Row 2: Total + Payment Mode + Customer + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
            {/* Total (read-only) */}
            <div className="space-y-1.5">
              <Label>Total</Label>
              <div className="h-9 px-3 flex items-center rounded-md border border-sidebar-border bg-muted/40 text-sm font-semibold text-amber-400 tabular-nums">
                {formatPKR(addFormTotal)}
              </div>
            </div>

            {/* Payment Mode */}
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <PaymentToggle
                value={addForm.paymentMode}
                onChange={(v) => setAddForm((prev) => ({ ...prev, paymentMode: v }))}
              />
            </div>

            {/* Customer Name */}
            <div className="space-y-1.5">
              <Label htmlFor="add-customer">Customer Name</Label>
              <Input
                id="add-customer"
                placeholder="Optional"
                value={addForm.customerName}
                onChange={(e) => setAddForm((prev) => ({ ...prev, customerName: e.target.value }))}
              />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <DatePicker
                value={addForm.saleDate}
                onChange={(v) => setAddForm((prev) => ({ ...prev, saleDate: v }))}
                maxDate={new Date()}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={addSubmitting || !addForm.productId}
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              <Plus className="w-4 h-4" />
              {addSubmitting ? "Adding..." : "Add Sale"}
            </Button>
          </div>
        </form>
      </div>

      {/* ── Sales List ── */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">

        {/* Filters toolbar */}
        <div className="p-4 border-b border-sidebar-border flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Date filter tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-sidebar-border p-1 bg-muted/10">
            {(["today", "week", "month", "custom"] as DateFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => handleDateFilterChange(f)}
                className={[
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  dateFilter === f
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                ].join(" ")}
              >
                {f === "week" ? "This Week" : f === "month" ? "This Month" : f === "custom" ? "Custom" : "Today"}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search product, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        {/* Custom date range pickers */}
        {dateFilter === "custom" && (
          <div className="px-4 py-3 border-b border-sidebar-border flex flex-wrap items-end gap-3 bg-muted/10">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <DatePicker
                value={customFrom}
                onChange={setCustomFrom}
                maxDate={new Date()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <DatePicker
                value={customTo}
                onChange={setCustomTo}
                minDate={new Date(customFrom)}
                maxDate={new Date()}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reloadSales(customFrom, customTo)}
              className="gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" />
              Apply
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sidebar-border bg-muted/20">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Date</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Product</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Qty</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Unit Price</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Total</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Payment</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Customer</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-sidebar-border">
              {loadingSales ? (
                <SkeletonRows />
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <ShoppingCart className="w-10 h-10 opacity-25" />
                      <p className="font-medium text-sm">
                        No sales recorded yet. Add your first sale above.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-muted/15 transition-colors group">
                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(sale.sale_date + "T00:00:00").toLocaleDateString("en-PK", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>

                    {/* Product */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{sale.product?.name ?? "—"}</p>
                      {sale.product?.unit && (
                        <p className="text-xs text-muted-foreground">{sale.product.unit}</p>
                      )}
                    </td>

                    {/* Qty */}
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      {sale.quantity}
                    </td>

                    {/* Unit Price */}
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground hidden sm:table-cell">
                      {formatPKR(sale.unit_price)}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-amber-400">
                      {formatPKR(sale.total)}
                    </td>

                    {/* Payment */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <PaymentBadge mode={sale.payment_mode} />
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                      {sale.customer_name ?? (
                        <span className="opacity-40">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-60 group-hover:opacity-100 transition-opacity"
                          onClick={() => openEdit(sale)}
                          title="Edit sale"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive opacity-60 group-hover:opacity-100 transition-opacity"
                          onClick={() => setDeleteId(sale.id)}
                          title="Delete sale"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Footer total row */}
            {!loadingSales && filteredSales.length > 0 && (
              <tfoot>
                <tr className="border-t border-sidebar-border bg-muted/20">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-muted-foreground hidden sm:table-cell">
                    {filteredSales.length} transaction{filteredSales.length !== 1 ? "s" : ""}
                  </td>
                  <td colSpan={1} className="px-4 py-3 text-sm font-semibold text-muted-foreground sm:hidden">
                    {filteredSales.length} txn{filteredSales.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-amber-400 tabular-nums">
                    {formatPKR(filteredSales.reduce((acc, s) => acc + s.total, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Edit Dialog ── */}
      <Dialog
        open={!!editSaleRow}
        onOpenChange={(open) => { if (!open) closeEdit(); }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Sale</DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="space-y-4 py-2">
              {/* Product */}
              <div className="space-y-1.5">
                <Label>Product *</Label>
                <Select
                  value={editForm.productId}
                  onValueChange={(v) => {
                    const p = productMap.get(v);
                    setEditForm((prev) =>
                      prev
                        ? { ...prev, productId: v, unitPrice: p ? String(p.sale_price) : prev.unitPrice }
                        : prev
                    );
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="ml-2 text-muted-foreground text-xs">
                          — {formatPKR(p.sale_price)}/{p.unit}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Qty + Price */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min="0.001"
                    step="any"
                    value={editForm.quantity}
                    onChange={(e) =>
                      setEditForm((prev) => prev ? { ...prev, quantity: e.target.value } : prev)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Unit Price (PKR) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={editForm.unitPrice}
                    onChange={(e) =>
                      setEditForm((prev) => prev ? { ...prev, unitPrice: e.target.value } : prev)
                    }
                  />
                </div>
              </div>

              {/* Total (read-only) */}
              <div className="space-y-1.5">
                <Label>Total</Label>
                <div className="h-9 px-3 flex items-center rounded-md border border-sidebar-border bg-muted/40 text-sm font-semibold text-amber-400">
                  {formatPKR(editFormTotal)}
                </div>
              </div>

              {/* Payment Mode */}
              <div className="space-y-1.5">
                <Label>Payment Mode</Label>
                <PaymentToggle
                  value={editForm.paymentMode}
                  onChange={(v) =>
                    setEditForm((prev) => prev ? { ...prev, paymentMode: v } : prev)
                  }
                />
              </div>

              {/* Customer */}
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input
                  placeholder="Optional"
                  value={editForm.customerName}
                  onChange={(e) =>
                    setEditForm((prev) => prev ? { ...prev, customerName: e.target.value } : prev)
                  }
                />
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label>Sale Date</Label>
                <DatePicker
                  value={editForm.saleDate}
                  onChange={(v) =>
                    setEditForm((prev) => prev ? { ...prev, saleDate: v } : prev)
                  }
                  maxDate={new Date()}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={editSubmitting || !editForm?.productId}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              {editSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete Sale"
        description="This sale will be permanently deleted and stock will be restored."
        confirmLabel={deleteSubmitting ? "Deleting..." : "Delete"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
