// Mirrors the dms_leads.priority CHECK constraint
// (see 2026-07-21-lead-status-simplify.sql).
export type LeadPriority = "low" | "medium" | "high";

export const LEAD_PRIORITY_CONFIG: Record<LeadPriority, { label: string; cls: string }> = {
  high:   { label: "High",   cls: "bg-rose-500/10 text-rose-400 border-rose-500/25" },
  medium: { label: "Medium", cls: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  low:    { label: "Low",    cls: "bg-white/5 text-muted-foreground border-sidebar-border" },
};

export const LEAD_PRIORITY_ORDER: LeadPriority[] = ["high", "medium", "low"];

export function isLeadPriority(value: string): value is LeadPriority {
  return (LEAD_PRIORITY_ORDER as string[]).includes(value);
}
