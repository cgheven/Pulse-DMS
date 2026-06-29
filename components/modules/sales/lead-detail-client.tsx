"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, Mail, MapPin, MessageCircle, ArrowLeft,
  CalendarCheck, ChevronDown, Loader2, Plus, FileText,
  Clock,
} from "lucide-react";
import {
  addActivity, updateLeadStatus, updateFollowUpDate, updateLeadNotes,
  type Lead, type LeadActivity, type LeadStatus,
} from "@/app/actions/sales-rep";

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE: { key: LeadStatus; label: string; emoji: string }[] = [
  { key: "new",              label: "New",            emoji: "🟢" },
  { key: "contacted",        label: "Contacted",      emoji: "📞" },
  { key: "demo_given",       label: "Demo",           emoji: "🖥" },
  { key: "follow_up",        label: "Follow-up",      emoji: "💬" },
  { key: "negotiating",      label: "Negotiating",    emoji: "🤝" },
  { key: "payment_pending",  label: "Pymt. Pending",  emoji: "⏳" },
  { key: "payment_received", label: "Pymt. Received", emoji: "💰" },
  { key: "onboarding",       label: "Onboarding",     emoji: "🚀" },
  { key: "active",           label: "Active",         emoji: "✅" },
  { key: "lost",             label: "Lost",           emoji: "❌" },
];

const STATUS_COLORS: Record<LeadStatus, string> = {
  new:              "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  contacted:        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  demo_given:       "bg-violet-500/15 text-violet-400 border-violet-500/30",
  follow_up:        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  negotiating:      "bg-orange-500/15 text-orange-400 border-orange-500/30",
  payment_pending:  "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  payment_received: "bg-green-500/15 text-green-400 border-green-500/30",
  onboarding:       "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  active:           "bg-teal-500/15 text-teal-400 border-teal-500/30",
  lost:             "bg-red-500/15 text-red-400 border-red-500/30",
};

const ACTIVITY_ICONS: Record<string, string> = {
  call: "📞", whatsapp: "💬", email: "✉️", meeting: "🤝",
  demo: "🖥", follow_up: "📅", payment_received: "💰", note: "📝",
  trial_account_created: "🚀",
};

