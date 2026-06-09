"use server";
import { revalidateTag } from "next/cache";
import { getAuthContext, getStaffSession } from "@/lib/data";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadSource, LeadStatus, LeadLostReason, LeadActivityType } from "@/types";

type LeadInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  source: LeadSource;
  source_detail?: string | null;
  interested_plan_id?: string | null;
  fitness_goals?: string | null;
  next_followup_at?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
};

async function requireOwnerCtx() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId || ctx.isDemo) return null;
  return ctx;
}

/**
 * Authorize a lead-related mutation: owner OR non-owner staff with the
 * given permission. Returns a normalized {gymId, userId} or null.
 * Owners always pass; demo owners are blocked.
 */
async function requireOwnerOrPermission(perm: PermissionKey | PermissionKey[]) {
  const owner = await getAuthContext();
  if (owner?.user && owner.gymId && !owner.isDemo) {
    return { gymId: owner.gymId as string, userId: owner.user.id, isOwner: true as const };
  }
  const staff = await getStaffSession();
  if (staff) {
    const keys = Array.isArray(perm) ? perm : [perm];
    if (keys.every((k) => hasPermission(staff.permissions, k))) {
      return { gymId: staff.gymId, userId: staff.user.id, isOwner: false as const };
    }
  }
  return null;
}

function bumpDashboard(gymId: string | null | undefined) {
  if (!gymId) return;
  revalidateTag(`dashboard-${gymId}`);
}

// ── Create / update / delete ─────────────────────────────────────────────────

