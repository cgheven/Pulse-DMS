"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { requireSalesManager } from "@/app/actions/sales-rep";
import type { Lead, LeadActivity } from "@/app/actions/sales-rep";
import type { SalesTeam, SalesTeamMember } from "@/app/actions/admin-sales-teams";
import { validateGoals } from "@/lib/sales-goals";
import { LEAD_STATUS_CLOSED, isTerminalStatus, isLeadStatus } from "@/lib/lead-status";
import { isLeadPriority } from "@/lib/lead-priority";
import type { TeamMemberEarnings, RepDetailForManager, LeadDetailForManager } from "@/lib/sales-manager-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Uniform "not found" error on both a missing team and an unauthorized one —
// avoids giving a caller an existence oracle for teams they don't manage.
function assertTeamAccess(teamId: string, managerTeamIds: string[], isAdmin: boolean): void {
  if (!UUID_RE.test(teamId)) throw new Error("Team not found");
  if (isAdmin) return;
  if (!managerTeamIds.includes(teamId)) throw new Error("Team not found");
}

async function resolveMemberTeamId(memberId: string): Promise<string> {
  if (!UUID_RE.test(memberId)) throw new Error("Member not found");
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("dms_sales_team_members")
    .select("team_id")
    .eq("id", memberId)
    .single();
  if (!member) throw new Error("Member not found");
  return member.team_id as string;
}

async function hydrateMembers(rows: {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  monthly_commission_pct: number | null;
  annual_commission_pct: number | null;
  monthly_deal_target: number | null;
  monthly_revenue_target: number | null;
}[]): Promise<SalesTeamMember[]> {
  const admin = createAdminClient();
  const userIds = rows.map(r => r.user_id);

  const [profilesRes, ...authResults] = await Promise.all([
    userIds.length
      ? admin.from("dms_profiles").select("id, full_name, phone").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; phone: string | null }[] }),
    ...userIds.map(id => admin.auth.admin.getUserById(id)),
  ]);

  const profileNameMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.full_name ?? null]));
  const profilePhoneMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.phone ?? null]));
  const emailMap = new Map(
    authResults.map((r, i) => [userIds[i], r.data?.user?.email ?? null])
  );

  return rows.map(m => ({
    id: m.id,
    team_id: m.team_id,
    user_id: m.user_id,
    email: emailMap.get(m.user_id) ?? null,
    full_name: profileNameMap.get(m.user_id) ?? null,
    phone: profilePhoneMap.get(m.user_id) ?? null,
    role: m.role,
    is_active: m.is_active,
    created_at: m.created_at,
    monthly_commission_pct: Number(m.monthly_commission_pct ?? 0),
    annual_commission_pct: Number(m.annual_commission_pct ?? 0),
    monthly_deal_target: Number(m.monthly_deal_target ?? 0),
    monthly_revenue_target: Number(m.monthly_revenue_target ?? 0),
  }));
}

export async function getManagedTeams(): Promise<{ teams: SalesTeam[]; error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    const admin = createAdminClient();

    let teamsQuery = admin.from("dms_sales_teams").select("*").order("created_at", { ascending: false });
    if (!isAdmin) teamsQuery = teamsQuery.in("id", managerTeamIds);
    const { data: teams, error: teamsErr } = await teamsQuery;
    if (teamsErr) throw teamsErr;

    const teamIds = (teams ?? []).map(t => t.id);
    const { data: memberRows, error: membersErr } = teamIds.length
      ? await admin.from("dms_sales_team_members").select("*").eq("is_active", true).in("team_id", teamIds)
      : { data: [], error: null };
    if (membersErr) throw membersErr;

    const hydrated = await hydrateMembers(memberRows ?? []);
    const membersByTeam = new Map<string, SalesTeamMember[]>();
    for (const m of hydrated) {
      const list = membersByTeam.get(m.team_id) ?? [];
      list.push(m);
      membersByTeam.set(m.team_id, list);
    }

    const result: SalesTeam[] = (teams ?? []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description ?? null,
      is_active: t.is_active,
      created_at: t.created_at,
      members: membersByTeam.get(t.id) ?? [],
    }));

    return { teams: result };
  } catch (err) {
    return { teams: [], error: err instanceof Error ? err.message : "Failed to load teams" };
  }
}

