"use client";
import { useMemo, useState, useTransition } from "react";
import {
  Package, Plus, ShoppingCart, ArrowDownToLine, AlertTriangle, Clock,
  TrendingUp, Search, X, CheckCircle2, Trash2, Settings2, Sparkles, Zap, History, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  addItem, archiveItem, addStockBatch, recordSale, adjustStock,
} from "@/app/actions/inventory";
import type {
  InventoryItem, InventoryBatch, InventorySale, InventoryProfitSummary,
  InventoryTopSeller, InventoryDeadStockItem, InventoryExpiringBatch,
  InventoryCategory, PaymentMethod,
} from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: "supplements", label: "Supplements" },
  { value: "beverages",   label: "Beverages"   },
  { value: "snacks",      label: "Snacks"      },
  { value: "gear",        label: "Gear"        },
  { value: "apparel",     label: "Apparel"     },
  { value: "other",       label: "Other"       },
];

const CAT_COLORS: Record<InventoryCategory, string> = {
  supplements: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  beverages:   "bg-sky-500/10 text-sky-300 border-sky-500/25",
  snacks:      "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  gear:        "bg-violet-500/10 text-violet-300 border-violet-500/25",
  apparel:     "bg-rose-500/10 text-rose-300 border-rose-500/25",
  other:       "bg-white/5 text-muted-foreground border-white/10",
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash",          label: "Cash"          },
  { value: "jazzcash",      label: "JazzCash"      },
  { value: "easypaisa",     label: "EasyPaisa"     },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card",          label: "Card"          },
  { value: "other",         label: "Other"         },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  gymId: string | null;
  isOwner: boolean;
  items: InventoryItem[];
  batches: InventoryBatch[];
  sales: InventorySale[];
  members: { id: string; full_name: string; status: string }[];
  lowStockItems: InventoryItem[];
  expiringBatches: InventoryExpiringBatch[];
  deadStock: InventoryDeadStockItem[];
  topSellers: InventoryTopSeller[];
  profitSummary: InventoryProfitSummary;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function InventoryClient(props: Props) {
  const {
    gymId, isOwner, items, batches, sales, members,
    lowStockItems, expiringBatches, deadStock, topSellers, profitSummary,
  } = props;

  const [tab, setTab] = useState<"items" | "sales" | "reports">("items");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | "all">("all");

  // Modal state
  const [saleOpen, setSaleOpen] = useState(false);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [adjustBatch, setAdjustBatch] = useState<InventoryBatch | null>(null);

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryFilter !== "all" && it.category !== categoryFilter) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, categoryFilter]);

  // Batches grouped by item (for detail drawer)
  const batchesByItem = useMemo(() => {
    const map = new Map<string, InventoryBatch[]>();
    for (const b of batches) {
      (map.get(b.item_id) ?? map.set(b.item_id, []).get(b.item_id)!).push(b);
    }
    return map;
  }, [batches]);

  // Empty state — no gym
  if (!gymId) {
    return (
      <div className="px-4 py-16 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Package className="w-7 h-7 text-amber-400" />
        </div>
        <p className="text-lg font-bold">No gym data</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Complete setup in Settings to use Inventory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Package className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg sm:text-xl font-bold">Inventory</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {isOwner ? "Track every item your gym sells — supplements, gear, drinks." : "Record sales for the gym shop."}
          </p>
        </div>
      </div>

      {/* ── Quick CTAs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Button
          onClick={() => setSaleOpen(true)}
          className="h-12 bg-emerald-500 text-white hover:bg-emerald-600 font-semibold gap-2"
        >
          <ShoppingCart className="w-4 h-4" />
          Record Sale
        </Button>
        {isOwner && (
          <>
            <Button
              onClick={() => setStockInOpen(true)}
              className="h-12 bg-sky-500 text-white hover:bg-sky-600 font-semibold gap-2"
            >
              <ArrowDownToLine className="w-4 h-4" />
              Stock In
            </Button>
            <Button
              onClick={() => setAddItemOpen(true)}
              variant="outline"
              className="h-12 font-semibold gap-2 col-span-2 sm:col-span-1"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </>
        )}
      </div>

      {/* ── Alert banner ── */}
      {(lowStockItems.length > 0 || expiringBatches.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {lowStockItems.length > 0 && (
            <button
              type="button"
              onClick={() => { setTab("reports"); }}
              className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 flex items-center gap-3 text-left hover:bg-rose-500/10 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-rose-300">
                  {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} need restocking
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {lowStockItems.slice(0, 3).map((i) => i.name).join(", ")}
                  {lowStockItems.length > 3 ? "…" : ""}
                </p>
              </div>
            </button>
          )}
          {expiringBatches.length > 0 && (
            <button
              type="button"
              onClick={() => { setTab("reports"); }}
              className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 flex items-center gap-3 text-left hover:bg-amber-500/10 transition-colors"
            >
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-300">
                  {expiringBatches.length} batch{expiringBatches.length !== 1 ? "es" : ""} expiring soon
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Earliest: {expiringBatches[0].item_name} in {expiringBatches[0].days_until_expiry}d
                </p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-sidebar-border overflow-x-auto">
        {([
          { key: "items",   label: "Items",   icon: Package    },
          { key: "sales",   label: "Sales",   icon: History    },
          { key: "reports", label: "Reports", icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold transition-colors flex items-center gap-1.5 border-b-2 -mb-px shrink-0",
              tab === key
                ? "text-amber-400 border-amber-400"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Items tab ── */}
      {tab === "items" && (
        <>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                className="pl-9 h-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as InventoryCategory | "all")}>
              <SelectTrigger className="w-40 h-10">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState
              icon={Package}
              title={items.length === 0 ? "No items yet" : "No matching items"}
              description={items.length === 0
                ? (isOwner ? "Add your first item to start tracking inventory." : "Owner hasn't added items yet.")
                : "Try clearing the search or category filter."}
              action={isOwner && items.length === 0 ? { label: "Add first item", onClick: () => setAddItemOpen(true) } : undefined}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((it) => (
                <ItemCard key={it.id} item={it} onClick={() => setDetailItem(it)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Sales tab ── */}
      {tab === "sales" && (
        <SalesList sales={sales} />
      )}

      {/* ── Reports tab ── */}
      {tab === "reports" && (
        <ReportsView
          profitSummary={profitSummary}
          topSellers={topSellers}
          deadStock={deadStock}
          lowStockItems={lowStockItems}
          expiringBatches={expiringBatches}
        />
      )}

      {/* ── Modals ── */}
      <RecordSaleDialog
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        items={items}
        members={members}
      />
      {isOwner && (
        <>
          <StockInDialog
            open={stockInOpen}
            onClose={() => setStockInOpen(false)}
            items={items}
          />
          <AddItemDialog
            open={addItemOpen}
            onClose={() => setAddItemOpen(false)}
          />
          <ItemDetailDialog
            item={detailItem}
            batches={detailItem ? (batchesByItem.get(detailItem.id) ?? []) : []}
            onClose={() => setDetailItem(null)}
            onAdjust={(b) => setAdjustBatch(b)}
            isOwner={isOwner}
          />
          <AdjustStockDialog
            batch={adjustBatch}
            onClose={() => setAdjustBatch(null)}
          />
        </>
      )}
      {!isOwner && (
        <ItemDetailDialog
          item={detailItem}
          batches={detailItem ? (batchesByItem.get(detailItem.id) ?? []) : []}
          onClose={() => setDetailItem(null)}
          onAdjust={() => {}}
          isOwner={false}
        />
      )}
    </div>
  );
}

// ── Item card ────────────────────────────────────────────────────────────────

function ItemCard({ item, onClick }: { item: InventoryItem; onClick: () => void }) {
  const stock = item.total_stock ?? 0;
  const isLow = stock <= item.low_stock_threshold;
  const isOut = stock === 0;
  const expiringSoon = item.earliest_expiry &&
    Math.round((new Date(item.earliest_expiry).getTime() - Date.now()) / 86400000) <= 30;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left space-y-3 transition-all hover:border-primary/40",
        isOut ? "border-rose-500/30 bg-rose-500/[0.04]" :
        isLow ? "border-amber-500/30 bg-amber-500/[0.04]" :
                "border-sidebar-border bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
          <span className={cn("inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border mt-1.5", CAT_COLORS[item.category])}>
            {CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category}
          </span>
        </div>
      </div>

      <div className="flex items-baseline gap-1">
        <p className={cn("text-2xl font-bold tabular-nums", isOut ? "text-rose-400" : isLow ? "text-amber-400" : "text-foreground")}>
          {stock}
        </p>
        <p className="text-xs text-muted-foreground">in stock</p>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{formatCurrency(item.sale_price)}</span>
        <div className="flex items-center gap-1">
          {isOut && <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/15 rounded px-1.5 py-0.5">OUT</span>}
          {!isOut && isLow && <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/15 rounded px-1.5 py-0.5">LOW</span>}
          {expiringSoon && !isOut && <Clock className="w-3 h-3 text-amber-400" />}
        </div>
      </div>
    </button>
  );
}

// ── Sales list ───────────────────────────────────────────────────────────────

function SalesList({ sales }: { sales: InventorySale[] }) {
  if (sales.length === 0) {
    return (
      <EmptyState icon={History} title="No sales yet" description="Sales recorded this year will appear here." />
    );
  }
  return (
    <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
      <div className="divide-y divide-sidebar-border/50">
        {sales.map((s) => (
          <div key={s.id} className="px-4 sm:px-5 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">{s.item?.name ?? "Unknown item"}</p>
                <span className="text-xs text-muted-foreground">×{s.quantity}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {s.member?.full_name ?? "Walk-in"}
                {s.staff?.full_name ? ` · ${s.staff.full_name}` : ""}
                {" · "}
                {new Date(s.sold_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold tabular-nums">{formatCurrency(Number(s.total_amount))}</p>
              <p className="text-[10px] text-emerald-400 tabular-nums">+{formatCurrency(Number(s.profit))}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reports view ─────────────────────────────────────────────────────────────

function ReportsView({
  profitSummary, topSellers, deadStock, lowStockItems, expiringBatches,
}: {
  profitSummary: InventoryProfitSummary;
  topSellers: InventoryTopSeller[];
  deadStock: InventoryDeadStockItem[];
  lowStockItems: InventoryItem[];
  expiringBatches: InventoryExpiringBatch[];
}) {
  return (
    <div className="space-y-6">

      {/* Profit summary */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Retail Profit
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ProfitCard label="This Month" data={profitSummary.thisMonth} highlight />
          <ProfitCard label="Last Month" data={profitSummary.lastMonth} />
          <ProfitCard label="Year to Date" data={profitSummary.ytd} />
        </div>
      </div>

      {/* Reorder alerts */}
      {lowStockItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Reorder Alerts
            <span className="text-xs text-muted-foreground">({lowStockItems.length})</span>
          </h2>
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="divide-y divide-sidebar-border/50">
              {lowStockItems.map((it) => (
                <div key={it.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground">Threshold: {it.low_stock_threshold}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-lg font-bold tabular-nums", (it.total_stock ?? 0) === 0 ? "text-rose-400" : "text-amber-400")}>
                      {it.total_stock ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">in stock</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Expiry watch */}
      {expiringBatches.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Expiry Watch
            <span className="text-xs text-muted-foreground">({expiringBatches.length})</span>
          </h2>
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="divide-y divide-sidebar-border/50">
              {expiringBatches.map((b) => {
                const isPast = b.days_until_expiry <= 0;
                const isUrgent = b.days_until_expiry <= 7;
                return (
                  <div key={b.batch_id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{b.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.quantity_remaining} units · expires {new Date(b.expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0",
                      isPast ? "bg-rose-500/15 text-rose-400" :
                      isUrgent ? "bg-amber-500/15 text-amber-400" :
                                 "bg-white/5 text-muted-foreground"
                    )}>
                      {isPast ? "EXPIRED" : `${b.days_until_expiry}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top sellers */}
      {topSellers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Top Sellers (last 30 days)
          </h2>
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="divide-y divide-sidebar-border/50">
              {topSellers.map((t, i) => (
                <div key={t.item_id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.units_sold} units · {formatCurrency(t.total_revenue)} revenue</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-emerald-400 tabular-nums">+{formatCurrency(t.total_profit)}</p>
                    <p className="text-[10px] text-muted-foreground">profit</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dead stock */}
      {deadStock.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Dead Stock
            <span className="text-xs text-muted-foreground">(no sale in 60+ days)</span>
          </h2>
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="divide-y divide-sidebar-border/50">
              {deadStock.map((d) => (
                <div key={d.item_id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.total_stock} units · worth {formatCurrency(d.stock_value)}
                      {d.last_sold_at ? ` · last sold ${d.days_since_sale}d ago` : " · never sold"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {topSellers.length === 0 && deadStock.length === 0 && lowStockItems.length === 0 && expiringBatches.length === 0 && profitSummary.ytd.sales_count === 0 && (
        <EmptyState icon={TrendingUp} title="No data yet" description="Reports populate as you record sales." />
      )}
    </div>
  );
}

function ProfitCard({ label, data, highlight }: { label: string; data: { revenue: number; cost: number; profit: number; sales_count: number }; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", highlight ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-sidebar-border bg-card")}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", data.profit >= 0 ? "text-emerald-400" : "text-rose-400")}>
        {data.profit >= 0 ? "+" : ""}{formatCurrency(data.profit)}
      </p>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 tabular-nums">
        <span>Revenue: {formatCurrency(data.revenue)}</span>
        <span>{data.sales_count} sales</span>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description, action }: {
  icon: typeof Package;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="px-4 py-16 flex flex-col items-center gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <Icon className="w-7 h-7 text-amber-400" />
      </div>
      <p className="text-lg font-bold">{title}</p>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      {action && (
        <Button onClick={action.onClick} className="bg-primary text-white hover:bg-primary/90 mt-2">
          <Plus className="w-4 h-4 mr-1.5" /> {action.label}
        </Button>
      )}
    </div>
  );
}

// ── Record Sale dialog ──────────────────────────────────────────────────────

function RecordSaleDialog({
  open, onClose, items, members,
}: {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
  members: { id: string; full_name: string; status: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [memberId, setMemberId] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState("");
  const [notes, setNotes] = useState("");

  const selectedItem = items.find((i) => i.id === itemId) ?? null;
  const stock = selectedItem?.total_stock ?? 0;

  function reset() {
    setItemId(""); setQuantity(1); setSalePrice(0);
    setPaymentMethod("cash"); setMemberId(""); setMemberSearch(""); setNotes("");
  }

  function handleClose() { reset(); onClose(); }

  function pickItem(id: string) {
    setItemId(id);
    const item = items.find((i) => i.id === id);
    if (item) setSalePrice(Number(item.sale_price));
  }

  const memberMatches = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members.slice(0, 8);
    return members.filter((m) => m.full_name.toLowerCase().includes(q)).slice(0, 8);
  }, [members, memberSearch]);

  function handleSubmit() {
    if (!itemId) return toast({ title: "Pick an item", variant: "destructive" });
    if (quantity <= 0) return toast({ title: "Quantity must be at least 1", variant: "destructive" });
    if (salePrice < 0) return toast({ title: "Price cannot be negative", variant: "destructive" });
    if (selectedItem && quantity > stock) {
      return toast({ title: "Not enough stock", description: `Only ${stock} units available`, variant: "destructive" });
    }

    startTransition(async () => {
      const res = await recordSale({
        item_id: itemId,
        quantity,
        sale_price_per_unit: salePrice,
        payment_method: paymentMethod,
        member_id: memberId || null,
        notes,
      });
      if ("error" in res) {
        toast({ title: "Sale failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Sale recorded", description: `${quantity}× ${selectedItem?.name ?? "item"} sold` });
      handleClose();
    });
  }

  const total = quantity * salePrice;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Sale</DialogTitle>
          <DialogDescription>Sell an item from your gym shop.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item picker */}
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={pickItem}>
              <SelectTrigger>
                <SelectValue placeholder="Select item…" />
              </SelectTrigger>
              <SelectContent>
                {items.filter((it) => (it.total_stock ?? 0) > 0).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No items in stock</div>
                ) : (
                  items
                    .filter((it) => (it.total_stock ?? 0) > 0)
                    .map((it) => (
                      <SelectItem key={it.id} value={it.id}>
                        {it.name} ({it.total_stock} in stock)
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Qty + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                max={stock || undefined}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
              {selectedItem && <p className="text-[10px] text-muted-foreground">{stock} available</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Price/unit (Rs.)</Label>
              <Input
                type="number"
                min={0}
                step={50}
                value={salePrice}
                onChange={(e) => setSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </div>
          </div>

          {/* Member (optional) */}
          <div className="space-y-1.5">
            <Label>Member (optional)</Label>
            {memberId ? (
              <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-card px-3 py-2">
                <span className="text-sm">{members.find((m) => m.id === memberId)?.full_name ?? "Unknown"}</span>
                <button type="button" onClick={() => { setMemberId(""); setMemberSearch(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search member… (or leave blank for walk-in)"
                />
                {memberSearch && memberMatches.length > 0 && (
                  <div className="rounded-md border border-sidebar-border bg-card max-h-40 overflow-y-auto">
                    {memberMatches.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => { setMemberId(m.id); setMemberSearch(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                      >
                        {m.full_name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Total */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
            <span className="text-2xl font-bold text-emerald-400 tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={pending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending || !itemId} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            {pending ? "Recording…" : "Record Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stock In dialog ─────────────────────────────────────────────────────────

function StockInDialog({
  open, onClose, items,
}: {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [costPerUnit, setCostPerUnit] = useState<number>(0);
  const [expiryDate, setExpiryDate] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");

  const selectedItem = items.find((i) => i.id === itemId) ?? null;
  const needsExpiry = selectedItem?.expiry_tracked ?? false;

  function reset() {
    setItemId(""); setQuantity(1); setCostPerUnit(0); setExpiryDate("");
    setPurchaseDate(new Date().toISOString().slice(0, 10)); setSupplier(""); setNotes("");
  }
  function handleClose() { reset(); onClose(); }

  function handleSubmit() {
    if (!itemId) return toast({ title: "Pick an item", variant: "destructive" });
    if (quantity <= 0) return toast({ title: "Quantity must be at least 1", variant: "destructive" });
    if (costPerUnit < 0) return toast({ title: "Cost cannot be negative", variant: "destructive" });
    if (needsExpiry && !expiryDate) return toast({ title: "Expiry date required for this item", variant: "destructive" });

    startTransition(async () => {
      const res = await addStockBatch({
        item_id: itemId,
        quantity_purchased: quantity,
        purchase_cost_per_unit: costPerUnit,
        expiry_date: expiryDate || null,
        purchase_date: purchaseDate,
        supplier_name: supplier,
        notes,
      });
      if ("error" in res) {
        toast({ title: "Stock in failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Stock added", description: `${quantity}× ${selectedItem?.name ?? "item"} added` });
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stock In</DialogTitle>
          <DialogDescription>Record a new purchase batch for an item.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger>
                <SelectValue placeholder="Select item…" />
              </SelectTrigger>
              <SelectContent>
                {items.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No items yet — add one first</div>
                ) : (
                  items.map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cost/unit (Rs.)</Label>
              <Input
                type="number"
                min={0}
                step={10}
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Purchase date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry date {needsExpiry && <span className="text-rose-400">*</span>}</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required={needsExpiry}
                disabled={!needsExpiry && selectedItem !== null}
                placeholder={!needsExpiry ? "Not tracked" : undefined}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Supplier (optional)</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Discount Sports Store" />
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {quantity > 0 && costPerUnit > 0 && (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.05] px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total cost</span>
              <span className="text-2xl font-bold text-sky-400 tabular-nums">{formatCurrency(quantity * costPerUnit)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={pending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending || !itemId} className="bg-sky-500 hover:bg-sky-600 text-white">
            {pending ? "Adding…" : "Add Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Item dialog ─────────────────────────────────────────────────────────

function AddItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("supplements");
  const [salePrice, setSalePrice] = useState<number>(0);
  const [threshold, setThreshold] = useState<number>(5);
  const [expiryTracked, setExpiryTracked] = useState(true);

  function reset() {
    setName(""); setCategory("supplements"); setSalePrice(0); setThreshold(5); setExpiryTracked(true);
  }
  function handleClose() { reset(); onClose(); }

  function handleSubmit() {
    if (!name.trim()) return toast({ title: "Name required", variant: "destructive" });
    if (salePrice < 0) return toast({ title: "Price cannot be negative", variant: "destructive" });
    if (threshold < 0) return toast({ title: "Threshold cannot be negative", variant: "destructive" });

    startTransition(async () => {
      const res = await addItem({
        name, category, sale_price: salePrice, low_stock_threshold: threshold, expiry_tracked: expiryTracked,
      });
      if ("error" in res) {
        toast({ title: "Add item failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Item added", description: `${name} created — now add stock to sell.` });
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
          <DialogDescription>Create a new product for your gym shop.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Whey 1kg Vanilla" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => {
              const cat = v as InventoryCategory;
              setCategory(cat);
              // Auto-toggle expiry tracking based on category
              setExpiryTracked(cat === "supplements" || cat === "beverages" || cat === "snacks");
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sale price (Rs.)</Label>
              <Input
                type="number"
                min={0}
                step={50}
                value={salePrice}
                onChange={(e) => setSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Low-stock alert at</Label>
              <Input
                type="number"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-card px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={expiryTracked}
              onChange={(e) => setExpiryTracked(e.target.checked)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Track expiry dates</p>
              <p className="text-xs text-muted-foreground">Sells expiring batches first (FEFO). Recommended for supplements & food.</p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={pending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending || !name.trim()} className="bg-primary text-white hover:bg-primary/90">
            {pending ? "Adding…" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Item detail drawer ─────────────────────────────────────────────────────

function ItemDetailDialog({
  item, batches, onClose, onAdjust, isOwner,
}: {
  item: InventoryItem | null;
  batches: InventoryBatch[];
  onClose: () => void;
  onAdjust: (b: InventoryBatch) => void;
  isOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleArchive() {
    if (!item) return;
    if (!confirm(`Archive "${item.name}"? It will hide from sale list but historical data is preserved.`)) return;
    startTransition(async () => {
      const res = await archiveItem(item.id);
      if ("error" in res) {
        toast({ title: "Archive failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Item archived" });
      onClose();
    });
  }

  if (!item) return null;
  const stock = item.total_stock ?? 0;

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            <span className={cn("inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border mr-2", CAT_COLORS[item.category])}>
              {CATEGORIES.find((c) => c.value === item.category)?.label}
            </span>
            Sale price: {formatCurrency(item.sale_price)} · Threshold: {item.low_stock_threshold}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stock summary */}
          <div className="rounded-xl border border-sidebar-border bg-card px-4 py-3 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total stock</span>
            <span className="text-2xl font-bold tabular-nums">{stock}</span>
          </div>

          {/* Batches */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Batches {item.expiry_tracked && <span className="ml-1 text-amber-400 normal-case">(FEFO)</span>}
            </p>
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active batches. Add stock to start selling.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {batches.sort((a, b) => {
                  if (item.expiry_tracked && a.expiry_date && b.expiry_date) return a.expiry_date.localeCompare(b.expiry_date);
                  return a.purchase_date.localeCompare(b.purchase_date);
                }).map((b) => {
                  const expiringSoon = b.expiry_date &&
                    Math.round((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) <= 30;
                  return (
                    <div key={b.id} className="rounded-lg border border-sidebar-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold tabular-nums">
                          {b.quantity_remaining}<span className="text-muted-foreground"> / {b.quantity_purchased}</span> units
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          @ {formatCurrency(Number(b.purchase_cost_per_unit))}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Bought {new Date(b.purchase_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        {b.expiry_date && (
                          <span className={cn("flex items-center gap-1", expiringSoon ? "text-amber-400 font-semibold" : "")}>
                            <Clock className="w-3 h-3" />
                            Expires {new Date(b.expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      {b.supplier_name && (
                        <p className="text-[10px] text-muted-foreground mt-1">Supplier: {b.supplier_name}</p>
                      )}
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => onAdjust(b)}
                          className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          <Settings2 className="w-3 h-3" /> Adjust count
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {isOwner && (
          <DialogFooter className="border-t border-sidebar-border pt-4">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="ghost" onClick={handleArchive} disabled={pending} className="text-rose-400 hover:text-rose-300">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {pending ? "Archiving…" : "Archive item"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Adjust Stock dialog ────────────────────────────────────────────────────

function AdjustStockDialog({ batch, onClose }: { batch: InventoryBatch | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [newQty, setNewQty] = useState<number>(0);
  const [reason, setReason] = useState("");

  function handleSubmit() {
    if (!batch) return;
    if (newQty < 0) return toast({ title: "Quantity cannot be negative", variant: "destructive" });
    if (newQty > batch.quantity_purchased) {
      return toast({ title: `Cannot exceed ${batch.quantity_purchased} (original purchase)`, variant: "destructive" });
    }
    if (!reason.trim()) return toast({ title: "Reason required", variant: "destructive" });

    startTransition(async () => {
      const res = await adjustStock(batch.id, newQty, reason);
      if ("error" in res) {
        toast({ title: "Adjust failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Stock adjusted" });
      onClose();
      setReason("");
    });
  }

  if (!batch) return null;
  const delta = newQty - batch.quantity_remaining;

  return (
    <Dialog open={!!batch} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            Manual count fix. Current: {batch.quantity_remaining} of {batch.quantity_purchased} purchased.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>New quantity</Label>
            <Input
              type="number"
              min={0}
              max={batch.quantity_purchased}
              value={newQty}
              onChange={(e) => setNewQty(Math.max(0, parseInt(e.target.value) || 0))}
              autoFocus
            />
            {delta !== 0 && (
              <p className={cn("text-xs", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
                {delta > 0 ? "+" : ""}{delta} units {delta > 0 ? "added" : "removed"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged, Manual recount, Lost"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending || !reason.trim()} className="bg-amber-500 hover:bg-amber-600 text-white">
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused-icon import warnings (icons reserved for future)
void Zap; void CheckCircle2;