export async function createLead(payload: LeadInput) {
  const ctx = await requireOwnerOrPermission("leads.add");
  if (!ctx) return { error: "Unauthorized" };
  if (!payload.full_name?.trim()) return { error: "Name is required" };

  const admin = createAdminClient();
  const { data: lead, error } = await admin
    .from("pulse_leads")
    .insert({
      gym_id: ctx.gymId,
      full_name: payload.full_name.trim(),
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      source: payload.source,
      source_detail: payload.source_detail?.trim() || null,
      interested_plan_id: payload.interested_plan_id || null,
      fitness_goals: payload.fitness_goals?.trim() || null,
      next_followup_at: payload.next_followup_at || null,
      assigned_to: payload.assigned_to || null,
      notes: payload.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  bumpDashboard(ctx.gymId);
  return { success: true, leadId: lead.id };
}

// Fields editable through the general lead-edit modal. Status, lost_reason,
// lost_note, converted_member_id are routed through dedicated actions
// (setLeadStatus / markLeadLost / convertLeadToMember) that also write
// activity-log rows — clients MUST NOT bypass them via mass-assignment.
const LEAD_UPDATE_ALLOWED = [
  "full_name", "phone", "email", "source", "source_detail",
  "interested_plan_id", "fitness_goals", "next_followup_at",
  "assigned_to", "notes",
] as const;
type LeadUpdateKey = (typeof LEAD_UPDATE_ALLOWED)[number];

export async function updateLead(leadId: string, payload: Partial<LeadInput>) {
  const ctx = await requireOwnerOrPermission("leads.update");
  if (!ctx) return { error: "Unauthorized" };

  const admin = createAdminClient();

  // Whitelist allowed fields — see LEAD_UPDATE_ALLOWED rationale above.
  const update: Partial<Record<LeadUpdateKey, unknown>> & { updated_at?: string } = {};
  const src = payload as Record<string, unknown>;
  for (const key of LEAD_UPDATE_ALLOWED) {
    if (key in src) update[key] = src[key];
  }
  if (Object.keys(update).length === 0) {
    return { success: true };
  }
  update.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("pulse_leads")
    .update(update)
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  bumpDashboard(ctx.gymId);
  return { success: true };
}

export async function deleteLead(leadId: string) {
  // Deleting a lead is a destructive action — keep this owner-only.
  const ctx = await requireOwnerCtx();
  if (!ctx) return { error: "Unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin.from("pulse_leads").delete().eq("id", leadId).eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  bumpDashboard(ctx.gymId);
  return { success: true };
}

// ── Status transitions ───────────────────────────────────────────────────────

export async function setLeadStatus(leadId: string, status: LeadStatus) {
  const ctx = await requireOwnerOrPermission("leads.update");
  if (!ctx) return { error: "Unauthorized" };

  const admin = createAdminClient();

  const { error } = await admin
    .from("pulse_leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await admin.from("pulse_lead_activities").insert({
    lead_id: leadId,
    type: "status_change",
    content: `Status → ${status}`,
    created_by: ctx.userId ?? null,
  });

  bumpDashboard(ctx.gymId);
  return { success: true };
}

export async function markLeadLost(leadId: string, reason: LeadLostReason, note?: string) {
  const ctx = await requireOwnerOrPermission("leads.update");
  if (!ctx) return { error: "Unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("pulse_leads")
    .update({
      status: "lost",
      lost_reason: reason,
      lost_note: note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await admin.from("pulse_lead_activities").insert({
    lead_id: leadId,
    type: "status_change",
    content: `Marked lost: ${reason}${note ? ` — ${note}` : ""}`,
  });

  bumpDashboard(ctx.gymId);
  return { success: true };
}

// ── Activity log ─────────────────────────────────────────────────────────────

export async function logLeadActivity(leadId: string, type: LeadActivityType, content?: string) {
  const ctx = await requireOwnerOrPermission("leads.update");
  if (!ctx) return { error: "Unauthorized" };

  const admin = createAdminClient();

  // Verify lead belongs to this gym
  const { data: lead } = await admin
    .from("pulse_leads")
    .select("id, gym_id")
    .eq("id", leadId)
    .single();
  if (!lead || lead.gym_id !== ctx.gymId) return { error: "Lead not found" };

  const { error } = await admin.from("pulse_lead_activities").insert({
    lead_id: leadId,
    type,
    content: content?.trim() || null,
    created_by: ctx.userId ?? null,
  });
  if (error) return { error: error.message };

  // Touch the lead so "last contact" shifts
  await admin
    .from("pulse_leads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", leadId);

  return { success: true };
}

// ── Convert lead → member ────────────────────────────────────────────────────

type ConvertPayload = {
  plan_id: string | null;
  monthly_fee: number;
  admission_fee: number;
  admission_paid: boolean;
  discount?: number;
  join_date: string;
  plan_expiry_date: string | null;
  assigned_trainer_id?: string | null;
};

export async function convertLeadToMember(leadId: string, payload: ConvertPayload) {
  // Conversion both updates a lead AND adds a member, so require both perms.
  const ctx = await requireOwnerOrPermission(["leads.update", "members.add"]);
  if (!ctx) return { error: "Unauthorized" };

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("pulse_leads")
    .select("*")
    .eq("id", leadId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!lead) return { error: "Lead not found" };

  // Clamp signup discount to [0, admission_fee]. Applied whether paid now
  // (payment row) or later (reduces outstanding_balance).
  const rawDiscount = Number(payload.discount ?? 0);
  const signupDiscount = payload.admission_fee > 0
    ? Math.min(Math.max(0, rawDiscount), payload.admission_fee)
    : 0;
  const outstanding = payload.admission_paid
    ? 0
    : Math.max(0, payload.admission_fee - signupDiscount);
  // When admission is unpaid + a signup discount was promised, stash the
  // discount value on the member so the Discounts report can surface it as
  // "Promised". Cleared on admission payment by payments.createPayment.
  const pendingSignupDiscount = !payload.admission_paid && signupDiscount > 0
    ? signupDiscount
    : 0;
  const { data: member, error } = await admin
    .from("pulse_members")
    .insert({
      gym_id: ctx.gymId,
      assigned_trainer_id: payload.assigned_trainer_id ?? null,
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      plan_id: payload.plan_id,
      monthly_fee: payload.monthly_fee,
      admission_fee: payload.admission_fee,
      join_date: payload.join_date,
      plan_expiry_date: payload.plan_expiry_date,
      status: "active",
      outstanding_balance: outstanding,
      pending_signup_discount: pendingSignupDiscount,
      notes: lead.fitness_goals ? `Goal: ${lead.fitness_goals}` : null,
    })
    .select("id")
    .single();
  if (error || !member) return { error: error?.message ?? "Failed to create member" };

  if (payload.admission_paid && payload.admission_fee > 0) {
    await admin.from("pulse_payments").insert({
      gym_id: ctx.gymId,
      member_id: member.id,
      plan_id: payload.plan_id,
      amount: payload.admission_fee,
      discount: signupDiscount,
      total_amount: Math.max(0, payload.admission_fee - signupDiscount),
      payment_method: "cash",
      payment_date: payload.join_date,
      for_period: "admission",
      status: "paid",
    });
  }

  await admin
    .from("pulse_leads")
    .update({
      status: "won",
      converted_member_id: member.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  await admin.from("pulse_lead_activities").insert({
    lead_id: leadId,
    type: "status_change",
    content: "Converted to member 🎉",
  });

  if (ctx.gymId) {
    revalidateTag(`members-${ctx.gymId}`);
    revalidateTag(`reports-${ctx.gymId}`);
    revalidateTag(`discounts-${ctx.gymId}`);
    revalidateTag(`payments-${ctx.gymId}`);
  }
  bumpDashboard(ctx.gymId);
  return { success: true, memberId: member.id };
}
