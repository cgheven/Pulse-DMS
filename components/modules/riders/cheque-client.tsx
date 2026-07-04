"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Landmark, RefreshCw, CheckCircle2, XCircle, Clock, Banknote } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useBranchContext } from "@/contexts/branch-context";
import { listChequeCollections, updateChequeStatus } from "@/app/actions/riders";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Rider, RiderChequeCollection, RiderChequeStatus } from "@/types";

const STATUS_TABS: { value: RiderChequeStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "cleared", label: "Cleared" },
  { value: "bounced", label: "Bounced" },
];

function agingBadge(days: number) {
  // Green under 2 weeks, amber up to a month, red beyond — a quick visual
  // signal for which pending cheques need follow-up first.
  const cls =
    days > 30
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : days > 14
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-green-500/10 text-green-400 border-green-500/20";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border", cls)}>
      <Clock className="w-3 h-3" /> {days} {days === 1 ? "day" : "days"}
    </span>
  );
}

function StatusBadge({ status }: { status: RiderChequeStatus }) {
  const styles: Record<RiderChequeStatus, string> = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cleared: "bg-green-500/10 text-green-400 border-green-500/20",
    bounced: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border capitalize", styles[status])}>
      {status}
    </span>
  );
}

export function RiderChequeClient({ riders }: { riders: Rider[] }) {
  const { branchId } = useBranchContext();
  const [cheques, setCheques] = useState<RiderChequeCollection[]>([]);
  const [riderId, setRiderId] = useState<string>("all");
  const [status, setStatus] = useState<RiderChequeStatus | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useMemo(
    () => () => {
      if (!branchId) return;
      setLoading(true);
      startTransition(async () => {
        const res = await listChequeCollections(branchId, {
          riderId: riderId === "all" ? undefined : riderId,
          status: status === "all" ? undefined : status,
        });
        setCheques(res.cheques);
        setLoading(false);
      });
    },
    [branchId, riderId, status]
  );

  useEffect(() => { load(); }, [load]);

  const pendingTotal = useMemo(
    () => cheques.filter((c) => c.status === "pending").reduce((sum, c) => sum + c.amount, 0),
    [cheques]
  );
  const filteredTotal = useMemo(() => cheques.reduce((sum, c) => sum + c.amount, 0), [cheques]);
  const totalLabel = status === "all" ? "Pending total" : `${STATUS_TABS.find((t) => t.value === status)?.label} total`;
  const totalAmount = status === "all" ? pendingTotal : filteredTotal;

  function handleStatusChange(chequeId: string, next: "cleared" | "bounced") {
    setActioningId(chequeId);
    const prev = cheques;
    // Optimistic update, rollback on error.
    setCheques((cur) => cur.map((c) => (c.id === chequeId ? { ...c, status: next, daysPending: null } : c)));
    startTransition(async () => {
      const res = await updateChequeStatus(chequeId, next);
      setActioningId(null);
      if (res.error) {
        setCheques(prev);
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: next === "cleared" ? "Cheque marked cleared" : "Cheque marked bounced" });
      // Re-filter locally: if the current tab is "pending", the row should
      // now drop out of view without waiting for a full reload.
      if (status !== "all" && status !== next) {
        setCheques((cur) => cur.filter((c) => c.id !== chequeId));
      }
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Cheque Collection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cheques your riders have collected — mark cleared/bounced and track pending aging.</p>
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
        <div className="flex gap-1.5 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors",
                status === t.value
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-sidebar-border text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pending total */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{totalLabel} {riderId === "all" ? "(all riders)" : ""}</p>
          <p className="text-xl font-bold text-foreground">Rs {totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-sidebar-border bg-card animate-pulse" />
          ))}
        </div>
      ) : cheques.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-sidebar-border">
          <Banknote className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No cheques found</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different filter, or check back once riders start recording cheque collections.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {cheques.map((c) => (
            <div key={c.id} className="rounded-xl border border-sidebar-border bg-card p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Landmark className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{c.client?.name ?? "Client"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.rider?.full_name ?? "Rider"} • #{c.cheque_number}
                      {c.bank_name && <> • {c.bank_name}</>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cheque date {new Date(c.cheque_date).toLocaleDateString()} • Collected {new Date(c.collection_date).toLocaleDateString()}
                      {c.order && <> • Order Rs {c.order.total_amount.toLocaleString()}</>}
                    </p>
                    {c.note && <p className="text-xs text-muted-foreground mt-1">{c.note}</p>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="font-bold text-foreground">Rs {c.amount.toLocaleString()}</span>
                  <StatusBadge status={c.status} />
                </div>
              </div>

              {c.status === "pending" && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-sidebar-border">
                  {c.daysPending != null ? agingBadge(c.daysPending) : <span />}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
                      disabled={isPending && actioningId === c.id}
                      onClick={() => handleStatusChange(c.id, "bounced")}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Bounced
                    </Button>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={isPending && actioningId === c.id}
                      onClick={() => handleStatusChange(c.id, "cleared")}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Cleared
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
