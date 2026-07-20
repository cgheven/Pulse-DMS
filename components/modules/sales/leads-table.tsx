"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Eye, Pencil, Trash2, Calendar, AlertCircle, Inbox } from "lucide-react";
import {
  LEAD_STATUS_CONFIG, LEAD_STATUS_ORDER, followUpUrgency, parseDateOnly, type LeadStatus,
} from "@/lib/lead-status";
import { LEAD_PRIORITY_CONFIG, LEAD_PRIORITY_ORDER, type LeadPriority } from "@/lib/lead-priority";
import type { Lead } from "@/app/actions/sales-rep";

export type LeadRow = Lead & { rep_name?: string | null };

type SaveResult = { error?: string };

export type LeadsTableProps = {
  leads: LeadRow[];
  onView: (lead: LeadRow) => void;
  /** Header shown above the table, e.g. "Leads". Count is appended automatically. */
  title?: string;
  description?: string;
  /** Omit the mutation handlers to render a read-only table (manager views). */
  onStatusChange?: (leadId: string, status: LeadStatus) => Promise<SaveResult>;
  onPriorityChange?: (leadId: string, priority: LeadPriority) => Promise<SaveResult>;
  onEdit?: (lead: LeadRow) => void;
  onDelete?: (lead: LeadRow) => void;
  /**
   * Statuses that must collect extra data before saving (converted needs the
   * payment amount/plan, rejected needs a reason). These are handed to
   * onStatusNeedsConfirm instead of being written straight through.
   */
  confirmStatuses?: readonly LeadStatus[];
  onStatusNeedsConfirm?: (lead: LeadRow, next: LeadStatus) => void;
  /** Show a "Rep" column — used by manager-facing tables. */
  showRep?: boolean;
  emptyMessage?: string;
};

function fmtDate(iso: string): string {
  try { return format(new Date(iso), "d MMM yyyy"); } catch { return iso.slice(0, 10); }
}

// Native <select> styled as a coloured badge — matches the HMS inline editors:
// one tap on mobile, no popover, inherits the same token as the static badge.
function InlineSelect<T extends string>({
  value, options, config, onChange, disabled,
}: {
  value: T;
  options: readonly T[];
  config: Record<T, { label: string; cls: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value as T)}
      className={`appearance-none rounded-md border px-2.5 py-1.5 min-w-[92px] text-xs font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60 disabled:cursor-wait ${config[value].cls}`}
    >
      {options.map(o => (
        <option key={o} value={o} className="bg-card text-foreground font-medium">
          {config[o].label}
        </option>
      ))}
    </select>
  );
}

function StaticBadge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-block rounded-md border px-2 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}

function FollowUpCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-muted-foreground">—</span>;
  const urgency = followUpUrgency(date);
  const cls =
    urgency === "overdue" ? "text-rose-400" :
    urgency === "today"   ? "text-amber-400" :
    "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${cls}`}>
      {urgency === "overdue" ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
      {format(parseDateOnly(date), "d MMM yyyy")}
      {urgency === "today" && " (today)"}
      {urgency === "overdue" && " (overdue)"}
    </span>
  );
}