export async function getTeamRoster(teamId: string): Promise<{ members: SalesTeamMember[]; error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    assertTeamAccess(teamId, managerTeamIds, isAdmin);

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("dms_sales_team_members")
      .select("*")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return { members: await hydrateMembers(rows ?? []) };
  } catch (err) {
    return { members: [], error: err instanceof Error ? err.message : "Failed to load roster" };
  }
}

export async function createTeamRep(data: {
  email: string;
  password: string;
  full_name: string;
  team_id: string;
  role: string;
  phone: string;
}): Promise<{ userId?: string; phone?: string; error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    assertTeamAccess(data.team_id, managerTeamIds, isAdmin);

    if (!data.email || !data.full_name.trim()) throw new Error("Email and name are required");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!["manager", "member"].includes(data.role)) throw new Error("Invalid role");
    // Managers may only create ordinary reps — promoting someone to manager
    // stays admin-only, so a manager can't grow their own team's privileges.
    if (data.role !== "member" && !isAdmin) {
      throw new Error("Only an admin can create a manager account");
    }
    if (!data.phone || !normalizePhone(data.phone)) throw new Error("A valid Pakistani mobile number is required");

    const normalizedPhone = normalizePhone(data.phone)!;

    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name.trim() },
    });
    if (createErr) throw createErr;

    const userId = created.user.id;

    const { error: profileErr } = await admin.from("dms_profiles").upsert(
      { id: userId, full_name: data.full_name.trim(), is_sales_rep: true, phone: normalizedPhone },
      { onConflict: "id" }
    );
    if (profileErr) throw profileErr;

    const { error: memberErr } = await admin
      .from("dms_sales_team_members")
      .insert({ team_id: data.team_id, user_id: userId, role: data.role });
    if (memberErr) throw memberErr;

    return { userId, phone: normalizedPhone };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create sales rep" };
  }
}

export async function getTeamLeadsRollup(
  teamId: string,
  filters?: { status?: string; repId?: string; search?: string }
): Promise<{ leads: (Lead & { rep_name: string | null })[]; error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    assertTeamAccess(teamId, managerTeamIds, isAdmin);

    if (filters?.repId) {
      const admin = createAdminClient();
      const { data: repMember } = await admin
        .from("dms_sales_team_members")
        .select("team_id")
        .eq("user_id", filters.repId)
        .eq("team_id", teamId)
        .eq("is_active", true)
        .maybeSingle();
      if (!repMember) throw new Error("Rep not found on this team");
    }

    const admin = createAdminClient();
    let query = admin.from("dms_leads").select("*").eq("team_id", teamId).order("updated_at", { ascending: false });
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.repId) query = query.eq("assigned_to", filters.repId);

    const { data: leads, error } = await query;
    if (error) throw error;

    const repIds = Array.from(new Set((leads ?? []).map(l => l.assigned_to).filter(Boolean))) as string[];
    const { data: profiles } = repIds.length
      ? await admin.from("dms_profiles").select("id, full_name").in("id", repIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name ?? null]));

    let result = (leads ?? []).map(l => ({ ...(l as Lead), rep_name: l.assigned_to ? nameMap.get(l.assigned_to) ?? null : null }));

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(l =>
        l.business_name.toLowerCase().includes(q) ||
        l.contact_name.toLowerCase().includes(q) ||
        l.whatsapp_number.includes(q)
      );
    }

    return { leads: result };
  } catch (err) {
    return { leads: [], error: err instanceof Error ? err.message : "Failed to load team leads" };
  }
}

