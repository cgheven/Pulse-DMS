import { isPast, isToday, startOfDay } from "date-fns";

// Single source of truth for the lead pipeline. Every table, badge, filter pill
// and dropdown imports from here — status metadata used to be copy-pasted across
// seven components, three of them as loosely-typed Record<string, string> maps
// that silently rendered an unstyled badge when a status didn't match. Keeping
// the config in one exhaustive Record<LeadStatus, ...> turns that class of bug
// into a compile error instead.
//
// Mirrors the dms_lead_status enum (see 2026-07-21-lead-status-simplify.sql).
export type LeadStatus =
  | "new"
  | "contacted"
  | "follow_up"
  | "demo_scheduled"
  | "demo_done"
  | "onboarding"
  | "converted"
  | "rejected";

export const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; cls: string }> = {
  new:            { label: "New",            cls: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
  contacted:      { label: "Contacted",      cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" },
  follow_up:      { label: "Follow-up",      cls: "bg-orange-500/10 text-orange-400 border-orange-500/25" },
  demo_scheduled: { label: "Demo Scheduled", cls: "bg-purple-500/10 text-purple-400 border-purple-500/25" },
  demo_done:      { label: "Demo Done",      cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25" },
  onboarding:     { label: "Onboarding",     cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/25" },
  converted:      { label: "Converted",      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  rejected:       { label: "Rejected",       cls: "bg-rose-500/10 text-rose-400 border-rose-500/25" },
};

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new", "contacted", "follow_up", "demo_scheduled",
  "demo_done", "onboarding", "converted", "rejected",
];

// Terminal stages — excluded from "open pipeline" counts and from follow-up
// reminders, and used by the commission query to identify a closed deal.
export const LEAD_STATUS_CLOSED: LeadStatus = "converted";
export const LEAD_STATUS_REJECTED: LeadStatus = "rejected";

export function isTerminalStatus(status: LeadStatus): boolean {
  return status === LEAD_STATUS_CLOSED || status === LEAD_STATUS_REJECTED;
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUS_ORDER as string[]).includes(value);
}

// next_followup_date is a DATE column ("YYYY-MM-DD"). Parse as local calendar
// midnight — `new Date("2026-07-21")` is UTC midnight per spec, which shifts the
// effective day for any browser west of UTC.
export function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function followUpUrgency(
  dateStr: string | null
): "overdue" | "today" | "future" | null {
  if (!dateStr) return null;
  const d = startOfDay(parseDateOnly(dateStr));
  if (isToday(d)) return "today";
  if (isPast(d)) return "overdue";
  return "future";
}