export default function LeadsTable({
  leads, onView, title = "Leads", description,
  onStatusChange, onPriorityChange, onEdit, onDelete,
  confirmStatuses, onStatusNeedsConfirm,
  showRep = false, emptyMessage = "No leads found",
}: LeadsTableProps) {
  const [pending, startTransition] = useTransition();
  // Optimistic overrides, keyed by lead id — cleared once the server confirms.
  const [draft, setDraft] = useState<Record<string, Partial<LeadRow>>>({});

  function applyOptimistic(leadId: string, patch: Partial<LeadRow>, save: () => Promise<SaveResult>) {
    setDraft(d => ({ ...d, [leadId]: { ...d[leadId], ...patch } }));
    startTransition(async () => {
      const res = await save();
      if (res.error) {
        setDraft(d => { const next = { ...d }; delete next[leadId]; return next; });
        alert(res.error);
      }
    });
  }

  const colCount = 6 + (showRep ? 1 : 0);

  return (
    <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
      {/* Card header — "Leads (N)" + optional description, like HMS */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        <h2 className="text-base font-bold text-foreground">{title} ({leads.length})</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sidebar-border bg-sidebar/40">
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5">Business</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5 hidden sm:table-cell">Contact</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5 hidden md:table-cell">City</th>
                {showRep && <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5 hidden md:table-cell">Rep</th>}
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5">Status</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5 hidden sm:table-cell">Priority</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5 hidden lg:table-cell">Follow-up</th>
                <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5 hidden lg:table-cell">Date</th>
                <th className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sidebar-border/60">
              {leads.map(base => {
                const lead = { ...base, ...draft[base.id] } as LeadRow;
                const overdue = followUpUrgency(lead.next_followup_date) === "overdue";
                return (
                  <tr key={lead.id} className={`group transition-colors hover:bg-sidebar/40 ${overdue ? "bg-rose-500/[0.04]" : ""}`}>
                    {/* Business + contact name */}
                    <td className="px-5 py-4">
                      <button onClick={() => onView(lead)} className="text-left block">
                        <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate max-w-[180px]">
                          {lead.business_name}
                        </p>
                        {lead.contact_name && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{lead.contact_name}</p>}
                      </button>
                    </td>

                    {/* Contact — phone + email */}
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <p className="text-sm text-foreground">{lead.whatsapp_number || "—"}</p>
                      {lead.email && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{lead.email}</p>}
                    </td>

                    {/* City */}
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-sm text-foreground">{lead.city ?? "—"}</p>
                    </td>

                    {showRep && (
                      <td className="px-5 py-4 hidden md:table-cell text-sm text-foreground">{lead.rep_name ?? "—"}</td>
                    )}

                    {/* Status */}
                    <td className="px-5 py-4">
                      {onStatusChange ? (
                        <InlineSelect<LeadStatus>
                          value={lead.status}
                          options={LEAD_STATUS_ORDER}
                          config={LEAD_STATUS_CONFIG}
                          disabled={pending}
                          onChange={next => {
                            if (confirmStatuses?.includes(next) && onStatusNeedsConfirm) {
                              onStatusNeedsConfirm(lead, next);
                              return;
                            }
                            applyOptimistic(lead.id, { status: next }, () => onStatusChange(lead.id, next));
                          }}
                        />
                      ) : (
                        <StaticBadge {...LEAD_STATUS_CONFIG[lead.status]} />
                      )}
                    </td>

                    {/* Priority */}
                    <td className="px-5 py-4 hidden sm:table-cell">
                      {onPriorityChange ? (
                        <InlineSelect<LeadPriority>
                          value={lead.priority}
                          options={LEAD_PRIORITY_ORDER}
                          config={LEAD_PRIORITY_CONFIG}
                          disabled={pending}
                          onChange={next => applyOptimistic(lead.id, { priority: next }, () => onPriorityChange(lead.id, next))}
                        />
                      ) : (
                        <StaticBadge {...LEAD_PRIORITY_CONFIG[lead.priority]} />
                      )}
                    </td>

                    {/* Follow-up */}
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <FollowUpCell date={lead.next_followup_date} />
                    </td>

                    {/* Added date */}
                    <td className="px-5 py-4 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(lead.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onView(lead)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-primary hover:bg-white/5 transition-colors"
                        >
                          <Eye size={13} /><span className="hidden sm:inline">View</span>
                        </button>
                        {onEdit && (
                          <button onClick={() => onEdit(lead)} title="Edit"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-white/5 transition-colors">
                            <Pencil size={13} />
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={() => onDelete(lead)} title="Delete"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="sr-only">{colCount} columns</div>
        </div>
      )}
    </div>
  );
}
