"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, CheckCircle2, XCircle, Loader2, ArrowLeft, Wallet, Landmark } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateOrderStatus, recordCashCollection, recordChequeCollection } from "@/app/actions/rider";
import type { RiderOrder, RiderOrderItem, RiderOrderStatus } from "@/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: RiderOrderStatus }) {
  const styles: Record<RiderOrderStatus, string> = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    delivered: "bg-green-500/10 text-green-400 border-green-500/20",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border capitalize", styles[status])}>
      {status}
    </span>
  );
}

export function OrderDetailClient({ order, items }: { order: RiderOrder; items: RiderOrderItem[] }) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Marking a cash-payment order delivered inline-prompts for the cash
  // amount actually received (prefilled with total_amount, editable) before
  // finalizing — recordCashCollection() runs first, then updateOrderStatus().
  const [showCashPrompt, setShowCashPrompt] = useState(false);
  const [cashAmount, setCashAmount] = useState(String(order.total_amount));
  // Marking a cheque-payment order delivered inline-prompts for the cheque
  // details (number/bank/date, amount prefilled from total_amount) before
  // finalizing — recordChequeCollection() runs first, then updateOrderStatus().
  const [showChequePrompt, setShowChequePrompt] = useState(false);
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeDate, setChequeDate] = useState(todayISO());
  const [chequeAmount, setChequeAmount] = useState(String(order.total_amount));
  const [isPending, startTransition] = useTransition();

  function markDelivered() {
    if (order.payment_method === "cash" && status === "pending") {
      setShowCashPrompt(true);
      return;
    }
    if (order.payment_method === "cheque" && status === "pending") {
      setShowChequePrompt(true);
      return;
    }
    startTransition(async () => {
      const res = await updateOrderStatus(order.id, "delivered");
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setStatus("delivered");
      toast({ title: "Order marked as delivered" });
      router.refresh();
    });
  }

  function confirmCashAndDeliver() {
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Error", description: "Enter a valid cash amount", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const cashRes = await recordCashCollection({ orderId: order.id, clientId: order.client_id, amount });
      if (cashRes.error) {
        toast({ title: "Error", description: cashRes.error, variant: "destructive" });
        return;
      }
      const res = await updateOrderStatus(order.id, "delivered");
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setStatus("delivered");
      setShowCashPrompt(false);
      toast({ title: "Cash recorded & order delivered", description: `Rs ${amount.toLocaleString()} collected` });
      router.refresh();
    });
  }

  function confirmChequeAndDeliver() {
    const amount = Number(chequeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Error", description: "Enter a valid cheque amount", variant: "destructive" });
      return;
    }
    if (!chequeNumber.trim()) {
      toast({ title: "Error", description: "Enter the cheque number", variant: "destructive" });
      return;
    }
    if (!chequeDate) {
      toast({ title: "Error", description: "Enter the cheque date", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const chequeRes = await recordChequeCollection({
        orderId: order.id,
        clientId: order.client_id,
        chequeNumber: chequeNumber.trim(),
        bankName: bankName.trim() || undefined,
        chequeDate,
        amount,
      });
      if (chequeRes.error) {
        toast({ title: "Error", description: chequeRes.error, variant: "destructive" });
        return;
      }
      const res = await updateOrderStatus(order.id, "delivered");
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setStatus("delivered");
      setShowChequePrompt(false);
      toast({ title: "Cheque recorded & order delivered", description: `Rs ${amount.toLocaleString()} — cheque #${chequeNumber.trim()}` });
      router.refresh();
    });
  }

  function confirmCancel() {
    startTransition(async () => {
      const res = await updateOrderStatus(order.id, "cancelled", { cancelledReason: cancelReason.trim() || undefined });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setStatus("cancelled");
      setShowCancelReason(false);
      toast({ title: "Order cancelled" });
      router.refresh();
    });
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5 max-w-lg w-full mx-auto">
      <button onClick={() => router.push("/rider/orders")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Orders
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">{order.client?.name ?? "Client"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{new Date(order.order_date).toLocaleDateString()}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {order.client?.phone && (
        <p className="text-sm text-muted-foreground">{order.client.phone}</p>
      )}

      <div className="rounded-xl border border-sidebar-border bg-card divide-y divide-sidebar-border overflow-hidden">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-foreground">{it.product_name}</p>
                {it.product_id === null && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-muted/40 text-muted-foreground border-sidebar-border">
                    Custom
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{it.quantity} × Rs {it.unit_price.toLocaleString()}</p>
            </div>
            <span className="font-semibold text-foreground">Rs {it.line_total.toLocaleString()}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-base font-bold text-foreground">Rs {order.total_amount.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm rounded-xl border border-sidebar-border bg-card px-4 py-3">
        <span className="text-muted-foreground">Payment Method</span>
        <span className="font-semibold text-foreground capitalize">{order.payment_method}</span>
      </div>

      {order.notes && (
        <div className="rounded-xl border border-sidebar-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Note</p>
          <p className="text-sm text-foreground">{order.notes}</p>
        </div>
      )}

      {order.mapsUrl ? (
        <a
          href={order.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-sidebar-border bg-card py-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
        >
          <MapPin className="w-4 h-4" /> Open order location in Google Maps
        </a>
      ) : (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
          <MapPin className="w-3.5 h-3.5" /> No location captured for this order
        </p>
      )}

      {status === "cancelled" && order.cancelled_reason && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400 mb-1">Cancellation reason</p>
          <p className="text-sm text-foreground">{order.cancelled_reason}</p>
        </div>
      )}

      {status === "pending" && (
        <div className="space-y-2 pt-2">
          {showCashPrompt ? (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-medium text-foreground">Cash amount received</p>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="h-11 text-base"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-10" onClick={() => setShowCashPrompt(false)} disabled={isPending}>
                  Back
                </Button>
                <Button className="h-10" disabled={isPending} onClick={confirmCashAndDeliver}>
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            </div>
          ) : showChequePrompt ? (
            <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-medium text-foreground">Cheque details</p>
              </div>
              <Input
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
                placeholder="Cheque number *"
                className="h-11"
                autoFocus
              />
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Bank name (optional)"
                className="h-11"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={chequeDate}
                  onChange={(e) => setChequeDate(e.target.value)}
                  className="h-11"
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  value={chequeAmount}
                  onChange={(e) => setChequeAmount(e.target.value)}
                  placeholder="Amount"
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-10" onClick={() => setShowChequePrompt(false)} disabled={isPending}>
                  Back
                </Button>
                <Button className="h-10" disabled={isPending} onClick={confirmChequeAndDeliver}>
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            </div>
          ) : !showCancelReason ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
                disabled={isPending}
                onClick={() => setShowCancelReason(true)}
              >
                <XCircle className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
              <Button className="h-12" disabled={isPending} onClick={markDelivered}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark Delivered</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (optional)"
                className="min-h-[70px]"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-10" onClick={() => setShowCancelReason(false)} disabled={isPending}>
                  Back
                </Button>
                <Button variant="destructive" className="h-10" onClick={confirmCancel} disabled={isPending}>
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Cancel"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
