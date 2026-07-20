"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateLeadStatus, type Lead } from "@/app/actions/sales-rep";
import { LEAD_STATUS_CONFIG, type LeadStatus } from "@/lib/lead-status";

const PAYMENT_METHODS = [
  { value: "", label: "Select…" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "cheque", label: "Cheque" },
];

// Gate for the two statuses that carry extra data. `converted` must capture the
// payment amount and plan type — commission is computed from those two fields,
// so letting the status through without them silently pays the rep nothing.
export default function StatusChangeModal({
  lead,
  nextStatus,
  onClose,
  onSaved,
}: {
  lead: Lead;
  nextStatus: LeadStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isConverted = nextStatus === "converted";
  const [amount, setAmount] = useState(lead.payment_amount != null ? String(lead.payment_amount) : "");
  const [method, setMethod] = useState(lead.payment_method ?? "");
  const [planType, setPlanType] = useState(lead.plan_type || "monthly");
  const [reason, setReason] = useState(lead.lost_reason ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = isConverted
        ? await updateLeadStatus(lead.id, nextStatus, {
            payment_amount: amount ? Number(amount) : undefined,
            payment_method: method || undefined,
            plan_type: planType,
          })
        : await updateLeadStatus(lead.id, nextStatus, { lost_reason: reason });
      if (res.error) { setError(res.error); return; }
      onSaved();
    });
  }

  const inputCls = "w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <h3 className="text-base font-bold text-foreground mb-1">
          {isConverted ? "Mark as Converted" : "Mark as Rejected"}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          <span className="font-semibold text-foreground">{lead.business_name}</span>
          {" → "}
          <span className={`inline-block rounded border px-1.5 py-0.5 font-semibold ${LEAD_STATUS_CONFIG[nextStatus].cls}`}>
            {LEAD_STATUS_CONFIG[nextStatus].label}
          </span>
        </p>

        {error && (
          <p className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>
        )}

        {isConverted ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Amount (PKR)</label>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 12000" className={inputCls} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Payment Method</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Plan Type</label>
              <div className="flex gap-2">
                {["monthly", "annual"].map(p => (
                  <button key={p} type="button" onClick={() => setPlanType(p)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-semibold capitalize transition-colors ${
                      planType === p
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "border-sidebar-border text-muted-foreground hover:bg-white/5"
                    }`}>
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                Commission is calculated from the amount and plan type.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
              placeholder="e.g. Budget nahi hai, already dusra system…"
              className={inputCls + " resize-none"} />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-white/5">
            Cancel
          </button>
          <button onClick={submit} disabled={pending || (isConverted && !amount)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
              isConverted ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600"
            }`}>
            {pending && <Loader2 size={13} className="animate-spin" />}
            {isConverted ? "Confirm" : "Mark Rejected"}
          </button>
        </div>
      </div>
    </div>
  );
}
