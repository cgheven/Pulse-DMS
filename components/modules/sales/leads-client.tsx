"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, ChevronRight, Loader2, Target,
  CalendarCheck, AlertTriangle, Trophy, Filter,
  MessageCircle, Phone, Zap,
} from "lucide-react";
import { createLead, type Lead, type LeadStatus } from "@/app/actions/sales-rep";
import { CreateTrialModal } from "@/components/modules/sales/create-trial-modal";

// ── helpers ───────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

function isOverdue(lead: Lead) {
  return (
    lead.next_followup_date &&
    lead.next_followup_date < today &&
    lead.status !== "active" &&
    lead.status !== "lost"
  );
}

function isDueToday(lead: Lead) {
  return lead.next_followup_date === today;
}

function lastActivityAgo(updatedAt: string): string {
  const diff = Date.now() - new Date(updatedAt).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_META: Record<LeadStatus, { label: string; emoji: string; cls: string }> = {
  new:              { label: "New",             emoji: "🟢", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  contacted:        { label: "Contacted",       emoji: "📞", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  demo_given:       { label: "Demo",            emoji: "🖥",  cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  follow_up:        { label: "Follow-up",       emoji: "💬", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  negotiating:      { label: "Negotiating",     emoji: "🤝", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  payment_pending:  { label: "Pymt. Pending",   emoji: "⏳", cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  payment_received: { label: "Pymt. Received",  emoji: "💰", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  onboarding:       { label: "Onboarding",      emoji: "🚀", cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  active:           { label: "Active",          emoji: "✅", cls: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  lost:             { label: "Lost",            emoji: "❌", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

function StatusBadge({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${m.cls}`}>
      {m.emoji} {m.label}
    </span>
  );
}

// ── WhatsApp button ───────────────────────────────────────────────────────────

function WaButton({ phone, name }: { phone: string; name: string }) {
  const safe = phone.replace(/[^0-9+\-() ]/g, "");
  const digits = safe.replace(/\D/g, "").replace(/^0/, "92");
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(`Assalam-o-Alaikum ${name ? name + "," : ""} Pulse DMS ke baare mein baat karni thi.`)}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold transition-colors whitespace-nowrap"
    >
      <MessageCircle size={12} />
      {safe}
    </a>
  );
}

// ── Add Lead Modal ────────────────────────────────────────────────────────────

function AddLeadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: "", contact_name: "", whatsapp_number: "",
    email: "", city: "", source: "other", notes: "", next_followup_date: "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createLead(form);
      if (res.error) { setError(res.error); return; }
      onClose();
      router.push(`/sales/leads/${res.leadId}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-sidebar-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">New Lead</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Add a prospective customer to your pipeline</p>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Shop / Business Name *</label>
              <input value={form.business_name} onChange={e => set("business_name", e.target.value)} placeholder="Karachi General Store" autoFocus
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Contact Name</label>
              <input value={form.contact_name} onChange={e => set("contact_name", e.target.value)} placeholder="Rashid Ahmed"
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">WhatsApp Number</label>
              <input value={form.whatsapp_number} onChange={e => set("whatsapp_number", e.target.value)} placeholder="03xx-xxxxxxx"
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">City</label>
              <input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Karachi"
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Source</label>
              <select value={form.source} onChange={e => set("source", e.target.value)}
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="cold_visit">Cold Visit</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="referral">Referral</option>
                <option value="social_media">Social Media</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Follow-up Date</label>
              <input type="date" value={form.next_followup_date} onChange={e => set("next_followup_date", e.target.value)}
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
              <input value={form.email} onChange={e => set("email", e.target.value)} type="email" placeholder="rashid@store.pk"
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Any initial notes…"
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-sidebar-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={pending || !form.business_name.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Add Lead
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status filter options ─────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "🟢 New" },
  { value: "contacted", label: "📞 Contacted" },
  { value: "demo_given", label: "🖥 Demo" },
  { value: "follow_up", label: "💬 Follow-up" },
  { value: "negotiating", label: "🤝 Negotiating" },
  { value: "payment_pending", label: "⏳ Pymt. Pending" },
  { value: "payment_received", label: "💰 Pymt. Received" },
  { value: "onboarding", label: "🚀 Onboarding" },
  { value: "active", label: "✅ Active" },
  { value: "lost", label: "❌ Lost" },
];

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LeadsClient({ leads }: { leads: Lead[] }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(() => searchParams.get("new") === "1");
  const [trialLead, setTrialLead] = useState<Lead | null>(null);

  // Top-line stats
  const stats = useMemo(() => ({
    active:  leads.filter(l => l.status !== "lost" && l.status !== "active").length,
    dueToday: leads.filter(isDueToday).length,
    overdue: leads.filter(isOverdue).length,
    won:     leads.filter(l => l.status === "active" || l.status === "payment_received").length,
  }), [leads]);

  const filtered = useMemo(() => {
    let rows = leads;
    if (status !== "all") rows = rows.filter(l => l.status === status);
    if (dueOnly) rows = rows.filter(isDueToday);
    if (overdueOnly) rows = rows.filter(l => !!isOverdue(l));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(l =>
        l.business_name.toLowerCase().includes(q) ||
        l.contact_name.toLowerCase().includes(q) ||
        l.whatsapp_number.includes(q) ||
        (l.city ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [leads, status, search, dueOnly, overdueOnly]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track every conversation from cold visit to closed deal</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/18 transition-colors"
        >
          <Plus size={15} />
          Add Lead
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-sidebar-border bg-sidebar p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Leads</p>
            <Target size={15} className="text-primary" />
          </div>
          <p className="text-3xl font-black text-foreground">{stats.active}</p>
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-amber-400/70 uppercase tracking-wide">Due Today</p>
            <CalendarCheck size={15} className="text-amber-400" />
          </div>
          <p className="text-3xl font-black text-amber-400">{stats.dueToday}</p>
        </div>
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-red-400/70 uppercase tracking-wide">Overdue</p>
            <AlertTriangle size={15} className="text-red-400" />
          </div>
          <p className="text-3xl font-black text-red-400">{stats.overdue}</p>
        </div>
        <div className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-teal-400/70 uppercase tracking-wide">Won / Active</p>
            <Trophy size={15} className="text-teal-400" />
          </div>
          <p className="text-3xl font-black text-teal-400">{stats.won}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar px-4 py-3">
        <select
          value={status}
          onChange={e => setStatus(e.target.value as LeadStatus | "all")}
          className="rounded-lg border border-sidebar-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => { setDueOnly(v => !v); if (!dueOnly) setOverdueOnly(false); }}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${dueOnly ? "bg-amber-400 border-amber-400" : "border-sidebar-border bg-card"}`}
          >
            {dueOnly && <span className="text-[9px] text-black font-black">✓</span>}
          </div>
          <span className="text-sm text-muted-foreground">Due today only</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => { setOverdueOnly(v => !v); if (!overdueOnly) setDueOnly(false); }}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${overdueOnly ? "bg-red-400 border-red-400" : "border-sidebar-border bg-card"}`}
          >
            {overdueOnly && <span className="text-[9px] text-black font-black">✓</span>}
          </div>
          <span className="text-sm text-muted-foreground">Show overdue only</span>
        </label>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search business, contact, city…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-sidebar-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {filtered.length} of {leads.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-sidebar-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sidebar-border bg-sidebar/80">
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Business</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Contact</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">WhatsApp</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Follow-up</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Last Activity</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sidebar-border/60">
              {filtered.map(lead => {
                const overdue = isOverdue(lead);
                const duetoday = isDueToday(lead);
                return (
                  <tr key={lead.id}
                    className={`group transition-colors hover:bg-sidebar/60 ${overdue ? "bg-red-500/5" : ""}`}
                  >
                    {/* Business */}
                    <td className="px-4 py-3">
                      <Link href={`/sales/leads/${lead.id}`} className="block">
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[200px]">
                          {lead.business_name}
                        </p>
                        {lead.city && <p className="text-xs text-muted-foreground">{lead.city}</p>}
                      </Link>
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground">{lead.contact_name || "—"}</p>
                      {lead.email && <p className="text-xs text-muted-foreground truncate max-w-[140px]">{lead.email}</p>}
                    </td>

                    {/* WhatsApp */}
                    <td className="px-4 py-3">
                      {lead.whatsapp_number
                        ? <WaButton phone={lead.whatsapp_number} name={lead.contact_name} />
                        : <span className="flex items-center gap-1 text-xs text-muted-foreground/40 italic"><Phone size={11} />No number</span>
                      }
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>

                    {/* Follow-up */}
                    <td className="px-4 py-3">
                      {lead.next_followup_date ? (
                        <span className={`text-xs font-semibold ${overdue ? "text-red-400" : duetoday ? "text-amber-400" : "text-muted-foreground"}`}>
                          {overdue && "⚠ "}
                          {duetoday && "📅 "}
                          {lead.next_followup_date}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40 italic">Not set</span>
                      )}
                    </td>

                    {/* Last activity */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{lastActivityAgo(lead.updated_at)}</span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={e => { e.stopPropagation(); setTrialLead(lead); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sidebar-border text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors whitespace-nowrap"
                        >
                          <Zap size={11} className="text-primary" />
                          Trial
                        </button>
                        <Link href={`/sales/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sidebar-border text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                        >
                          View <ChevronRight size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <Filter size={28} className="text-muted-foreground/25 mb-3" />
            <p className="text-sm text-muted-foreground font-semibold">No leads match this filter</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting the status or clearing the search</p>
          </div>
        )}
      </div>

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
      {trialLead && <CreateTrialModal lead={trialLead} onClose={() => setTrialLead(null)} />}
    </div>
  );
}
