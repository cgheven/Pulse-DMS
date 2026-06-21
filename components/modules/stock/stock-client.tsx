"use client";

import { useState, useMemo, useTransition, useRef, useEffect, Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useBranchContext } from "@/contexts/branch-context";
import {
  ArrowDown, ArrowUp, AlertTriangle, Package,
  Plus, History, Check, Loader2, Search,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn, formatDate, formatDateInput } from "@/lib/utils";

import { addStockMovement, updateLowStockThreshold } from "@/app/actions/stock";
import type { StockLevel, StockMovement } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stockStatus(level: StockLevel): "low" | "warn" | "ok" {
  if (level.current_stock <= level.low_stock_threshold) return "low";
  if (level.current_stock <= level.low_stock_threshold * 2) return "warn";
  return "ok";
}

function urgencyScore(level: StockLevel): number {
  if (level.low_stock_threshold === 0) return 999;
  return level.current_stock / level.low_stock_threshold;
}

// ─── Batch FIFO calculation ───────────────────────────────────────────────────

type BatchRow = { date: string; unitPrice: number | null; remaining: number };

function computeBatches(
  movements: { type: string; quantity: number; unit_price: number | null; created_at: string }[]
): BatchRow[] {
  const sorted = [...movements].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const batches: BatchRow[] = [];
  for (const m of sorted) {
    if (m.type === "in") {
      batches.push({ date: m.created_at, unitPrice: m.unit_price, remaining: m.quantity });
    } else {
      let toDeduct = m.quantity;
      // Price-matched deduction: if the OUT movement carries a unit_price (from a
      // user-selected batch), deduct from that batch first before falling back to FIFO.
      if (m.unit_price != null) {
        const matched = batches.find((b) => b.remaining > 0 && b.unitPrice === m.unit_price);
        if (matched) {
          const d = Math.min(matched.remaining, toDeduct);
          matched.remaining -= d;
          toDeduct -= d;
        }
      }
      // FIFO for any remaining qty (covers fallback and manual stock-out movements)
      for (const b of batches) {
        if (toDeduct <= 0) break;
        const d = Math.min(b.remaining, toDeduct);
        b.remaining -= d;
        toDeduct -= d;
      }
    }
  }
  return batches.filter((b) => b.remaining > 0);
}

// ─── Inline threshold editor ──────────────────────────────────────────────────

function ThresholdEditor({
  level, branchId, onUpdated,
}: {
  level: StockLevel;
  branchId: string;
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
      toast({ title: "Must be a non-negative number", variant: "destructive" });
      return;
    }
    if (num === level.low_stock_threshold) { setEditing(false); return; }
    setSaving(true);
    const res = await updateLowStockThreshold(level.product_id, branchId, num);
    setSaving(false);
    if (res?.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    } else {
      onUpdated(level.product_id, num);
      toast({ title: "Alert threshold updated" });
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number" min={0} value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          onBlur={commit}
          className="w-14 h-6 rounded border border-input bg-background px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          : <button onClick={commit} className="text-emerald-400 hover:text-emerald-300"><Check className="w-3 h-3" /></button>
        }
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 transition-colors tabular-nums"
      title="Click to edit alert threshold"
    >
      {level.low_stock_threshold}
    </button>
  );
}

// ─── Stock bar ─────────────────────────────────────────────────────────────────

function StockBar({ level }: { level: StockLevel }) {
  const status = stockStatus(level);
  const max = Math.max(level.current_stock, level.low_stock_threshold * 3, 1);
  const fill = Math.min((level.current_stock / max) * 100, 100);
  const thresholdPct = Math.min((level.low_stock_threshold / max) * 100, 100);

  const barColor =
    status === "low" ? "bg-red-500" :
    status === "warn" ? "bg-amber-500" :
    "bg-emerald-500";

  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted overflow-visible">
      <div
        className={cn("h-full rounded-full transition-all duration-500", barColor)}
        style={{ width: `${fill}%` }}
      />
      {level.low_stock_threshold > 0 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-red-500/60"
          style={{ left: `${thresholdPct}%` }}
          title={`Alert at ${level.low_stock_threshold}`}
        />
      )}
    </div>
  );
}

