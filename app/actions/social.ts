"use server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import type { SocialCommissionType } from "@/types";

async function requireOwner() {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.gymId || ctx.isDemo) return null;
  return ctx;
}

// ── Social Manager CRUD ───────────────────────────────────────────────────────

export async function createSocialManager(payload: {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  commission_type: SocialCommissionType;
  commission_value: number;
}) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pulse_social_managers")
    .insert({ gym_id: ctx.gymId, ...payload })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await writeAuditLog({ actor_id: ctx.user.id, actor_email: ctx.user.email ?? "", action: "social_manager.create", entity: "social_manager", entity_id: data.id, meta: { full_name: payload.full_name } });
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true, id: data.id };
}

export async function updateSocialManager(managerId: string, payload: {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  commission_type: SocialCommissionType;
  commission_value: number;
  status: "active" | "inactive";
}) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("pulse_social_managers")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", managerId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true };
}

export async function deleteSocialManager(managerId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: manager } = await admin
    .from("pulse_social_managers")
    .select("id, full_name, user_id")
    .eq("id", managerId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!manager) return { error: "Manager not found" };

  const { count } = await admin
    .from("pulse_social_leads")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", managerId)
    .in("status", ["pending_review", "pending_payment"]);
  if (count && count > 0) return { blocked: "has_pending_commissions" as const, count };

  if (manager.user_id) await admin.auth.admin.deleteUser(manager.user_id);
  const { error } = await admin.from("pulse_social_managers").delete().eq("id", managerId);
  if (error) return { error: error.message };

  await writeAuditLog({ actor_id: ctx.user.id, actor_email: ctx.user.email ?? "", action: "social_manager.delete", entity: "social_manager", entity_id: managerId, meta: { full_name: manager.full_name } });
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true };
}

// ── Login management ──────────────────────────────────────────────────────────

export async function createSocialManagerLogin(managerId: string, email: string, password: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { data: manager } = await admin
    .from("pulse_social_managers")
    .select("id, full_name, user_id")
    .eq("id", managerId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!manager) return { error: "Manager not found" };
  if (manager.user_id) return { error: "Login already exists" };

  const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: manager.full_name, role: "social_manager" },
  });
  if (authErr) return { error: authErr.message };

  await admin.from("pulse_social_managers").update({ user_id: newUser.user.id, email, updated_at: new Date().toISOString() }).eq("id", managerId);
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true, userId: newUser.user.id };
}

export async function removeSocialManagerLogin(managerId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { data: manager } = await admin
    .from("pulse_social_managers")
    .select("id, user_id")
    .eq("id", managerId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!manager?.user_id) return { error: "No login exists" };
  await admin.auth.admin.deleteUser(manager.user_id);
  await admin.from("pulse_social_managers").update({ user_id: null, updated_at: new Date().toISOString() }).eq("id", managerId);
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true };
}

// ── Lead actions (SM manager) ─────────────────────────────────────────────────

export async function createSocialLead(payload: {
  lead_name: string;
  lead_phone?: string | null;
  lead_social_handle?: string | null;
  platform: string;
  evidence_url?: string | null;
  notes?: string | null;
}) {
  const admin = createAdminClient();
  // Verify caller is an active social manager
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: manager } = await admin
    .from("pulse_social_managers")
    .select("id, gym_id, status")
    .eq("user_id", user.id)
    .single();
  if (!manager || manager.status !== "active") return { error: "Unauthorized" };

  const { data: gym } = await admin.from("pulse_gyms").select("owner_id").eq("id", manager.gym_id).single();
  if (gym) {
    const { data: ownerProfile } = await admin.from("pulse_profiles").select("is_demo").eq("id", gym.owner_id).single();
    if (ownerProfile?.is_demo) return { error: "Demo mode — sign up to make changes." };
  }

  const { data, error } = await admin
    .from("pulse_social_leads")
    .insert({
      gym_id: manager.gym_id,
      manager_id: manager.id,
      ...payload,
      status: "unmatched",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidateTag(`social-${manager.gym_id}`);
  return { success: true, id: data.id };
}

// ── Lead actions (owner) ──────────────────────────────────────────────────────

export async function matchSocialLead(leadId: string, memberId: string, commissionAmount: number, matchedBy: "auto" | "manual") {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { data: lead } = await admin.from("pulse_social_leads").select("lead_name, manager_id").eq("id", leadId).eq("gym_id", ctx.gymId).single();
  const newStatus = matchedBy === "auto" ? "pending_payment" : "pending_review";
  const { error } = await admin
    .from("pulse_social_leads")
    .update({
      member_id: memberId,
      commission_amount: commissionAmount,
      matched_by: matchedBy,
      matched_at: new Date().toISOString(),
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };
  await writeAuditLog({ actor_id: ctx.user.id, actor_email: ctx.user.email ?? "", action: "social_lead.match", entity: "social_lead", entity_id: leadId, meta: { lead_name: lead?.lead_name, matched_by: matchedBy, commission_amount: commissionAmount, new_status: newStatus } });
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true };
}

export async function approveSocialLead(leadId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("pulse_social_leads")
    .update({ status: "pending_payment", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId)
    .eq("status", "pending_review")
    .select("lead_name, commission_amount");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "Lead is not in pending_review state" };
  await writeAuditLog({ actor_id: ctx.user.id, actor_email: ctx.user.email ?? "", action: "social_lead.approve", entity: "social_lead", entity_id: leadId, meta: { lead_name: updated[0].lead_name, commission_amount: updated[0].commission_amount } });
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true };
}

export async function rejectSocialLead(leadId: string, reason: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { data: lead } = await admin.from("pulse_social_leads").select("lead_name, manager_id").eq("id", leadId).eq("gym_id", ctx.gymId).single();
  const { error } = await admin
    .from("pulse_social_leads")
    .update({ status: "rejected", rejection_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };
  await writeAuditLog({ actor_id: ctx.user.id, actor_email: ctx.user.email ?? "", action: "social_lead.reject", entity: "social_lead", entity_id: leadId, meta: { lead_name: lead?.lead_name, reason } });
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true };
}

export async function markSocialLeadPaid(leadId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("pulse_social_leads")
    .update({ status: "paid", paid_at: new Date().toISOString(), paid_by: ctx.user.id, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId)
    .eq("status", "pending_payment")
    .select("lead_name, commission_amount");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "Lead is not in pending_payment state" };
  await writeAuditLog({ actor_id: ctx.user.id, actor_email: ctx.user.email ?? "", action: "social_lead.pay", entity: "social_lead", entity_id: leadId, meta: { lead_name: updated[0].lead_name, commission_amount: updated[0].commission_amount } });
  revalidateTag(`social-${ctx.gymId}`);
  return { success: true };
}
