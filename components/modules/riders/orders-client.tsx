"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MapPin, PackageSearch, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchContext } from "@/contexts/branch-context";
import { listAllOrders, getOrderDetailForOwner } from "@/app/actions/riders";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Rider, RiderOrder, RiderOrderItem, RiderOrderStatus } from "@/types";

const STATUS_TABS: { value: RiderOrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function StatusBadge({ status }: { status: RiderOrderStatus }) {
  const styles: Record<RiderOrderStatus, string> = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    delivered: "bg-green-500/10 text-green-400 border-green-500/20",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap", styles[status])}>
      {status}
    </span>
  );
}

export function RiderOrdersClient({ riders }: { riders: Rider[] }) {
  const { branchId } = useBranchContext();
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [status, setStatus] = useState<RiderOrderStatus | "all">("all");
  const [riderId, setRiderId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<RiderOrderItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  function toggleExpand(order: RiderOrder) {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    setExpandedItems([]);
    if (!branchId) return;
    setItemsLoading(true);
    getOrderDetailForOwner(order.id, branchId).then((res) => {
      setExpandedItems(res.items);
      setItemsLoading(false);
    });
  }

  const load = useMemo(
    () => () => {
      if (!branchId) return;
      setLoading(true);
      startTransition(async () => {
        const res = await listAllOrders(branchId, {
          status: status === "all" ? undefined : status,
          riderId: riderId === "all" ? undefined : riderId,
        });
        setOrders(res.orders);
        setLoading(false);
      });
    },
    [branchId, status, riderId]
  );

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All orders taken by your riders — standalone from Sales/Stock.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-lg border border-sidebar-border px-3 py-2"
        >
          <RefreshCw className={cn("w-4 h-4", isPending && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="flex gap-1.5 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors",
                status === t.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-sidebar-border hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select value={riderId} onValueChange={setRiderId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All riders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All riders</SelectItem>
            {riders.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-sidebar-border bg-card animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-sidebar-border">
          <PackageSearch className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No orders found</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different filter, or check back once riders start taking orders.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map((o) => {
            const expanded = expandedId === o.id;
            return (
              <div key={o.id} className="rounded-xl border border-sidebar-border bg-card p-3.5">
                <button className="w-full text-left" onClick={() => toggleExpand(o)}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground truncate">{o.client?.name ?? "Client"}</p>
                        <StatusBadge status={o.status} />
                        {o.has_custom_item && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-muted/40 text-muted-foreground border-sidebar-border">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {o.rider?.full_name ?? "Rider"} • {new Date(o.order_date).toLocaleDateString()} • <span className="capitalize">{o.payment_method}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-bold text-foreground">Rs {o.total_amount.toLocaleString()}</span>
                      {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </button>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-sidebar-border/60">
                  {o.client?.phone ? (
                    <span className="text-xs text-muted-foreground">{o.client.phone}</span>
                  ) : <span />}
                  {o.mapsUrl ? (
                    <a
                      href={o.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <MapPin className="w-3.5 h-3.5" /> View on Google Maps
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">No location captured</span>
                  )}
                </div>
                {expanded && (
                  <div className="mt-2.5 pt-2.5 border-t border-sidebar-border/60 space-y-1.5">
                    {itemsLoading ? (
                      <p className="text-xs text-muted-foreground">Loading items...</p>
                    ) : expandedItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No items found.</p>
                    ) : (
                      expandedItems.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-xs">
                          <span className="text-foreground">
                            {it.product_name} <span className="text-muted-foreground">× {it.quantity}</span>
                            {it.product_id === null && (
                              <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-muted/40 text-muted-foreground border-sidebar-border align-middle">
                                Custom
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-foreground">Rs {it.line_total.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                    {o.notes && (
                      <p className="text-xs text-muted-foreground pt-1 border-t border-sidebar-border/40 mt-1.5">Note: {o.notes}</p>
                    )}
                    {o.status === "cancelled" && o.cancelled_reason && (
                      <p className="text-xs text-red-400 pt-1">Cancelled: {o.cancelled_reason}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