// ─── Movement Dialog ──────────────────────────────────────────────────────────

interface MovementDialogState {
  open: boolean;
  type: "in" | "out";
  productId: string;
}

const emptyDialog: MovementDialogState = { open: false, type: "in", productId: "" };

function MovementDialog({
  state, stockLevels, branchId, onClose, onSuccess,
}: {
  state: MovementDialogState;
  stockLevels: StockLevel[];
  branchId: string;
  onClose: () => void;
  onSuccess: (movement: StockMovement) => void;
}) {
  const [productId, setProductId] = useState(state.productId);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedProduct = stockLevels.find((s) => s.product_id === productId);
  const isIn = state.type === "in";

  // Pre-fill price from product cost when product changes
  useEffect(() => {
    if (selectedProduct && !unitPrice) {
      setUnitPrice(String(selectedProduct.cost_price ?? ""));
    }
  }, [selectedProduct?.product_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setQuantity(""); setUnitPrice(""); setNote("");
    onClose();
  }

  function handleSubmit() {
    const qty = parseInt(quantity, 10);
    if (!productId) { toast({ title: "Select a product", variant: "destructive" }); return; }
    if (isNaN(qty) || qty <= 0) { toast({ title: "Enter a valid quantity", variant: "destructive" }); return; }
    const price = unitPrice ? parseFloat(unitPrice) : undefined;
    if (price !== undefined && (isNaN(price) || price <= 0)) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      const res = await addStockMovement({
        branchId, productId, type: state.type, quantity: qty,
        unitPrice: price,
        note: note.trim() || undefined,
      });
      if (res?.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        const newMovement: StockMovement = {
          id: `temp-${Date.now()}`,
          shop_id: null,
          product_id: productId,
          type: state.type,
          quantity: qty,
          unit_price: price ?? null,
          note: note.trim() || null,
          sale_id: null,
          created_at: new Date().toISOString(),
          product: selectedProduct
            ? { id: selectedProduct.product_id, name: selectedProduct.product_name, unit: selectedProduct.unit }
            : null,
        };
        onSuccess(newMovement);
        toast({
          title: isIn ? "Stock added" : "Stock removed",
          description: `${qty} ${selectedProduct?.unit ?? "units"} ${isIn ? "added to" : "removed from"} stock.`,
        });
        handleClose();
      }
    });
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isIn
              ? <><ArrowDown className="w-4 h-4 text-emerald-400" /> Stock In</>
              : <><ArrowUp className="w-4 h-4 text-red-400" /> Stock Out</>
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Product */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Product</label>
            <Select value={productId || state.productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Select product…" />
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
                Current:{" "}
                <span className={cn(
                  "font-semibold",
                  stockStatus(selectedProduct) === "low" ? "text-red-400" :
                  stockStatus(selectedProduct) === "warn" ? "text-amber-400" : "text-emerald-400"
                )}>
                  {selectedProduct.current_stock} {selectedProduct.unit}
                </span>
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quantity *</label>
            <input
              type="number" min={1} placeholder="e.g. 10"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full h-9 px-3 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Unit Price */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {isIn ? "Purchase Price / Unit *" : "Unit Value"}
              <span className="ml-1 opacity-50">(PKR)</span>
            </label>
            <input
              type="number" min={0} step="0.01"
              placeholder={isIn ? "e.g. 5000" : "Optional"}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Note {!isIn && <span className="opacity-60">(e.g. damage, return)</span>}
            </label>
            <input
              type="text"
              placeholder={isIn ? "Optional…" : "Reason: damage / return / adjustment"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending} className="h-9">
            Cancel
          </Button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !productId || !quantity}
            className={cn(
              "h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold transition-colors",
              isIn
                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                : "bg-red-500 text-white hover:bg-red-400",
              "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
            )}
          >
            {isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : isIn ? <><ArrowDown className="w-4 h-4" /> Add Stock</> : <><ArrowUp className="w-4 h-4" /> Remove Stock</>
            }
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Root Client Component ────────────────────────────────────────────────────

export function StockClient() {
  const { branchId } = useBranchContext();
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [batchMap, setBatchMap] = useState<Record<string, BatchRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<MovementDialogState>(emptyDialog);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low">("all");

  async function fetchData() {
    if (!branchId) return;
    const supabase = createClient();
    const [levelsRes, movementsRes, allMovementsRes] = await Promise.all([
      supabase.from("dms_stock_levels").select("*").eq("branch_id", branchId).order("product_name"),
      supabase
        .from("dms_stock_movements")
        .select("*, product:dms_products(id,name,unit)")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("dms_stock_movements")
        .select("product_id, type, quantity, unit_price, created_at")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: true }),
    ]);
    if (levelsRes.data) {
      setStockLevels([...(levelsRes.data as StockLevel[])].sort((a, b) => urgencyScore(a) - urgencyScore(b)));
    }
    if (movementsRes.data) setMovements(movementsRes.data as StockMovement[]);
    if (allMovementsRes.data) {
      const byProduct: Record<string, typeof allMovementsRes.data> = {};
      for (const m of allMovementsRes.data) {
        if (!byProduct[m.product_id]) byProduct[m.product_id] = [];
        byProduct[m.product_id].push(m);
      }
      const map: Record<string, BatchRow[]> = {};
      for (const [pid, mvs] of Object.entries(byProduct)) {
        map[pid] = computeBatches(mvs);
      }
      setBatchMap(map);
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lowStockCount = useMemo(() => stockLevels.filter((s) => s.current_stock <= s.low_stock_threshold).length, [stockLevels]);

  const filteredMovements = useMemo(() =>
    historyFilter === "all" ? movements : movements.filter((m) => m.product_id === historyFilter),
    [movements, historyFilter]
  );

  const filteredStockLevels = useMemo(() => {
    let list = stockFilter === "low"
      ? stockLevels.filter((s) => s.current_stock <= s.low_stock_threshold)
      : stockLevels;
    if (stockSearch.trim()) {
      const q = stockSearch.toLowerCase();
      list = list.filter((s) => s.product_name.toLowerCase().includes(q));
    }
    return list;
  }, [stockLevels, stockSearch, stockFilter]);

  function openDialog(type: "in" | "out", productId: string) {
    setDialog({ open: true, type, productId });
  }

  function handleThresholdUpdated(productId: string, value: number) {
    setStockLevels((prev) =>
      [...prev.map((s) => s.product_id === productId ? { ...s, low_stock_threshold: value } : s)]
        .sort((a, b) => urgencyScore(a) - urgencyScore(b))
    );
  }

  function handleMovementSuccess(movement: StockMovement) {
    setStockLevels((prev) =>
      [...prev.map((s) => {
        if (s.product_id !== movement.product_id) return s;
        const delta = movement.type === "in" ? movement.quantity : -movement.quantity;
        return { ...s, current_stock: Math.max(0, s.current_stock + delta) };
      })].sort((a, b) => urgencyScore(a) - urgencyScore(b))
    );
    setMovements((prev) => [movement, ...prev].slice(0, 60));
    fetchData();
  }

  if (loading || !branchId) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-40 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 bg-muted animate-pulse rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ── Header + stats ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Inventory levels and movements</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold tabular-nums leading-none">{stockLevels.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {lowStockCount > 0
              ? <span className="text-red-400 font-medium">{lowStockCount} low stock</span>
              : "all stocked up"}
          </p>
        </div>
      </div>

      {/* ── Stock Levels ── */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">

        {/* Section toolbar */}
        <div className="px-4 py-2.5 border-b border-sidebar-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stock Levels</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5 bg-muted/20 rounded-lg p-0.5">
              {(["all", "low"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setStockFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    stockFilter === f ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {f === "all" ? "All" : "Low Stock"}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                placeholder="Search products…"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="pl-7 h-7 w-36 rounded-md bg-background border border-sidebar-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => openDialog("in", "")}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold
                bg-emerald-500 text-black hover:bg-emerald-400 transition-colors"
            >
              <ArrowDown className="w-3 h-3" />
              Stock In
            </button>
          </div>
        </div>

        {stockLevels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
            <Package className="w-8 h-8 opacity-20" />
            <p className="text-sm">No products yet.</p>
            <Link href="/products" className="text-xs text-primary hover:underline">Add products first →</Link>
          </div>
        ) : filteredStockLevels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
            <Search className="w-8 h-8 opacity-20" />
            <p className="text-sm">No products match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border bg-muted/10">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Product</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Unit Price</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5 w-20">Stock</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell w-20">Alert</th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/40">
                {filteredStockLevels.map((level) => {
                  const status     = stockStatus(level);
                  const batches    = batchMap[level.product_id] ?? [];
                  const countColor =
                    status === "low"  ? "text-red-400" :
                    status === "warn" ? "text-amber-400" : "text-emerald-400";

                  return (
                    <tr key={level.product_id} className={cn(
                      "hover:bg-muted/[0.06] transition-colors",
                      status === "low" && "bg-red-500/[0.03]"
                    )}>

                      {/* Product */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {status !== "ok" && (
                            <AlertTriangle className={cn(
                              "w-3.5 h-3.5 shrink-0",
                              status === "low" ? "text-red-400" : "text-amber-400"
                            )} />
                          )}
                          <div>
                            <div className="flex items-center gap-1.5 leading-none">
                              <p className="font-medium">{level.product_name}</p>
                              {level.size && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary">{level.size}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{level.unit}</p>
                            {/* Prices — mobile only */}
                            <div className="mt-1.5 flex flex-wrap gap-1 md:hidden">
                              {batches.length > 0 ? batches.map((batch, bi) => {
                                const isLatest = bi === batches.length - 1;
                                const hasPrice = batch.unitPrice != null;
                                return (
                                  <span key={bi} className={cn(
                                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
                                    isLatest && hasPrice
                                      ? "bg-amber-500/10 border border-amber-500/20 text-foreground"
                                      : "bg-muted/40 text-muted-foreground"
                                  )}>
                                    <span className="font-semibold tabular-nums">
                                      PKR {Number(hasPrice ? batch.unitPrice : level.cost_price).toLocaleString("en-PK")}
                                    </span>
                                    <span className="opacity-40">·</span>
                                    <span className={cn("font-bold tabular-nums", isLatest && hasPrice ? "text-amber-400" : "")}>
                                      {batch.remaining}
                                    </span>
                                    {isLatest && hasPrice && batches.length > 1 && (
                                      <span className="text-[10px] text-amber-500/70 font-semibold uppercase">new</span>
                                    )}
                                  </span>
                                );
                              }) : (
                                <>
                                  {level.cost_price > 0 && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-muted/40 text-muted-foreground">
                                      <span className="opacity-50">Cost</span>
                                      <span className="font-semibold tabular-nums text-foreground">
                                        PKR {Number(level.cost_price).toLocaleString("en-PK")}
                                      </span>
                                    </span>
                                  )}
                                  {level.sale_price > 0 && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-muted/40 text-muted-foreground">
                                      <span className="opacity-50">Sale</span>
                                      <span className="font-semibold tabular-nums text-foreground">
                                        PKR {Number(level.sale_price).toLocaleString("en-PK")}
                                      </span>
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Unit Price — all batches stacked */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {batches.length > 0 ? (
                          <div className="space-y-1.5">
                            {batches.map((batch, bi) => {
                              const isLatest    = bi === batches.length - 1;
                              const hasPrice    = batch.unitPrice != null;
                              return (
                                <div key={bi} className="flex items-center gap-2">
                                  <div className={cn(
                                    "flex items-center gap-2 px-2 py-1 rounded-md text-xs",
                                    isLatest && hasPrice
                                      ? "bg-amber-500/10 border border-amber-500/20"
                                      : "bg-muted/40"
                                  )}>
                                    <span className={cn(
                                      "font-semibold tabular-nums",
                                      isLatest && hasPrice ? "text-foreground" : "text-muted-foreground"
                                    )}>
                                      PKR {Number(hasPrice ? batch.unitPrice : level.cost_price).toLocaleString("en-PK")}
                                      {!hasPrice && (
                                        <span className="font-normal text-muted-foreground/50 ml-1">*</span>
                                      )}
                                    </span>
                                    <span className="text-muted-foreground/40">·</span>
                                    <span className={cn(
                                      "font-bold tabular-nums",
                                      isLatest && hasPrice ? "text-amber-400" : "text-muted-foreground"
                                    )}>
                                      {batch.remaining} {level.unit}
                                    </span>
                                  </div>
                                  {isLatest && hasPrice && batches.length > 1 && (
                                    <span className="text-[10px] text-amber-500/70 font-semibold uppercase tracking-wide">new</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* Stock count */}
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-lg font-bold tabular-nums leading-none", countColor)}>
                          {level.current_stock}
                        </span>
                      </td>

                      {/* Alert threshold */}
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <ThresholdEditor level={level} branchId={branchId} onUpdated={handleThresholdUpdated} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDialog("in", level.product_id)}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-semibold
                              bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                              hover:bg-emerald-500/20 transition-colors"
                          >
                            <ArrowDown className="w-3 h-3" />
                            <span className="hidden sm:inline">In</span>
                          </button>
                          <button
                            onClick={() => openDialog("out", level.product_id)}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-semibold
                              bg-red-500/10 text-red-400 border border-red-500/20
                              hover:bg-red-500/20 transition-colors"
                          >
                            <ArrowUp className="w-3 h-3" />
                            <span className="hidden sm:inline">Out</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Movement History ── */}
      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">

        {/* Section toolbar */}
        <div className="px-4 py-2.5 border-b border-sidebar-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Movement History</span>
          </div>
          <Select value={historyFilter} onValueChange={setHistoryFilter}>
            <SelectTrigger className="w-40 h-7 text-xs">
              <SelectValue placeholder="All products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {stockLevels.map((s) => (
                <SelectItem key={s.product_id} value={s.product_id}>{s.product_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <History className="w-7 h-7 opacity-20" />
            <p className="text-sm">No movements yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border bg-muted/10">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2 hidden sm:table-cell">Date</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Product</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2 w-16">Type</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2 w-16">Qty</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2 hidden md:table-cell w-28">Unit Price</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2 hidden md:table-cell">Note / Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/50">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No movements for this product
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m) => {
                    const isIn = m.type === "in";
                    const source = m.sale_id ? "Sale" : "Manual";
                    return (
                      <tr key={m.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                          {formatDate(m.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium leading-none">{m.product?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{formatDate(m.created_at)}</p>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={cn(
                            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold border",
                            isIn
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          )}>
                            {isIn ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                            {isIn ? "In" : "Out"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={cn("font-bold tabular-nums", isIn ? "text-emerald-400" : "text-red-400")}>
                            {isIn ? "+" : "−"}{m.quantity}
                          </span>
                          <span className="text-xs text-muted-foreground ml-0.5">{m.product?.unit}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right hidden md:table-cell">
                          {m.unit_price != null ? (
                            <span className={cn("text-xs tabular-nums font-medium", isIn ? "text-emerald-400" : "text-red-400/80")}>
                              PKR {Number(m.unit_price).toLocaleString("en-PK")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground opacity-30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {m.note && m.note !== "Auto: sale"
                              ? m.note
                              : m.sale_id
                                ? m.unit_price != null
                                  ? <span>Sale <span className="text-muted-foreground/60">@ PKR {Number(m.unit_price).toLocaleString("en-PK")}/unit</span></span>
                                  : <span className="opacity-40">Sale</span>
                                : <span className="opacity-40">Manual</span>
                            }
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Movement Dialog ── */}
      {dialog.open && (
        <MovementDialog
          key={`${dialog.type}-${dialog.productId}`}
          state={dialog}
          stockLevels={stockLevels}
          branchId={branchId}
          onClose={() => setDialog((p) => ({ ...p, open: false }))}
          onSuccess={handleMovementSuccess}
        />
      )}
    </div>
  );
}
