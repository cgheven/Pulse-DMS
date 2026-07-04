"use client";

import Link from "next/link";
import { PlusCircle, Receipt, ReceiptText, Wallet } from "lucide-react";
import type { RiderCashCollection } from "@/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CashHistoryClient({ collections }: { collections: RiderCashCollection[] }) {
  const today = todayISO();
  const todaysTotal = collections
    .filter((c) => c.collection_date === today)
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl w-full mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Cash Collection</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Your recorded cash collections.</p>
        </div>
        <Link
          href="/rider/cash/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> New
        </Link>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Collected today</p>
          <p className="text-xl font-bold text-foreground">Rs {todaysTotal.toLocaleString()}</p>
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-sidebar-border">
          <ReceiptText className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No cash collections yet</p>
          <p className="text-xs text-muted-foreground mt-1">Collections you record will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {collections.map((c) => (
            <div key={c.id} className="rounded-xl border border-sidebar-border bg-card p-3.5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                  <Receipt className="w-4 h-4 text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{c.client?.name ?? "Client"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(c.collection_date).toLocaleDateString()}
                    {c.order && <> • Order Rs {c.order.total_amount.toLocaleString()}</>}
                  </p>
                  {c.note && <p className="text-xs text-muted-foreground mt-1">{c.note}</p>}
                </div>
              </div>
              <span className="font-bold text-foreground shrink-0">Rs {c.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
