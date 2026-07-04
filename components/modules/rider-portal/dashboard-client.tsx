"use client";

import Link from "next/link";
import { Bike, Phone, Truck, Building2, Store, PlusCircle, ClipboardList, Wallet, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RiderDashboardInfo } from "@/app/actions/rider";

export type RiderTodayStats = {
  ordersToday: number;
  pendingCount: number;
  totalToday: number;
  cashCollectedToday: number;
  pendingChequeCount: number;
  pendingChequeTotal: number;
};

export function RiderDashboardClient({ info, stats }: { info: RiderDashboardInfo | null; stats: RiderTodayStats }) {
  if (!info) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          Could not load your rider profile. Please contact your shop owner.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl w-full mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Welcome, {info.fullName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your rider profile at a glance</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/rider/orders/new"
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 hover:bg-primary/10 transition-colors"
        >
          <PlusCircle className="w-6 h-6 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-foreground text-sm leading-tight">New Order</p>
            <p className="text-xs text-muted-foreground">Take an order</p>
          </div>
        </Link>
        <Link
          href="/rider/orders"
          className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-card p-4 hover:bg-white/5 transition-colors"
        >
          <ClipboardList className="w-6 h-6 text-muted-foreground shrink-0" />
          <div>
            <p className="font-semibold text-foreground text-sm leading-tight">My Orders</p>
            <p className="text-xs text-muted-foreground">{stats.pendingCount} pending</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-sidebar-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.ordersToday}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Orders Today</p>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">Rs {stats.totalToday.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Today&apos;s Value</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/rider/cash"
          className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-card p-4 hover:bg-white/5 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight">Cash Collected Today</p>
            <p className="text-xs text-muted-foreground">Rs {stats.cashCollectedToday.toLocaleString()} — view history</p>
          </div>
        </Link>

        <Link
          href="/rider/cheque"
          className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-card p-4 hover:bg-white/5 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight">Pending Cheques</p>
            <p className="text-xs text-muted-foreground">
              {stats.pendingChequeCount} • Rs {stats.pendingChequeTotal.toLocaleString()}
            </p>
          </div>
        </Link>
      </div>

      <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Bike className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{info.fullName}</p>
              <p className="text-xs text-muted-foreground">Delivery Rider</p>
            </div>
          </div>
          {info.isActive ? (
            <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/10">Active</Badge>
          ) : (
            <Badge variant="secondary" className="bg-muted text-muted-foreground border border-sidebar-border">Inactive</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-foreground">{info.phone}</span>
          </div>
          {info.vehicleNumber && (
            <div className="flex items-center gap-2.5 text-sm">
              <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">{info.vehicleNumber}</span>
            </div>
          )}
          {info.shopName && (
            <div className="flex items-center gap-2.5 text-sm">
              <Store className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">{info.shopName}</span>
            </div>
          )}
          {info.branchName && (
            <div className="flex items-center gap-2.5 text-sm">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">{info.branchName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
