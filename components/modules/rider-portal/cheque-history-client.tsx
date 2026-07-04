"use client";

import Link from "next/link";
import { PlusCircle, Landmark, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiderChequeCollection, RiderChequeStatus } from "@/types";

function StatusBadge({ status }: { status: RiderChequeStatus }) {
  const styles: Record<RiderChequeStatus, string> = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cleared: "bg-green-500/10 text-green-400 border-green-500/20",
    bounced: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border capitalize shrink-0", styles[status])}>
      {status}
    </span>
  );
}

export function ChequeHistoryClient({ cheques }: { cheques: RiderChequeCollection[] }) {
  const pending = cheques.filter((c) => c.status === "pending");
  const pendingTotal = pending.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl w-full mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Cheque Collection</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Your recorded cheque collections.</p>
        </div>
        <Link
          href="/rider/cheque/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> New
        </Link>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pending ({pending.length})</p>
          <p className="text-xl font-bold text-foreground">Rs {pendingTotal.toLocaleString()}</p>
        </div>
      </div>

      {cheques.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-sidebar-border">
          <Landmark className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No cheque collections yet</p>
          <p className="text-xs text-muted-foreground mt-1">Cheques you record will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {cheques.map((c) => (
            <div key={c.id} className="rounded-xl border border-sidebar-border bg-card p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Landmark className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{c.client?.name ?? "Client"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      #{c.cheque_number}{c.bank_name && <> • {c.bank_name}</>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cheque date {new Date(c.cheque_date).toLocaleDateString()}
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
              {c.status === "pending" && c.daysPending != null && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t border-sidebar-border">
                  <Clock className="w-3 h-3" /> Pending {c.daysPending} {c.daysPending === 1 ? "day" : "days"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
