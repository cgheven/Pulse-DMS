"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createLead, updateLead, type Lead } from "@/app/actions/sales-rep";
import { LEAD_PRIORITY_CONFIG, LEAD_PRIORITY_ORDER, type LeadPriority } from "@/lib/lead-priority";

const SOURCES = [
  { value: "cold_visit", label: "Cold Visit" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "other", label: "Other" },
];

// One dialog for both Add and Edit — `lead` null means add mode. Keeping them
// as a single component is what stops the two forms drifting apart.
export default function LeadFormModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!lead;
  const [form, setForm] = useState({
    business_name: lead?.business_name ?? "",
    contact_name: lead?.contact_name ?? "",
    whatsapp_number: lead?.whatsapp_number ?? "",
    email: lead?.email ?? "",
    city: lead?.city ?? "",
    source: lead?.source ?? "cold_visit",
    notes: lead?.notes ?? "",
    next_followup_date: lead?.next_followup_date ?? "",
    priority: (lead?.priority ?? "medium") as LeadPriority,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = isEdit
        ? await updateLead(lead!.id, {
            business_name: form.business_name,
            contact_name: form.contact_name,
            whatsapp_number: form.whatsapp_number,
            email: form.email,
            city: form.city,
            source: form.source,
            notes: form.notes,
          })
        : await createLead(form);
      if (res.error) { setError(res.error); return; }
      onSaved();
      onClose();
    });
  }

  const inputCls = "w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";
  const canSubmit = form.business_name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-sidebar-border">
          <h2 className="text-lg font-bold text-foreground">{isEdit ? "Edit Lead" : "Add Lead"}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isEdit ? "Update this lead's details" : "Add a prospective customer to your pipeline"}
          </p>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Business Name *</label>
            <input value={form.business_name} onChange={e => set("business_name", e.target.value)} autoFocus
              placeholder="Karachi General Store" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Contact Name</label>
              <input value={form.contact_name} onChange={e => set("contact_name", e.target.value)}
                placeholder="Rashid Ahmed" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">WhatsApp Number</label>
              <input value={form.whatsapp_number} onChange={e => set("whatsapp_number", e.target.value)}
                placeholder="03xx-xxxxxxx" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">City</label>
              <input value={form.city} onChange={e => set("city", e.target.value)}
                placeholder="Karachi" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Source</label>
              <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
              <input value={form.email} onChange={e => set("email", e.target.value)} type="email"
                placeholder="rashid@store.pk" className={inputCls} />
            </div>
          </div>

          {!isEdit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Priority</label>
                <select value={form.priority} onChange={e => set("priority", e.target.value as LeadPriority)} className={inputCls}>
                  {LEAD_PRIORITY_ORDER.map(p => (
                    <option key={p} value={p}>{LEAD_PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Follow-up Date</label>
                <input type="date" value={form.next_followup_date}
                  onChange={e => set("next_followup_date", e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
              placeholder="Any initial notes…" className={inputCls + " resize-none"} />
          </div>

          {isEdit && (
            <p className="text-[11px] text-muted-foreground/60">
              Priority and follow-up date are edited directly from the leads table.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-sidebar-border flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={pending || !canSubmit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {pending && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
