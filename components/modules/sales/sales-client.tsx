"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { useShopContext } from "@/contexts/shop-context";
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="animate-pulse bg-muted rounded-xl h-9 w-48" />
        <div className="animate-pulse bg-muted rounded-xl h-4 w-36" />
      </div>
      <div className="animate-pulse bg-muted rounded-xl h-28" />
      <div className="animate-pulse bg-muted rounded-xl h-64" />
      <div className="animate-pulse bg-muted rounded-xl h-80" />
    </div>
  );
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

export function SalesClient() {
  const { shopId } = useShopContext();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingSales, setLoadingSales] = useState(false);

  // ── Initial data fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return;

    const supabase = createClient();
    const today = todayStr();

    async function loadInitialData() {
      setInitialLoading(true);
      try {
        const [salesRes, productsRes] = await Promise.all([
          supabase
            .from("dms_sales")
            .select("*, product:dms_products(id,name,unit)")
            .eq("shop_id", shopId)
            .eq("sale_date", today)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("dms_products")
            .select("*")
            .eq("shop_id", shopId)
            .order("name"),
        ]);

        if (salesRes.data) setSales(salesRes.data as Sale[]);
        if (productsRes.data) setProducts(productsRes.data as Product[]);
      } finally {
        setInitialLoading(false);
      }
    }

    loadInitialData();
  }, [shopId]);

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

  // ── Computed total in edit form ──────────────────────────────────────────────
  const editFormTotal = useMemo(() => {
    if (!editForm) return 0;
    return (parseFloat(editForm.quantity) || 0) * (parseFloat(editForm.unitPrice) || 0);
  }, [editForm]);

  // ── Reload sales for current date range ─────────────────────────────────────
  const reloadSales = useCallback(
    async (f: string, t: string) => {
      if (!shopId) return;
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

  // ── Early return while initial data loads ────────────────────────────────────
  if (initialLoading) {
    return <PageSkeleton />;
  }

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
    if (!shopId) return;
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

  // ── Submit edit ──────────────────────────────────────────────────────────────
  async function handleEditSave() {
    if (!editSaleRow || !editForm || !shopId) return;
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
    if (!deleteId || !shopId) return;
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
    <div className="space-y-4">

      {/* ── Header + today's total ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Record and track daily transactions</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-amber-400 tabular-nums leading-none">{formatPKR(dailyTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {dailyCount} transaction{dailyCount !== 1 ? "s" : ""} today
          </p>
        </div>
      </div>

      {/* ── Add Sale Form ── */}
      <div className="rounded-xl border border-sidebar-border bg-card p-4">
        <form onSubmit={handleAddSale} className="space-y-3">

          {/* Row 1: Product · Qty · Price · Total */}
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 sm:col-span-5 space-y-1">
              <Label className="text-xs text-muted-foreground">Product</Label>
              <Select value={addForm.productId} onValueChange={handleAddProductChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select product…" />
                </SelectTrigger>
                <SelectContent>
                  {products.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No products yet</div>
                  ) : (
                    products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="ml-1.5 text-muted-foreground text-xs">— {formatPKR(p.sale_price)}/{p.unit}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-4 sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Qty</Label>
              <Input
                type="number" min="0.001" step="any" placeholder="1"
                value={addForm.quantity}
                onChange={(e) => setAddForm((p) => ({ ...p, quantity: e.target.value }))}
                className="h-9"
              />
            </div>

            <div className="col-span-4 sm:col-span-3 space-y-1">
              <Label className="text-xs text-muted-foreground">Price (PKR)</Label>
              <Input
                type="number" min="0" step="any" placeholder="0"
                value={addForm.unitPrice}
                onChange={(e) => setAddForm((p) => ({ ...p, unitPrice: e.target.value }))}
                className="h-9"
              />
            </div>

            <div className="col-span-4 sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Total</Label>
              <div className="h-9 px-3 flex items-center rounded-md border border-sidebar-border bg-muted/30 text-sm font-bold text-amber-400 tabular-nums">
                {addFormTotal > 0 ? formatPKR(addFormTotal) : <span className="text-muted-foreground/40 font-normal">—</span>}
              </div>
            </div>
          </div>

          {/* Row 2: Payment · Customer · Date · Submit */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Payment</Label>
              <PaymentToggle
                value={addForm.paymentMode}
                onChange={(v) => setAddForm((p) => ({ ...p, paymentMode: v }))}
              />
            </div>

            <div className="flex-1 min-w-[130px] space-y-1">
              <Label className="text-xs text-muted-foreground">Customer (optional)</Label>
              <Input
                placeholder="Name…"
                value={addForm.customerName}
                onChange={(e) => setAddForm((p) => ({ ...p, customerName: e.target.value }))}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <DatePicker
                value={addForm.saleDate}
                onChange={(v) => setAddForm((p) => ({ ...p, saleDate: v }))}
                maxDate={new Date()}
              />
            </div>

            <button
              type="submit"
              disabled={addSubmitting || !addForm.productId}
              className="h-9 px-4 self-end inline-flex items-center gap-1.5 rounded-md text-sm font-semibold transition-colors
                bg-amber-500 text-black hover:bg-amber-400
                disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {addSubmitting ? "Adding…" : "Add Sale"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Sales List ── */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">

        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-sidebar-border flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-0.5 bg-muted/20 rounded-lg p-0.5">
            {(["today", "week", "month", "custom"] as DateFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => handleDateFilterChange(f)}
                className={[
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  dateFilter === f
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {f === "week" ? "Week" : f === "month" ? "Month" : f === "custom" ? "Custom" : "Today"}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs w-36"
            />
          </div>
        </div>

        {/* Custom date range */}
        {dateFilter === "custom" && (
          <div className="px-3 py-2 border-b border-sidebar-border flex flex-wrap items-center gap-2 bg-muted/10">
            <span className="text-xs text-muted-foreground">From</span>
            <DatePicker value={customFrom} onChange={setCustomFrom} maxDate={new Date()} />
            <span className="text-xs text-muted-foreground">to</span>
            <DatePicker value={customTo} onChange={setCustomTo} minDate={new Date(customFrom)} maxDate={new Date()} />
            <Button size="sm" variant="outline" onClick={() => reloadSales(customFrom, customTo)} className="h-7 text-xs gap-1 px-2.5">
              <Calendar className="w-3 h-3" /> Apply
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sidebar-border bg-muted/10">
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Date</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Product</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell">Qty × Price</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">Total</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Mode</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 hidden lg:table-cell">Customer</th>
                <th className="px-3 py-2 w-16" />
              </tr>
            </thead>

            <tbody className="divide-y divide-sidebar-border/50">
              {loadingSales ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-3 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <ShoppingCart className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    <p className="text-sm">No sales for this period</p>
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-muted/10 transition-colors group">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(sale.sale_date + "T00:00:00").toLocaleDateString("en-PK", {
                        day: "2-digit", month: "short",
                      })}
                    </td>
                    <td className="px-3 py-2 font-medium max-w-[180px] truncate">
                      {sale.product?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums hidden sm:table-cell">
                      {sale.quantity} × {formatPKR(sale.unit_price)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-400">
                      {formatPKR(sale.total)}
                    </td>
                    <td className="px-3 py-2 text-center hidden md:table-cell">
                      <PaymentBadge mode={sale.payment_mode} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell truncate max-w-[120px]">
                      {sale.customer_name ?? <span className="opacity-30">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(sale)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(sale.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {!loadingSales && filteredSales.length > 0 && (
              <tfoot>
                <tr className="border-t border-sidebar-border bg-muted/10">
                  <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                    {filteredSales.length} transaction{filteredSales.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell" />
                  <td className="px-3 py-2 text-right font-bold text-amber-400 tabular-nums">
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
      <Dialog open={!!editSaleRow} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Sale</DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Product</Label>
                <Select
                  value={editForm.productId}
                  onValueChange={(v) => {
                    const p = productMap.get(v);
                    setEditForm((prev) => prev ? { ...prev, productId: v, unitPrice: p ? String(p.sale_price) : prev.unitPrice } : prev);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="ml-1.5 text-muted-foreground text-xs">— {formatPKR(p.sale_price)}/{p.unit}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input
                    type="number" min="0.001" step="any"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((prev) => prev ? { ...prev, quantity: e.target.value } : prev)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Price (PKR)</Label>
                  <Input
                    type="number" min="0" step="any"
                    value={editForm.unitPrice}
                    onChange={(e) => setEditForm((prev) => prev ? { ...prev, unitPrice: e.target.value } : prev)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Total</Label>
                  <div className="h-9 px-3 flex items-center rounded-md border border-sidebar-border bg-muted/30 text-sm font-bold text-amber-400 tabular-nums">
                    {formatPKR(editFormTotal)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Payment</Label>
                <PaymentToggle
                  value={editForm.paymentMode}
                  onChange={(v) => setEditForm((prev) => prev ? { ...prev, paymentMode: v } : prev)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Customer</Label>
                  <Input
                    placeholder="Optional"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm((prev) => prev ? { ...prev, customerName: e.target.value } : prev)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <DatePicker
                    value={editForm.saleDate}
                    onChange={(v) => setEditForm((prev) => prev ? { ...prev, saleDate: v } : prev)}
                    maxDate={new Date()}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>Cancel</Button>
            <Button
              onClick={handleEditSave}
              disabled={editSubmitting || !editForm?.productId}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
            >
              {editSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete Sale"
        description="This sale will be permanently deleted and stock will be restored."
        confirmLabel={deleteSubmitting ? "Deleting…" : "Delete"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
