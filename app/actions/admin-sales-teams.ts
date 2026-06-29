"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("dms_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) throw new Error("Forbidden");
  return user;
}

export type SalesTeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  monthly_commission_pct: number;
  annual_commission_pct: number;
  monthly_deal_target: number;
  monthly_revenue_target: number;
};

export type SalesTeam = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  members: SalesTeamMember[];
};

export async function listSalesTeams(): Promise<{ teams: SalesTeam[]; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const [{ data: teams, error: teamsErr }, { data: members, error: membersErr }, { data: { users } }] =
      await Promise.all([
        admin.from("dms_sales_teams").select("*").order("created_at", { ascending: false }),
        admin.from("dms_sales_team_members").select("*").eq("is_active", true),
        admin.auth.admin.listUsers({ perPage: 1000 }),
      ]);

    if (teamsErr) throw teamsErr;
    if (membersErr) throw membersErr;

    const profileIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = profileIds.length
      ? await admin.from("dms_profiles").select("id, full_name").in("id", profileIds)
      : { data: [] };

    const userEmailMap = new Map(users.map((u) => [u.id, u.email ?? null]));
    const profileNameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? null]));

    const membersByTeam = new Map<string, SalesTeamMember[]>();
    for (const m of members ?? []) {
      const list = membersByTeam.get(m.team_id) ?? [];
      list.push({
        id: m.id,
        team_id: m.team_id,
        user_id: m.user_id,
        email: userEmailMap.get(m.user_id) ?? null,
        full_name: profileNameMap.get(m.user_id) ?? null,
        role: m.role,
        is_active: m.is_active,
        created_at: m.created_at,
        monthly_commission_pct: Number(m.monthly_commission_pct ?? 0),
        annual_commission_pct: Number(m.annual_commission_pct ?? 0),
        monthly_deal_target: Number(m.monthly_deal_target ?? 0),
        monthly_revenue_target: Number(m.monthly_revenue_target ?? 0),
      });
      membersByTeam.set(m.team_id, list);
    }

    const result: SalesTeam[] = (teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? null,
      is_active: t.is_active,
      created_at: t.created_at,
      members: membersByTeam.get(t.id) ?? [],
    }));

    return { teams: result };
  } catch (err) {
    return { teams: [], error: err instanceof Error ? err.message : "Failed to list teams" };
  }
}

export async function createSalesTeam(
  name: string,
  description?: string
): Promise<{ teamId?: string; error?: string }> {
  try {
    const user = await requireAdmin();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Team name is required");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_sales_teams")
      .insert({ name: trimmed, description: description?.trim() || null, created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;
    return { teamId: data.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create team" };
  }
}

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

export async function createSalesRep(data: {
  email: string;
  password: string;
  full_name: string;
  team_id: string;
  role: string;
}): Promise<{ userId?: string; tempPassword?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!data.email || !data.full_name.trim()) throw new Error("Email and name are required");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!["manager", "member"].includes(data.role)) throw new Error("Invalid role");
    if (!UUID_RE.test(data.team_id)) throw new Error("Invalid team ID");

    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name.trim() },
    });
    if (createErr) throw createErr;

    const userId = created.user.id;

    await admin.from("dms_profiles").upsert(
      { id: userId, full_name: data.full_name.trim(), role: "member", is_sales_rep: true },
      { onConflict: "id" }
    );

    const { error: memberErr } = await admin
      .from("dms_sales_team_members")
      .insert({ team_id: data.team_id, user_id: userId, role: data.role });
    if (memberErr) throw memberErr;

    return { userId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create sales rep" };
  }
}

export async function removeTeamMember(memberId: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!UUID_RE.test(memberId)) throw new Error("Invalid member ID");
    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_sales_team_members")
      .update({ is_active: false })
      .eq("id", memberId);
    if (error) throw error;
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove member" };
  }
}

export async function toggleTeamActive(teamId: string, is_active: boolean): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!UUID_RE.test(teamId)) throw new Error("Invalid team ID");
    const admin = createAdminClient();
    const { error } = await admin.from("dms_sales_teams").update({ is_active }).eq("id", teamId);
    if (error) throw error;
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update team" };
  }
}

export async function setMemberGoals(
  memberId: string,
  goals: {
    monthly_commission_pct: number;
    annual_commission_pct: number;
    monthly_deal_target: number;
    monthly_revenue_target: number;
  }
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    if (!UUID_RE.test(memberId)) throw new Error("Invalid member ID");

    const pct = (v: number) => {
      if (typeof v !== "number" || isNaN(v) || v < 0 || v > 100) throw new Error("Commission % must be between 0 and 100");
      return Math.round(v * 100) / 100;
    };
    const posInt = (v: number, name: string) => {
      if (typeof v !== "number" || isNaN(v) || v < 0 || !Number.isFinite(v)) throw new Error(`${name} must be a non-negative number`);
      if (v > 10_000) throw new Error(`${name} cannot exceed 10,000`);
      return Math.round(v);
    };
    const posNum = (v: number, name: string) => {
      if (typeof v !== "number" || isNaN(v) || v < 0 || !Number.isFinite(v)) throw new Error(`${name} must be a non-negative number`);
      if (v > 100_000_000) throw new Error(`${name} cannot exceed 100,000,000`);
      return Math.round(v * 100) / 100;
    };

    const monthly_commission_pct = pct(goals.monthly_commission_pct);
    const annual_commission_pct = pct(goals.annual_commission_pct);
    const monthly_deal_target = posInt(goals.monthly_deal_target, "Monthly deal target");
    const monthly_revenue_target = posNum(goals.monthly_revenue_target, "Monthly revenue target");

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_sales_team_members")
      .update({ monthly_commission_pct, annual_commission_pct, monthly_deal_target, monthly_revenue_target })
      .eq("id", memberId);
    if (error) throw error;
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save goals" };
  }
}

export { generatePassword };
