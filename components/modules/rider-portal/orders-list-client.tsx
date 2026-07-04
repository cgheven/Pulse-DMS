"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { MapPin, ChevronRight, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMyOrders } from "@/app/actions/rider";
import type { RiderOrder, RiderOrderStatus } from "@/types";

const TABS: { value: RiderOrderStatus | "all"; label: string }[] = [
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
    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize", styles[status])}>
      {status}
    </span>
  );
}

export function OrdersListClient({ initialOrders }: { initialOrders: RiderOrder[] }) {
  const [tab, setTab] = useState<RiderOrderStatus | "all">("all");
  const [orders, setOrders] = useState<RiderOrder[]>(initialOrders);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getMyOrders(tab === "all" ? undefined : { status: tab });
      setOrders(res.orders);
    });
  }, [tab]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-4 pb-2 lg:px-6 lg:pt-6 lg:max-w-7xl lg:mx-auto lg:w-full">
        <h1 className="text-lg font-bold text-foreground mb-3">My Orders</h1>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors",
                tab === t.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-sidebar-border hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("flex-1 overflow-y-auto p-4 pt-2 lg:px-6 lg:max-w-7xl lg:mx-auto lg:w-full transition-opacity", isPending && "opacity-60")}>
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <PackageSearch className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">No orders yet</p>
            <p className="text-xs text-muted-foreground mt-1">Orders you take will show up here.</p>
          </div>
        ) : (
          <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/rider/orders/${o.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-sidebar-border bg-card p-3.5 hover:bg-white/5 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate">{o.client?.name ?? "Client"}</p>
                  <StatusBadge status={o.status} />
                  {o.has_custom_item && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-muted/40 text-muted-foreground border-sidebar-border">
                      Custom
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{new Date(o.order_date).toLocaleDateString()}</span>
                  <span>•</span>
                  <span className="capitalize">{o.payment_method}</span>
                  {o.mapsUrl && (
                    <>
                      <span>•</span>
                      <a
                        href={o.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-0.5 text-primary hover:underline"
                      >
                        <MapPin className="w-3 h-3" /> Map
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-bold text-foreground">Rs {o.total_amount.toLocaleString()}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
          </div>
        )}
      </div>
    </div>
  );
}
