"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  X, Phone, Mail, MessageCircle, Loader2, Flag, Send, Trash2,
  Monitor, Calendar, DollarSign, StickyNote, Handshake, User,
} from "lucide-react";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_ORDER, type LeadStatus } from "@/lib/lead-status";
import { LEAD_PRIORITY_CONFIG, LEAD_PRIORITY_ORDER, type LeadPriority } from "@/lib/lead-priority";
import type { Lead, LeadActivity } from "@/app/actions/sales-rep";

// Colored lucide icons per activity type — the tinted rounded badges that give
// the timeline its life (matching the HMS view box), instead of flat emoji.
const ACTIVITY_META: Record<string, { Icon: LucideIcon; cls: string }> = {
  call:             { Icon: Phone,         cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  whatsapp:         { Icon: MessageCircle, cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  email:            { Icon: Mail,          cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  meeting:          { Icon: Handshake,     cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  demo:             { Icon: Monitor,       cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  follow_up:        { Icon: Calendar,      cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  payment_received: { Icon: DollarSign,    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  note:            { Icon: StickyNote,     cls: "bg-slate-500/10 text-slate-300 border-slate-500/20" },
};
function activityMeta(type: string) {
  return ACTIVITY_META[type] ?? ACTIVITY_META.note;
}
const ACTIVITY_TYPES = ["call", "whatsapp", "email", "meeting", "demo", "follow_up", "note"];

// Hide the auto-generated "Lead created" system note — the timeline is for real
// touchpoints, not lifecycle bookkeeping. New leads no longer log it; this also
// suppresses it for leads created before that change.
function visibleActivities(list: LeadActivity[]): LeadActivity[] {
  return list.filter(
    a => !(a.activity_type === "note" && a.note?.trim().toLowerCase() === "lead created")
  );
}

type SaveResult = { error?: string };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-[15px] font-medium text-foreground mt-0.5 break-words">{value}</p>
    </div>
  );
}

// Full lead panel matching the HMS view box: header badges, a two-column info
// grid, editable Pipeline Stage / Priority dropdowns, an activity timeline, a
// Log Activity section and a footer with Delete + Close. Every mutating control
// is optional — the manager's read-only view simply passes no handlers.
export default function LeadViewDialog({
  lead,
  loadActivities,
  onLogActivity,
  onFollowUpChange,
  onStatusChange,
  onPriorityChange,
  confirmStatuses,
  onStatusNeedsConfirm,
  onDelete,
  onClose,
}: {
  lead: Lead & { rep_name?: string | null };
  loadActivities: (leadId: string) => Promise<{ activities: LeadActivity[]; error?: string }>;
  onLogActivity?: (leadId: string, type: string, note: string) => Promise<SaveResult>;
  onFollowUpChange?: (leadId: string, date: string | null) => Promise<SaveResult>;
  onStatusChange?: (leadId: string, status: LeadStatus) => Promise<SaveResult>;
  onPriorityChange?: (leadId: string, priority: LeadPriority) => Promise<SaveResult>;
  confirmStatuses?: readonly LeadStatus[];
  onStatusNeedsConfirm?: (lead: Lead, next: LeadStatus) => void;
  onDelete?: (lead: Lead) => void;
  onClose: () => void;
}) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [priority, setPriority] = useState<LeadPriority>(lead.priority);
  const [followUp, setFollowUp] = useState(lead.next_followup_date ?? "");
  const [logType, setLogType] = useState("call");
  const [logNote, setLogNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadActivities(lead.id).then(res => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setActivities(visibleActivities(res.activities));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [lead.id, loadActivities]);

  function changeStatus(next: LeadStatus) {
    if (confirmStatuses?.includes(next) && onStatusNeedsConfirm) {
      onStatusNeedsConfirm(lead, next); // parent collects payment/reason then saves
      return;
    }
    if (!onStatusChange) return;
    setStatus(next);
    startTransition(async () => {
      const res = await onStatusChange(lead.id, next);
      if (res.error) { setError(res.error); setStatus(lead.status); }
    });
  }

  function changePriority(next: LeadPriority) {
    if (!onPriorityChange) return;
    setPriority(next);
    startTransition(async () => {
      const res = await onPriorityChange(lead.id, next);
      if (res.error) { setError(res.error); setPriority(lead.priority); }
    });
  }

  function saveFollowUp(date: string) {
    setFollowUp(date);
    if (!onFollowUpChange) return;
    startTransition(async () => {
      const res = await onFollowUpChange(lead.id, date || null);
      if (res.error) setError(res.error);
    });
  }

  function submitActivity() {
    if (!onLogActivity || !logNote.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await onLogActivity(lead.id, logType, logNote.trim());
      if (res.error) { setError(res.error); return; }
      const refreshed = await loadActivities(lead.id);
      if (!refreshed.error) setActivities(visibleActivities(refreshed.activities));
      setLogNote("");
    });
  }

  const waUrl = lead.whatsapp_number
    ? `https://wa.me/${lead.whatsapp_number.replace(/\D/g, "").replace(/^0/, "92")}`
    : null;

  const selectCls = "w-full appearance-none rounded-lg border border-sidebar-border bg-sidebar px-3 py-2.5 pr-9 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";
  const editable = !!(onStatusChange || onPriorityChange);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-sidebar-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground truncate">{lead.business_name}</h2>
              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${LEAD_STATUS_CONFIG[status].cls}`}>
                {LEAD_STATUS_CONFIG[status].label}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${LEAD_PRIORITY_CONFIG[priority].cls}`}>
                <Flag size={11} />{LEAD_PRIORITY_CONFIG[priority].label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Lead details, pipeline stage, and activity history.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <p className="mx-6 mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Info grid — clean label/value pairs, no icon clutter */}
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 border-b border-sidebar-border/60">
            <Field label="Contact" value={lead.contact_name || "—"} />
            <Field label="Phone" value={lead.whatsapp_number || "—"} />
            <Field label="Email" value={lead.email || "—"} />
            <Field label="City" value={lead.city || "—"} />
            <Field label="Source" value={(lead.source ?? "—").replace(/_/g, " ")} />
            <Field label="Created" value={(() => { try { return format(new Date(lead.created_at), "d MMM yyyy"); } catch { return "—"; } })()} />
            {lead.rep_name !== undefined && (
              <Field label="Assigned Rep" value={lead.rep_name || "Unassigned"} />
            )}
          </div>

          {/* Quick contact actions */}
          {lead.whatsapp_number && (
            <div className="px-6 py-3 flex gap-2 border-b border-sidebar-border/60">
              <a href={`tel:${lead.whatsapp_number}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar text-xs font-bold text-foreground hover:bg-white/5 transition-colors">
                <Phone size={13} />Call
              </a>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold transition-colors">
                  <MessageCircle size={13} />WhatsApp
                </a>
              )}
            </div>
          )}

          {/* Pipeline Stage / Priority / Follow-up — editable when handlers present */}
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-sidebar-border/60">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Pipeline Stage</label>
              {onStatusChange ? (
                <div className="relative">
                  <select value={status} onChange={e => changeStatus(e.target.value as LeadStatus)} disabled={pending} className={selectCls}>
                    {LEAD_STATUS_ORDER.map(s => <option key={s} value={s}>{LEAD_STATUS_CONFIG[s].label}</option>)}
                  </select>
                  <ChevronDownIcon />
                </div>
              ) : (
                <span className={`inline-block rounded-md border px-2 py-1 text-xs font-semibold ${LEAD_STATUS_CONFIG[status].cls}`}>{LEAD_STATUS_CONFIG[status].label}</span>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Priority</label>
              {onPriorityChange ? (
                <div className="relative">
                  <select value={priority} onChange={e => changePriority(e.target.value as LeadPriority)} disabled={pending} className={selectCls}>
                    {LEAD_PRIORITY_ORDER.map(p => <option key={p} value={p}>{LEAD_PRIORITY_CONFIG[p].label}</option>)}
                  </select>
                  <ChevronDownIcon />
                </div>
              ) : (
                <span className={`inline-block rounded-md border px-2 py-1 text-xs font-semibold ${LEAD_PRIORITY_CONFIG[priority].cls}`}>{LEAD_PRIORITY_CONFIG[priority].label}</span>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Follow-up</label>
              {onFollowUpChange ? (
                <input type="date" value={followUp} onChange={e => saveFollowUp(e.target.value)}
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
              ) : (
                <p className="text-sm text-foreground py-2.5">{followUp || "Not set"}</p>
              )}
            </div>
          </div>

          {/* Payment / rejection detail */}
          {(lead.payment_amount || lead.lost_reason) && (
            <div className="px-6 py-4 border-b border-sidebar-border/60 space-y-2">
              {lead.payment_amount != null && (
                <div className="rounded-lg border border-green-500/25 bg-green-500/5 px-3 py-2">
                  <p className="text-[10px] font-bold text-green-400 uppercase tracking-wide">Payment</p>
                  <p className="text-lg font-black text-green-400">PKR {lead.payment_amount.toLocaleString()}</p>
                  <p className="text-xs text-green-400/70 capitalize">
                    {(lead.payment_method ?? "").replace(/_/g, " ")}{lead.plan_type ? ` · ${lead.plan_type}` : ""}
                  </p>
                </div>
              )}
              {lead.lost_reason && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Rejected Reason</p>
                  <p className="text-xs text-red-300">{lead.lost_reason}</p>
                </div>
              )}
            </div>
          )}

          {lead.notes && (
            <div className="px-6 py-4 border-b border-sidebar-border/60">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="px-6 py-5">
            <p className="text-sm font-semibold text-foreground mb-3">Activity Timeline</p>

            {loading ? (
              <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 size={13} className="animate-spin" />Loading activity…
              </div>
            ) : activities.length === 0 ? (
              <p className="py-4 text-xs text-muted-foreground/60 italic">No activity recorded yet</p>
            ) : (
              <ul className="space-y-2.5">
                {activities.map(act => {
                  const { Icon, cls } = activityMeta(act.activity_type);
                  return (
                    <li key={act.id} className="flex gap-3 rounded-xl border border-sidebar-border bg-sidebar/40 px-4 py-3">
                      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${cls}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground capitalize">{act.activity_type.replace(/_/g, " ")}</p>
                        {act.note && <p className="text-sm text-muted-foreground mt-0.5">{act.note}</p>}
                        <p className="text-[11px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                          <User size={10} />
                          {(() => { try { return format(new Date(act.created_at), "d MMM yyyy, h:mm a"); } catch { return ""; } })()}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Log Activity */}
            {onLogActivity && (
              <div className="mt-4 rounded-xl border border-sidebar-border bg-sidebar/40 p-4">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Log Activity</p>
                <div className="relative mb-2.5">
                  <select value={logType} onChange={e => setLogType(e.target.value)} className={selectCls}>
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</option>)}
                  </select>
                  <ChevronDownIcon />
                </div>
                <textarea value={logNote} onChange={e => setLogNote(e.target.value)} rows={2}
                  placeholder="Notes about this activity…"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none mb-2.5" />
                <button onClick={submitActivity} disabled={pending || !logNote.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Log Activity
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-sidebar-border flex items-center justify-between">
          {onDelete ? (
            <button onClick={() => onDelete(lead)}
              className="flex items-center gap-1.5 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors">
              <Trash2 size={14} />Delete Lead
            </button>
          ) : <span />}
          <button onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${editable ? "border border-sidebar-border text-foreground hover:bg-white/5" : "bg-primary text-white hover:bg-primary/90"}`}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