export async function getTeamFollowupsDueToday(
  teamId: string
): Promise<{ leads: (Lead & { rep_name: string | null })[]; error?: string }> {
  try {
    // requireSalesManager()/team access verified inside getTeamLeadsRollup()
    const { leads: all, error } = await getTeamLeadsRollup(teamId);
    if (error) throw new Error(error);

    const today = new Date().toISOString().slice(0, 10);
    const leads = all
      .filter(l => l.next_followup_date === today && !isTerminalStatus(l.status))
      .sort((a, b) => a.business_name.localeCompare(b.business_name));

    return { leads };
  } catch (err) {
    return { leads: [], error: err instanceof Error ? err.message : "Failed to load follow-ups" };
  }
}

export async function getTeamGoalsAndEarnings(
  teamId: string
): Promise<{ members: TeamMemberEarnings[]; totals: { deals_closed: number; revenue_this_month: number; commission_earned: number }; error?: string }> {
  const empty = { members: [], totals: { deals_closed: 0, revenue_this_month: 0, commission_earned: 0 } };
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    assertTeamAccess(teamId, managerTeamIds, isAdmin);

    const admin = createAdminClient();
    // Only reps (role='member') are measured here. A manager oversees the team
    // and doesn't work a lead queue, so they must NOT appear as a performance
    // card in their own team — that made the portal look like "manager = rep".
    const { data: memberRows, error: membersErr } = await admin
      .from("dms_sales_team_members")
      .select("id, user_id, monthly_commission_pct, annual_commission_pct, monthly_deal_target, monthly_revenue_target")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .eq("role", "member");
    if (membersErr) throw membersErr;

    const userIds = (memberRows ?? []).map(m => m.user_id);
    if (userIds.length === 0) return empty;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: profiles }, { data: closedLeads, error: leadsErr }, { data: allLeads }] = await Promise.all([
      admin.from("dms_profiles").select("id, full_name").in("id", userIds),
      admin
        .from("dms_leads")
        .select("assigned_to, payment_amount, plan_type")
        .in("assigned_to", userIds)
        .eq("status", LEAD_STATUS_CLOSED)
        .gte("updated_at", monthStart),
      admin.from("dms_leads").select("assigned_to").in("assigned_to", userIds),
    ]);
    if (leadsErr) throw leadsErr;

    const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name ?? null]));
    const leadsByUser = new Map<string, { payment_amount: number | null; plan_type: string | null }[]>();
    for (const lead of closedLeads ?? []) {
      const list = leadsByUser.get(lead.assigned_to as string) ?? [];
      list.push(lead);
      leadsByUser.set(lead.assigned_to as string, list);
    }

    const assignedCount = new Map<string, number>();
    for (const lead of allLeads ?? []) {
      const key = lead.assigned_to as string;
      assignedCount.set(key, (assignedCount.get(key) ?? 0) + 1);
    }

    const members: TeamMemberEarnings[] = (memberRows ?? []).map(m => {
      const monthly_commission_pct = Number(m.monthly_commission_pct ?? 0);
      const annual_commission_pct = Number(m.annual_commission_pct ?? 0);
      const myLeads = leadsByUser.get(m.user_id) ?? [];

      let revenue_this_month = 0;
      let commission_earned = 0;
      for (const lead of myLeads) {
        const amt = Number(lead.payment_amount ?? 0);
        revenue_this_month += amt;
        commission_earned += amt * ((lead.plan_type === "annual" ? annual_commission_pct : monthly_commission_pct) / 100);
      }

      return {
        member_id: m.id,
        user_id: m.user_id,
        full_name: nameMap.get(m.user_id) ?? null,
        goals: {
          monthly_commission_pct,
          annual_commission_pct,
          monthly_deal_target: Number(m.monthly_deal_target ?? 0),
          monthly_revenue_target: Number(m.monthly_revenue_target ?? 0),
        },
        leads_assigned: assignedCount.get(m.user_id) ?? 0,
        deals_closed: myLeads.length,
        revenue_this_month,
        commission_earned: Math.round(commission_earned),
      };
    });

    const totals = members.reduce(
      (acc, m) => ({
        deals_closed: acc.deals_closed + m.deals_closed,
        revenue_this_month: acc.revenue_this_month + m.revenue_this_month,
        commission_earned: acc.commission_earned + m.commission_earned,
      }),
      { deals_closed: 0, revenue_this_month: 0, commission_earned: 0 }
    );

    return { members, totals };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "Failed to load goals and earnings" };
  }
}