const ACTIVITY_COLORS: Record<string, string> = {
  call:                   "border-blue-500/30 bg-blue-500/10",
  whatsapp:               "border-[#25D366]/30 bg-[#25D366]/10",
  email:                  "border-violet-500/30 bg-violet-500/10",
  meeting:                "border-orange-500/30 bg-orange-500/10",
  demo:                   "border-cyan-500/30 bg-cyan-500/10",
  follow_up:              "border-amber-500/30 bg-amber-500/10",
  payment_received:       "border-green-500/30 bg-green-500/10",
  note:                   "border-sidebar-border bg-sidebar/50",
  trial_account_created:  "border-primary/30 bg-primary/10",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Pipeline progress bar ─────────────────────────────────────────────────────

function PipelineBar({ current }: { current: LeadStatus }) {
  const active = PIPELINE.filter(p => p.key !== "lost");
  const currentIdx = active.findIndex(p => p.key === current);
  const isLost = current === "lost";

  if (isLost) {
    return (
      <div className="shrink-0 border-b border-sidebar-border bg-red-500/5 px-4 py-2.5">
        <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
          <span>❌</span> This lead was marked as lost
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-sidebar-border bg-sidebar/40 overflow-x-auto">
      <div className="flex items-center px-3 py-2.5 min-w-max">
        {active.map((stage, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={stage.key} className="flex items-center">
              <div className={`flex flex-col items-center gap-0.5 px-2 transition-opacity ${isCurrent ? "opacity-100" : isDone ? "opacity-75" : "opacity-30"}`}>
                <span className="text-sm leading-none">{stage.emoji}</span>
                <span className={`text-[9px] font-bold leading-tight whitespace-nowrap mt-0.5 ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                  {stage.label}
                </span>
                <div className={`w-1 h-1 rounded-full mt-0.5 ${isCurrent ? "bg-primary" : "bg-transparent"}`} />
              </div>
              {i < active.length - 1 && (
                <div className={`w-4 h-px ${isDone ? "bg-primary/40" : "bg-sidebar-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status dropdown ───────────────────────────────────────────────────────────

function StatusDropdown({ current, onChange, disabled }: {
  current: LeadStatus;
  onChange: (s: LeadStatus, extra?: { lost_reason?: string; payment_amount?: number; payment_method?: string; plan_type?: string }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<LeadStatus | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [paymentAmt, setPaymentAmt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [planType, setPlanType] = useState("monthly");

  function select(key: LeadStatus) {
    if (key === "lost") { setPendingStatus("lost"); setOpen(false); return; }
    if (key === "payment_received") { setPendingStatus("payment_received"); setOpen(false); return; }
    setOpen(false);
    onChange(key);
  }

  const stage = PIPELINE.find(p => p.key === current);

  return (
    <>
      <div className="relative shrink-0">
        <button
          onClick={() => !disabled && setOpen(v => !v)}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold text-xs transition-all ${STATUS_COLORS[current]} hover:opacity-80 disabled:opacity-50`}
        >
          {disabled ? <Loader2 size={12} className="animate-spin" /> : <span>{stage?.emoji}</span>}
          {stage?.label}
          <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute top-full mt-1 right-0 z-40 bg-card border border-sidebar-border rounded-xl shadow-2xl overflow-hidden min-w-[180px]">
              {PIPELINE.map(({ key, label, emoji }) => (
                <button key={key} onClick={() => select(key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/5 text-left transition-colors ${current === key ? "text-primary font-bold" : "text-foreground"}`}
                >
                  <span>{emoji}</span>{label}
                  {current === key && <span className="ml-auto text-[10px] text-primary/60">current</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {pendingStatus === "lost" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-base font-bold text-foreground mb-3">❌ Mark as Lost</h3>
            <textarea value={lostReason} onChange={e => setLostReason(e.target.value)} rows={3}
              placeholder="e.g. Budget nahi hai, already dusra system…"
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setPendingStatus(null); setLostReason(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-white/5">Cancel</button>
              <button onClick={() => { onChange("lost", { lost_reason: lostReason }); setPendingStatus(null); setLostReason(""); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600">Mark Lost</button>
            </div>
          </div>
        </div>
      )}

      {pendingStatus === "payment_received" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-base font-bold text-foreground mb-4">💰 Payment Received</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Amount (PKR)</label>
                <input type="number" value={paymentAmt} onChange={e => setPaymentAmt(e.target.value)} placeholder="e.g. 12000"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">Select…</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Plan Type</label>
                <div className="flex gap-2">
                  {[{ value: "monthly", label: "Monthly" }, { value: "annual", label: "Annual" }].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPlanType(opt.value)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                        planType === opt.value
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "border-sidebar-border text-muted-foreground hover:bg-white/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setPendingStatus(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-white/5">Cancel</button>
              <button onClick={() => { onChange("payment_received", { payment_amount: paymentAmt ? Number(paymentAmt) : undefined, payment_method: paymentMethod || undefined, plan_type: planType }); setPendingStatus(null); setPaymentAmt(""); setPaymentMethod(""); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Log Activity Modal ────────────────────────────────────────────────────────

function LogActivityModal({ leadId, onClose, onLogged }: {
  leadId: string; onClose: () => void; onLogged: (a: LeadActivity) => void;
}) {
  const [type, setType] = useState("call");
  const [note, setNote] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addActivity({ lead_id: leadId, activity_type: type, note: note || undefined, scheduled_at: scheduled || undefined });
      if (res.error) { setError(res.error); return; }
      onLogged({ id: Math.random().toString(36).slice(2), lead_id: leadId, activity_type: type, note: note || null, scheduled_at: scheduled || null, created_at: new Date().toISOString(), actor_id: null });
      onClose();
    });
  }

  const TYPES = ["call", "whatsapp", "email", "meeting", "demo", "follow_up", "payment_received", "note"];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-sidebar-border">
          <h3 className="text-base font-bold text-foreground">Log Activity</h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-4 gap-1.5">
            {TYPES.map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] font-semibold transition-all ${type === t ? "border-primary/50 bg-primary/10 text-primary scale-105" : "border-sidebar-border bg-sidebar text-muted-foreground hover:text-foreground"}`}
              >
                <span className="text-base">{ACTIVITY_ICONS[t]}</span>
                <span className="capitalize leading-tight text-center">{t.replace(/_/g, " ")}</span>
              </button>
            ))}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Notes about this activity…"
            className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
          {(type === "follow_up" || type === "meeting" || type === "demo") && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Scheduled At</label>
              <input type="datetime-local" value={scheduled} onChange={e => setScheduled(e.target.value)}
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-sidebar-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-white/5">Cancel</button>
          <button onClick={submit} disabled={pending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
            {pending && <Loader2 size={13} className="animate-spin" />}
            Log
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Activity card ─────────────────────────────────────────────────────────────

function ActivityCard({ act }: { act: LeadActivity }) {
  const colorCls = ACTIVITY_COLORS[act.activity_type] ?? ACTIVITY_COLORS.note;
  return (
    <div className={`flex gap-3 rounded-xl border p-3 ${colorCls}`}>
      <span className="text-lg shrink-0 leading-none mt-0.5">{ACTIVITY_ICONS[act.activity_type] ?? "📝"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-xs font-bold text-foreground capitalize">
            {act.activity_type.replace(/_/g, " ")}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(act.created_at)}</span>
        </div>
        {act.note && <p className="text-xs text-muted-foreground leading-relaxed">{act.note}</p>}
        {act.scheduled_at && (
          <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
            <CalendarCheck size={10} />
            {new Date(act.scheduled_at).toLocaleString("en-PK")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LeadDetailClient({
  lead: initialLead,
  activities: initialActivities,
}: {
  lead: Lead;
  activities: LeadActivity[];
}) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [activities, setActivities] = useState(initialActivities);
  const [showLog, setShowLog] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [followUpDate, setFollowUpDate] = useState(lead.next_followup_date ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStatusChange(
    status: LeadStatus,
    extra?: { lost_reason?: string; payment_amount?: number; payment_method?: string; plan_type?: string },
  ) {
    startTransition(async () => {
      setError(null);
      const res = await updateLeadStatus(lead.id, status, extra);
      if (res.error) { setError(res.error); return; }
      setLead(l => ({ ...l, status, ...(extra ?? {}) }));
    });
  }

  function handleFollowUp(date: string) {
    setFollowUpDate(date);
    startTransition(async () => {
      await updateFollowUpDate(lead.id, date || null);
      setLead(l => ({ ...l, next_followup_date: date || null }));
    });
  }

  function saveNotes() {
    startTransition(async () => {
      const res = await updateLeadNotes(lead.id, notes);
      if (res.error) { setError(res.error); return; }
      setLead(l => ({ ...l, notes: notes || null }));
      setEditingNotes(false);
    });
  }

  const safePhone = lead.whatsapp_number?.replace(/[^0-9+\-() ]/g, "") ?? null;
  const waUrl = safePhone
    ? `https://wa.me/${safePhone.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(`Assalam-o-Alaikum! ${lead.contact_name ? lead.contact_name + "," : ""} Pulse DMS ke baare mein baat karni thi.`)}`
    : null;

  return (
    <>
      <div className="flex flex-col h-full">

        {/* ── Header ── */}
        <div className="shrink-0 px-4 py-2.5 border-b border-sidebar-border bg-background flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft size={13} />
            <span>Back</span>
          </button>
          <div className="w-px h-4 bg-sidebar-border shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black text-foreground leading-tight truncate">{lead.business_name}</h1>
            {lead.city && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 leading-tight">
                <MapPin size={9} />{lead.city}
              </p>
            )}
          </div>
          {error && <p className="text-[10px] text-red-400 shrink-0 max-w-[100px] truncate">{error}</p>}
          <StatusDropdown current={lead.status} onChange={handleStatusChange} disabled={pending} />
        </div>

        {/* ── Pipeline (scrollable on mobile) ── */}
        <PipelineBar current={lead.status} />

        {/* ── Body: stacks vertically on mobile, side-by-side on desktop ── */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:overflow-hidden overflow-y-auto">

          {/* LEFT info panel */}
          <div className="w-full lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0 border-b border-sidebar-border lg:overflow-y-auto">

            {/* Contact */}
            <div className="p-4 border-b border-sidebar-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Contact</p>
              {lead.contact_name && (
                <p className="text-sm font-bold text-foreground mb-2.5">{lead.contact_name}</p>
              )}

              {/* Call + WhatsApp buttons */}
              {(safePhone || waUrl) && (
                <div className="flex gap-2 mb-3">
                  {safePhone && (
                    <a href={`tel:${safePhone}`}
                      className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl border border-sidebar-border bg-sidebar text-xs font-bold text-foreground hover:bg-white/5 transition-colors">
                      <Phone size={13} />Call
                    </a>
                  )}
                  {waUrl && (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold transition-colors">
                      <MessageCircle size={13} />WhatsApp
                    </a>
                  )}
                </div>
              )}

              <div className="space-y-2 mt-1">
                {safePhone && (
                  <a href={`tel:${safePhone}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-500/8 border border-blue-500/20 hover:bg-blue-500/15 transition-colors group">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                      <Phone size={13} className="text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-blue-400/70 font-semibold leading-none mb-0.5">Mobile</p>
                      <p className="text-sm font-semibold text-foreground truncate">{safePhone}</p>
                    </div>
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-violet-500/8 border border-violet-500/20 hover:bg-violet-500/15 transition-colors group">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                      <Mail size={13} className="text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-violet-400/70 font-semibold leading-none mb-0.5">Email</p>
                      <p className="text-sm font-semibold text-foreground truncate">{lead.email}</p>
                    </div>
                  </a>
                )}
                {lead.source && (
                  <p className="text-[11px] text-muted-foreground/50 capitalize px-1">{lead.source.replace(/_/g, " ")}</p>
                )}
              </div>
            </div>

            {/* Follow-up */}
            <div className="p-4 border-b border-sidebar-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                <CalendarCheck size={10} />Follow-up
              </p>
              <label className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 hover:bg-amber-500/15 transition-colors cursor-pointer">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                  <CalendarCheck size={13} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-amber-400/70 font-semibold leading-none mb-0.5">Scheduled</p>
                  <p className="text-sm font-semibold text-foreground">
                    {followUpDate
                      ? new Date(followUpDate + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
                      : <span className="text-muted-foreground/50 font-normal">Not set</span>
                    }
                  </p>
                </div>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={e => handleFollowUp(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
              </label>
            </div>

            {/* Payment */}
            {(lead.payment_amount || lead.payment_method) && (
              <div className="p-4 border-b border-sidebar-border/60 bg-green-500/5">
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1.5">💰 Payment</p>
                {lead.payment_amount && (
                  <p className="text-lg font-black text-green-400">PKR {lead.payment_amount.toLocaleString()}</p>
                )}
                {lead.payment_method && (
                  <p className="text-xs text-green-400/70 capitalize mt-0.5">{lead.payment_method.replace("_", " ")}</p>
                )}
              </div>
            )}

            {/* Lost reason */}
            {lead.status === "lost" && lead.lost_reason && (
              <div className="p-4 border-b border-sidebar-border/60 bg-red-500/5">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1.5">❌ Lost Reason</p>
                <p className="text-xs text-red-300 leading-relaxed">{lead.lost_reason}</p>
              </div>
            )}

            {/* Notes */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <FileText size={10} />Notes
                </p>
                {!editingNotes && (
                  <button onClick={() => setEditingNotes(true)} className="text-[11px] text-primary hover:text-primary/80">Edit</button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-sidebar-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                    placeholder="Add notes…"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingNotes(false); setNotes(lead.notes ?? ""); }}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-white/5 border border-sidebar-border"
                    >Cancel</button>
                    <button
                      onClick={saveNotes}
                      disabled={pending}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {pending && <Loader2 size={11} className="animate-spin" />}Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {lead.notes || <span className="italic opacity-50">No notes yet</span>}
                </p>
              )}
            </div>
          </div>

          {/* RIGHT: Activity Timeline */}
          <div className="flex flex-col flex-1 lg:min-w-0 lg:overflow-hidden">

            {/* Timeline header */}
            <div className="shrink-0 px-4 py-3 border-b border-sidebar-border bg-sidebar/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Activity</span>
                <span className="text-[10px] bg-sidebar border border-sidebar-border rounded-full px-2 py-0.5 text-muted-foreground/70">
                  {activities.length}
                </span>
              </div>
              <button
                onClick={() => setShowLog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
              >
                <Plus size={12} />Log Activity
              </button>
            </div>

            {/* Feed — natural flow on mobile, scrollable on desktop */}
            <div className="lg:flex-1 lg:overflow-y-auto px-4 py-3 space-y-2">
              {activities.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-xl bg-sidebar border border-sidebar-border flex items-center justify-center mx-auto mb-2.5">
                    <Clock size={18} className="text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">No activities yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Log a call or note to start tracking</p>
                  <button
                    onClick={() => setShowLog(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/20"
                  >
                    <Plus size={12} />Log First Activity
                  </button>
                </div>
              ) : (
                activities.map(act => <ActivityCard key={act.id} act={act} />)
              )}
            </div>
          </div>
        </div>
      </div>

      {showLog && (
        <LogActivityModal
          leadId={lead.id}
          onClose={() => setShowLog(false)}
          onLogged={a => setActivities(prev => [a, ...prev])}
        />
      )}
    </>
  );
}
