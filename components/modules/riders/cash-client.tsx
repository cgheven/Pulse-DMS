"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Wallet, RefreshCw, Receipt, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchContext } from "@/contexts/branch-context";
import { listCashCollections } from "@/app/actions/riders";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { Rider, RiderCashCollection, RiderCashTotalByRiderDay } from "@/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function startOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: "Today", from: todayISO, to: todayISO },
  { label: "This Week", from: startOfWeekISO, to: todayISO },
  { label: "This Month", from: startOfMonthISO, to: todayISO },
];

export function RiderCashClient({ riders }: { riders: Rider[] }) {
  const { branchId } = useBranchContext();
  const [collections, setCollections] = useState<RiderCashCollection[]>([]);
  const [totalsByRiderDay, setTotalsByRiderDay] = useState<RiderCashTotalByRiderDay[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [riderId, setRiderId] = useState<string>("all");
  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>(todayISO());
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useMemo(
    () => () => {
      if (!branchId) return;
      setLoading(true);
      startTransition(async () => {
        const res = await listCashCollections(branchId, {
          riderId: riderId === "all" ? undefined : riderId,
          from: from || undefined,
          to: to || undefined,
        });
        setCollections(res.collections);
        setTotalsByRiderDay(res.totalsByRiderDay);
        setGrandTotal(res.grandTotal);
        setLoading(false);
      });
    },
    [branchId, riderId, from, to]
  );

  useEffect(() => { load(); }, [load]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setFrom(p.from());
    setTo(p.to());
  }

  function clearRange() {
    setFrom("");
    setTo("");
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Cash Collection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cash your riders have collected from clients — totals per rider and per day.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-lg border border-sidebar-border px-3 py-2"
        >
          <RefreshCw className={cn("w-4 h-4", isPending && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5">
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
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full sm:w-40" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full sm:w-40" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={clearRange}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
          >
            All time
          </button>
        </div>
      </div>

      {/* Grand total */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total collected {riderId === "all" ? "(all riders)" : ""}</p>
          <p className="text-xl font-bold text-foreground">Rs {grandTotal.toLocaleString()}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-sidebar-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Totals per rider/day */}
          <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-sidebar-border bg-muted/20">
              <p className="text-sm font-semibold text-foreground">Totals by Rider &amp; Day</p>
            </div>
            {totalsByRiderDay.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No cash collected for this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-sidebar-border">
                      <th className="px-4 py-2 font-medium">Rider</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border">
                    {totalsByRiderDay.map((t) => (
                      <tr key={`${t.riderId}:${t.date}`}>
                        <td className="px-4 py-2.5 text-foreground font-medium whitespace-nowrap">{t.riderName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-foreground whitespace-nowrap">Rs {t.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Raw collection log */}
          <div className="space-y-2.5">
            <p className="text-sm font-semibold text-foreground px-1">Collection Log</p>
            {collections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-sidebar-border">
                <ReceiptText className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No cash collections found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different filter, or check back once riders start recording collections.</p>
              </div>
            ) : (
              collections.map((c) => (
                <div key={c.id} className="rounded-xl border border-sidebar-border bg-card p-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.client?.name ?? "Client (unlinked)"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.rider?.full_name ?? "Rider"} • {new Date(c.collection_date).toLocaleDateString()}
                        {c.order && <> • Order Rs {c.order.total_amount.toLocaleString()}</>}
                      </p>
                      {c.note && <p className="text-xs text-muted-foreground mt-1">{c.note}</p>}
                    </div>
                  </div>
                  <span className="font-bold text-foreground shrink-0">Rs {c.amount.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
