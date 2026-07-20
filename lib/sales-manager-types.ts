import type { Lead, LeadActivity, MemberGoals } from "@/app/actions/sales-rep";

// Kept out of app/actions/sales-manager.ts deliberately: that file has a
// "use server" directive, and Next's server-actions transform (Turbopack, at
// least) does not reliably erase type-only exports there — it can emit a
// broken action-id export for a re-exported type and break the build/dev
// server. Types used by the manager portal's client components live here instead.

export type TeamMemberEarnings = {
  member_id: string;
  user_id: string;
  full_name: string | null;
  goals: MemberGoals;
  /** Total leads currently assigned to this rep (all time, any status). */
  leads_assigned: number;
  deals_closed: number;
  revenue_this_month: number;
  commission_earned: number;
};

export type RepDetailForManager = {
  repName: string | null;
  goals: MemberGoals;
  leads: Lead[];
  activitiesByLead: Record<string, LeadActivity[]>;
};

export type LeadDetailForManager = {
  lead: Lead;
  activities: LeadActivity[];
  repName: string | null;
};