export async function setTeamMemberGoals(
  memberId: string,
  goals: {
    monthly_commission_pct: number;
    annual_commission_pct: number;
    monthly_deal_target: number;
    monthly_revenue_target: number;
  }
): Promise<{ error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    const teamId = await resolveMemberTeamId(memberId);
    assertTeamAccess(teamId, managerTeamIds, isAdmin);

    const validated = validateGoals(goals);
    const admin = createAdminClient();
    const { error } = await admin.from("dms_sales_team_members").update(validated).eq("id", memberId);
    if (error) throw error;
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save goals" };
  }
}

// Read-only drill-down for the manager's /sales/team/[repId] page: the rep's
// own leads plus recent activity on each, scoped to a team the caller manages.
// Never trusts a client-supplied team — resolves the rep's membership server-side.
export async function getRepDetailForManager(
  repId: string
): Promise<{ data: RepDetailForManager | null; error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    if (!UUID_RE.test(repId)) throw new Error("Rep not found");

    const admin = createAdminClient();
    let membershipQuery = admin
      .from("dms_sales_team_members")
      .select("team_id, monthly_commission_pct, annual_commission_pct, monthly_deal_target, monthly_revenue_target")
      .eq("user_id", repId)
      .eq("is_active", true);
    if (!isAdmin) membershipQuery = membershipQuery.in("team_id", managerTeamIds);

    const { data: memberships } = await membershipQuery;
    const membership = memberships?.[0];
    if (!membership) throw new Error("Rep not found");

    const [{ data: profile }, { data: leads, error: leadsErr }] = await Promise.all([
      admin.from("dms_profiles").select("full_name").eq("id", repId).single(),
      admin
        .from("dms_leads")
        .select("*")
        .eq("assigned_to", repId)
        .eq("team_id", membership.team_id)
        .order("updated_at", { ascending: false }),
    ]);
    if (leadsErr) throw leadsErr;

    const leadIds = (leads ?? []).map(l => l.id);
    const { data: activities, error: actErr } = leadIds.length
      ? await admin
          .from("dms_lead_activities")
          .select("*")
          .in("lead_id", leadIds)
          .order("created_at", { ascending: false })
      : { data: [] as LeadActivity[], error: null };
    if (actErr) throw actErr;

    const activitiesByLead: Record<string, LeadActivity[]> = {};
    for (const act of activities ?? []) {
      const list = activitiesByLead[act.lead_id] ?? [];
      if (list.length < 5) list.push(act as LeadActivity); // most recent 5 per lead, already ordered desc
      activitiesByLead[act.lead_id] = list;
    }

    return {
      data: {
        repName: profile?.full_name ?? null,
        goals: {
          monthly_commission_pct: Number(membership.monthly_commission_pct ?? 0),
          annual_commission_pct: Number(membership.annual_commission_pct ?? 0),
          monthly_deal_target: Number(membership.monthly_deal_target ?? 0),
          monthly_revenue_target: Number(membership.monthly_revenue_target ?? 0),
        },
        leads: (leads ?? []) as Lead[],
        activitiesByLead,
      },
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to load rep detail" };
  }
}

