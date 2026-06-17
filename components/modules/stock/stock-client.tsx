"use client";

import { useState, useMemo, useTransition, useRef } from "react";
import Link from "next/link";
import {
  Boxes, ArrowDown, ArrowUp, AlertTriangle, Package,
  Plus, History, Check, Loader2, Filter,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn, formatDate, formatDateInput } from "@/lib/utils";

import { addStockMovement, updateLowStockThreshold } from "@/app/actions/stock";
import type { StockLevel, StockMovement } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stockColor(level: StockLevel): string {
  if (level.current_stock <= level.low_stock_threshold)
    return "text-red-400";
  if (level.current_stock <= level.low_stock_threshold * 2)
    return "text-amber-400";
  return "text-emerald-400";
}

function stockBg(level: StockLevel): string {
  if (level.current_stock <= level.low_stock_threshold)
    return "bg-red-500/10 border-red-500/20";
  if (level.current_stock <= level.low_stock_threshold * 2)
    return "bg-amber-500/10 border-amber-500/20";
  return "bg-emerald-500/10 border-emerald-500/20";
}

function urgencyScore(level: StockLevel): number {
  if (level.low_stock_threshold === 0) return 0;
  return level.current_stock / level.low_stock_threshold;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MovementDialogState {
  open: boolean;
  type: "in" | "out";
  productId: string;
}

const emptyDialog: MovementDialogState = { open: false, type: "in", productId: "" };

const emptyMovementForm = {
  quantity: "",
  note: "",
  date: formatDateInput(new Date()),
};

// ─── Inline threshold editor ──────────────────────────────────────────────────

function ThresholdEditor({
  level,
  shopId,
  onUpdated,
}: {
  level: StockLevel;
  shopId: string;
  onUpdated: (productId: string, value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(level.low_stock_threshold));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setValue(String(level.low_stock_threshold));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit() {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      toast({ title: "Invalid threshold", description: "Must be a non-negative number.", variant: "destructive" });
      return;
    }
    if (num === level.low_stock_threshold) { setEditing(false); return; }
    setSaving(true);
    const res = await updateLowStockThreshold(level.product_id, shopId, num);
    setSaving(false);
    if (res?.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else {
      onUpdated(level.product_id, num);
      toast({ title: "Threshold updated" });
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={commit}
          className="w-16 h-7 rounded border border-input bg-background px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        {!saving && (
          <button onClick={commit} className="text-emerald-400 hover:text-emerald-300">
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 transition-colors"
      title="Click to edit"
    >
      {level.low_stock_threshold}
    </button>
  );
}

// ─── Movement Dialog ──────────────────────────────────────────────────────────

function MovementDialog({
  state,
  stockLevels,
  shopId,
  onClose,
  onSuccess,
}: {
  state: MovementDialogState;
  stockLevels: StockLevel[];
  shopId: string;
  onClose: () => void;
  onSuccess: (movement: StockMovement) => void;
}) {
  const [form, setForm] = useState(emptyMovementForm);
  const [productId, setProductId] = useState(state.productId);
  const [isPending, startTransition] = useTransition();

  const selectedProduct = stockLevels.find((s) => s.product_id === productId);

  function handleClose() {
    setForm(emptyMovementForm);
    onClose();
  }

  function handleSubmit() {
    const qty = parseInt(form.quantity, 10);
    if (!productId) {
      toast({ title: "Select a product", variant: "destructive" });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Must be a positive number.", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      const res = await addStockMovement({
        shopId,
        productId,
        type: state.type,
        quantity: qty,
        note: form.note.trim() || undefined,
      });

      if (res?.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        const newMovement: StockMovement = {
          id: `temp-${Date.now()}`,
          shop_id: shopId,
          product_id: productId,
          type: state.type,
          quantity: qty,
          note: form.note.trim() || null,
          sale_id: null,
          created_at: form.date ? `${form.date}T00:00:00.000Z` : new Date().toISOString(),
          product: selectedProduct
            ? { id: selectedProduct.product_id, name: selectedProduct.product_name, unit: selectedProduct.unit }
            : null,
        };
        onSuccess(newMovement);
        toast({
          title: state.type === "in" ? "Stock added" : "Stock recorded as out",
          description: `${qty} ${selectedProduct?.unit ?? "units"} ${state.type === "in" ? "added" : "removed"}.`,
        });
        handleClose();
        setForm(emptyMovementForm);
      }
    });
  }

  const isIn = state.type === "in";
  const title = isIn ? "Add Stock In" : "Record Stock Out";
  const icon = isIn
    ? <ArrowDown className="w-4 h-4 text-emerald-400" />
    : <ArrowUp className="w-4 h-4 text-red-400" />;

  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Product selector */}
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select
              value={productId || state.productId}
              onValueChange={setProductId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {stockLevels.map((s) => (
                  <SelectItem key={s.product_id} value={s.product_id}>
                    {s.product_name}
                    <span className="ml-1 text-muted-foreground text-xs">({s.unit})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Current stock:{" "}
                <span className={cn("font-semibold", stockColor(selectedProduct))}>
                  {selectedProduct.current_stock} {selectedProduct.unit}
                </span>
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <Input
              type="number"
              min={1}
              placeholder="e.g. 10"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>
              Note{" "}
              {!isIn && (
                <span className="text-muted-foreground text-xs font-normal">
                  (e.g. damage, return, adjustment)
                </span>
              )}
            </Label>
            <Textarea
              placeholder={isIn ? "Optional note..." : "Reason: damage / return / adjustment"}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !productId || !form.quantity}
            className={cn(isIn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              isIn ? "Add Stock" : "Record Out"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stock Levels Tab ─────────────────────────────────────────────────────────

function StockLevelsTab({
  stockLevels,
  shopId,
  onThresholdUpdated,
  onOpenDialog,
}: {
  stockLevels: StockLevel[];
  shopId: string;
  onThresholdUpdated: (productId: string, value: number) => void;
  onOpenDialog: (type: "in" | "out", productId: string) => void;
}) {
  if (stockLevels.length === 0) {
    return (
      <div className="rounded-xl border border-sidebar-border bg-card p-12 flex flex-col items-center justify-center gap-3 text-center">
        <Package className="w-10 h-10 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">No products yet.</p>
        <p className="text-sm text-muted-foreground/70">Add products first to track stock levels.</p>
        <Link href="/products">
          <Button variant="outline" size="sm" className="mt-1">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Go to Products
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-sidebar-border bg-white/[0.02]">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Product</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Stock</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                Low Stock Alert
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sidebar-border">
            {stockLevels.map((level) => {
              const isLow = level.current_stock <= level.low_stock_threshold;
              const isWarn = !isLow && level.current_stock <= level.low_stock_threshold * 2;
              return (
                <tr
                  key={level.product_id}
                  className={cn(
                    "transition-colors hover:bg-white/[0.025]",
                    isLow && "bg-red-500/5"
                  )}
                >
                  {/* Product info */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isLow && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      {isWarn && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm leading-tight">{level.product_name}</p>
                        <p className="text-xs text-muted-foreground">{level.unit}</p>
                      </div>
                    </div>
                  </td>

                  {/* Current stock — prominent & colored */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-lg border px-2.5 py-0.5 text-sm font-bold tabular-nums",
                        stockBg(level),
                        stockColor(level)
                      )}
                    >
                      {level.current_stock}
                    </span>
                  </td>

                  {/* Threshold — click to edit */}
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <ThresholdEditor
                      level={level}
                      shopId={shopId}
                      onUpdated={onThresholdUpdated}
                    />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                        onClick={() => onOpenDialog("in", level.product_id)}
                      >
                        <ArrowDown className="w-3 h-3" />
                        <span className="hidden xs:inline">In</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => onOpenDialog("out", level.product_id)}
                      >
                        <ArrowUp className="w-3 h-3" />
                        <span className="hidden xs:inline">Out</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Movement History Tab ────────────────────────────────────────────────────

function MovementHistoryTab({
  movements,
  stockLevels,
}: {
  movements: StockMovement[];
  stockLevels: StockLevel[];
}) {
  const [filterProductId, setFilterProductId] = useState("all");

  const filtered = useMemo(() => {
    if (filterProductId === "all") return movements;
    return movements.filter((m) => m.product_id === filterProductId);
  }, [movements, filterProductId]);

  if (movements.length === 0) {
    return (
      <div className="rounded-xl border border-sidebar-border bg-card p-12 flex flex-col items-center justify-center gap-3 text-center">
        <History className="w-10 h-10 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">No movements yet.</p>
        <p className="text-sm text-muted-foreground/70">Add or record stock to see history here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={filterProductId} onValueChange={setFilterProductId}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {stockLevels.map((s) => (
              <SelectItem key={s.product_id} value={s.product_id}>
                {s.product_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground ml-auto">
          Showing last {movements.length} movements
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sidebar-border bg-white/[0.02]">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Date</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Product</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Type</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Qty</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Note</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sidebar-border">
              {filtered.map((m) => {
                const isIn = m.type === "in";
                const source = m.sale_id ? `Sale #${m.sale_id.slice(-6).toUpperCase()}` : "Manual";
                return (
                  <tr key={m.id} className="hover:bg-white/[0.025] transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium leading-tight">{m.product?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {formatDate(m.created_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        className={cn(
                          "text-xs border font-semibold",
                          isIn
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                            : "bg-red-500/15 text-red-400 border-red-500/25"
                        )}
                      >
                        {isIn ? "In" : "Out"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("text-sm font-bold tabular-nums", isIn ? "text-emerald-400" : "text-red-400")}>
                        {isIn ? "+" : "-"}{m.quantity}
                      </span>
                      <span className="text-xs text-muted-foreground ml-0.5">{m.product?.unit}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {m.note ? m.note : <span className="opacity-40">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{source}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No movements for this product.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root Client Component ────────────────────────────────────────────────────

interface Props {
  shopId: string;
  initialStockLevels: StockLevel[];
  initialMovements: StockMovement[];
}

export function StockClient({ shopId, initialStockLevels, initialMovements }: Props) {
  const [stockLevels, setStockLevels] = useState<StockLevel[]>(
    // Sort: low stock first (by urgency score ascending)
    [...initialStockLevels].sort((a, b) => urgencyScore(a) - urgencyScore(b))
  );
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements);
  const [dialog, setDialog] = useState<MovementDialogState>(emptyDialog);

  // Summary counts
  const totalProducts = stockLevels.length;
  const lowStockCount = stockLevels.filter(
    (s) => s.current_stock <= s.low_stock_threshold
  ).length;

  function openDialog(type: "in" | "out", productId: string) {
    setDialog({ open: true, type, productId });
  }

  function closeDialog() {
    setDialog((prev) => ({ ...prev, open: false }));
  }

  function handleThresholdUpdated(productId: string, value: number) {
    setStockLevels((prev) => {
      const updated = prev.map((s) =>
        s.product_id === productId ? { ...s, low_stock_threshold: value } : s
      );
      return [...updated].sort((a, b) => urgencyScore(a) - urgencyScore(b));
    });
  }

  function handleMovementSuccess(movement: StockMovement) {
    // Optimistically update stock levels
    setStockLevels((prev) => {
      const updated = prev.map((s) => {
        if (s.product_id !== movement.product_id) return s;
        const delta = movement.type === "in" ? movement.quantity : -movement.quantity;
        return { ...s, current_stock: Math.max(0, s.current_stock + delta) };
      });
      return [...updated].sort((a, b) => urgencyScore(a) - urgencyScore(b));
    });

    // Prepend to movements log
    setMovements((prev) => [movement, ...prev].slice(0, 50));
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="w-6 h-6 text-primary" />
            Stock
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage inventory levels and movements</p>
        </div>
        <Button
          onClick={() => openDialog("in", "")}
          className="gap-2 w-full sm:w-auto"
        >
          <ArrowDown className="w-4 h-4" />
          Add Stock In
        </Button>
      </div>

      {/* ── Summary row ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl border border-sidebar-border bg-card px-4 py-3 flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Package className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">In stock</p>
            <p className="text-xl font-bold tabular-nums">{totalProducts}</p>
          </div>
        </div>

        {lowStockCount > 0 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-amber-400/80">Low on stock</p>
              <p className="text-xl font-bold text-amber-400 tabular-nums">{lowStockCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="levels" className="space-y-4">
        <TabsList>
          <TabsTrigger value="levels" className="gap-1.5">
            <Package className="w-3.5 h-3.5" />
            Stock Levels
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="w-3.5 h-3.5" />
            Movement History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="levels">
          <StockLevelsTab
            stockLevels={stockLevels}
            shopId={shopId}
            onThresholdUpdated={handleThresholdUpdated}
            onOpenDialog={openDialog}
          />
        </TabsContent>

        <TabsContent value="history">
          <MovementHistoryTab
            movements={movements}
            stockLevels={stockLevels}
          />
        </TabsContent>
      </Tabs>

      {/* ── Movement Dialog ── */}
      {dialog.open && (
        <MovementDialog
          key={`${dialog.type}-${dialog.productId}`}
          state={dialog}
          stockLevels={stockLevels}
          shopId={shopId}
          onClose={closeDialog}
          onSuccess={handleMovementSuccess}
        />
      )}
    </div>
  );
}