// Full read-only lead record for the manager portal — the complete-view
// counterpart to the summary rows shown in the team leads rollup. Every
// activity is returned (no cap), unlike getRepDetailForManager's 5-per-lead
// preview, since this is the single-lead "see everything" page.
export async function getLeadDetailForManager(
  leadId: string
): Promise<{ data: LeadDetailForManager | null; error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    if (!UUID_RE.test(leadId)) throw new Error("Lead not found");

    const admin = createAdminClient();
    const { data: lead, error: leadErr } = await admin
      .from("dms_leads")
      .select("*")
      .eq("id", leadId)
      .single();

    // Uniform error for missing, unowned-by-any-team, and out-of-scope leads —
    // prevents an existence oracle for teams the caller doesn't manage.
    if (leadErr || !lead || !lead.team_id || (!isAdmin && !managerTeamIds.includes(lead.team_id))) {
      throw new Error("Lead not found");
    }

    const [{ data: profile }, { data: activities, error: actErr }] = await Promise.all([
      lead.assigned_to
        ? admin.from("dms_profiles").select("full_name").eq("id", lead.assigned_to).single()
        : Promise.resolve({ data: null }),
      admin
        .from("dms_lead_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false }),
    ]);
    if (actErr) throw actErr;

    return {
      data: {
        lead: lead as Lead,
        activities: (activities ?? []) as LeadActivity[],
        repName: profile?.full_name ?? null,
      },
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to load lead" };
  }
}

// Resolves the lead's team and confirms the caller manages it. Returns the
// lead's team_id so callers can scope any follow-up query to the same team.
async function assertLeadInManagedTeam(
  leadId: string,
  managerTeamIds: string[],
  isAdmin: boolean
): Promise<string> {
  if (!UUID_RE.test(leadId)) throw new Error("Lead not found");
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("dms_leads")
    .select("team_id")
    .eq("id", leadId)
    .single();
  if (!lead?.team_id) throw new Error("Lead not found");
  if (!isAdmin && !managerTeamIds.includes(lead.team_id)) throw new Error("Lead not found");
  return lead.team_id as string;
}

// Manager assigns a lead to a rep. Both the lead and the target rep must belong
// to a team the caller manages — otherwise a manager could hand a lead to
// someone outside their team, or claim a lead from another team.
export async function assignLeadToRep(
  leadId: string,
  repId: string | null
): Promise<{ error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    const teamId = await assertLeadInManagedTeam(leadId, managerTeamIds, isAdmin);

    const admin = createAdminClient();

    if (repId !== null) {
      if (!UUID_RE.test(repId)) throw new Error("Rep not found");
      const { data: membership } = await admin
        .from("dms_sales_team_members")
        .select("id")
        .eq("user_id", repId)
        .eq("team_id", teamId)
        .eq("is_active", true)
        .maybeSingle();
      if (!membership) throw new Error("Rep not found on this team");
    }

    const { error } = await admin
      .from("dms_leads")
      .update({ assigned_to: repId, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) throw error;

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to assign lead" };
  }
}

export async function setTeamLeadStatus(
  leadId: string,
  status: string
): Promise<{ error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    await assertLeadInManagedTeam(leadId, managerTeamIds, isAdmin);
    if (!isLeadStatus(status)) throw new Error("Invalid status");

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_leads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) throw error;

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update status" };
  }
}

export async function setTeamLeadPriority(
  leadId: string,
  priority: string
): Promise<{ error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    await assertLeadInManagedTeam(leadId, managerTeamIds, isAdmin);
    if (!isLeadPriority(priority)) throw new Error("Invalid priority");

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_leads")
      .update({ priority, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) throw error;

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update priority" };
  }
}

export async function deleteTeamLead(leadId: string): Promise<{ error?: string }> {
  try {
    const { managerTeamIds, isAdmin } = await requireSalesManager();
    await assertLeadInManagedTeam(leadId, managerTeamIds, isAdmin);

    const admin = createAdminClient();
    const { error } = await admin.from("dms_leads").delete().eq("id", leadId);
    if (error) throw error;

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete lead" };
  }
}
