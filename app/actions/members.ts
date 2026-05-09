"use server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { formatDateInput } from "@/lib/utils";
import { recalcPendingSalary } from "./trainer";

async function requireOwner() {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.gymId || ctx.isDemo) return null;
  return ctx as typeof ctx & { gymId: string };
}

function revalidate(gymId: string) {
  revalidateTag(`members-${gymId}`);
  revalidateTag(`dashboard-${gymId}`);
  revalidateTag(`reports-${gymId}`);
  revalidateTag(`smart-earn-${gymId}`);
}

// ── Freeze ────────────────────────────────────────────────────────────────────

export async function freezeMember(memberId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, status, freeze_start_date")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };
  if (member.status !== "active") return { error: "Only active members can be frozen" };

  const today = formatDateInput(new Date());
  const { error } = await admin
    .from("pulse_members")
    .update({ status: "frozen", freeze_start_date: today, freeze_end_date: null, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.freeze", entity: "member", entity_id: memberId,
    meta: { full_name: member.full_name, freeze_start_date: today },
  });
  revalidate(ctx.gymId);
  return { success: true };
}

// ── Unfreeze ──────────────────────────────────────────────────────────────────

export async function unfreezeMember(memberId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, status, freeze_start_date, plan_expiry_date")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };
  if (member.status !== "frozen") return { error: "Member is not frozen" };

  const today = new Date();
  const todayStr = formatDateInput(today);

  // Calculate days frozen and extend plan expiry
  let newExpiry = member.plan_expiry_date;
  let daysFrozen = 0;
  if (member.freeze_start_date && member.plan_expiry_date) {
    const frozenFrom = new Date(member.freeze_start_date);
    daysFrozen = Math.max(0, Math.floor((today.getTime() - frozenFrom.getTime()) / (1000 * 60 * 60 * 24)));
    const expiry = new Date(member.plan_expiry_date);
    expiry.setDate(expiry.getDate() + daysFrozen);
    newExpiry = formatDateInput(expiry);
  }

  const { error } = await admin
    .from("pulse_members")
    .update({
      status: "active",
      freeze_end_date: todayStr,
      plan_expiry_date: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.unfreeze", entity: "member", entity_id: memberId,
    meta: { full_name: member.full_name, days_frozen: daysFrozen, new_expiry: newExpiry },
  });
  revalidate(ctx.gymId);
  return { success: true, daysFrozen, newExpiry };
}

// ── Hold ──────────────────────────────────────────────────────────────────────

export async function putMemberOnHold(memberId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, status")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };
  if (member.status !== "active") return { error: "Only active members can be put on hold" };

  const today = formatDateInput(new Date());
  const { error } = await admin
    .from("pulse_members")
    .update({ status: "on_hold", hold_since: today, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.hold", entity: "member", entity_id: memberId,
    meta: { full_name: member.full_name, hold_since: today },
  });
  revalidate(ctx.gymId);
  return { success: true };
}

// ── Resume ────────────────────────────────────────────────────────────────────

export async function resumeMember(memberId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, status, hold_since")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };
  if (member.status !== "on_hold") return { error: "Member is not on hold" };

  const { error } = await admin
    .from("pulse_members")
    .update({ status: "active", hold_since: null, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.resume", entity: "member", entity_id: memberId,
    meta: { full_name: member.full_name, was_on_hold_since: member.hold_since },
  });
  revalidate(ctx.gymId);
  return { success: true };
}

// ── Defaulter ─────────────────────────────────────────────────────────────────

export async function markAsDefaulter(memberId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, status")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };
  if (member.status !== "active") return { error: "Only active members can be marked as defaulters" };

  const today = formatDateInput(new Date());
  const { error } = await admin
    .from("pulse_members")
    .update({ status: "defaulter", defaulter_since: today, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.defaulter", entity: "member", entity_id: memberId,
    meta: { full_name: member.full_name, defaulter_since: today },
  });
  revalidate(ctx.gymId);
  return { success: true };
}

export async function clearDefaulter(memberId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, status, defaulter_since")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };
  if (member.status !== "defaulter") return { error: "Member is not a defaulter" };

  const { error } = await admin
    .from("pulse_members")
    .update({ status: "active", defaulter_since: null, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.defaulter_cleared", entity: "member", entity_id: memberId,
    meta: { full_name: member.full_name, was_defaulter_since: member.defaulter_since },
  });
  revalidate(ctx.gymId);
  return { success: true };
}

export async function checkAndClearDefaulter(memberId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { cleared: false };
  const admin = createAdminClient();

  const { data } = await admin.rpc("check_and_clear_defaulter", { p_member_id: memberId });
  if (data === true) {
    await writeAuditLog({
      actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
      action: "member.defaulter_auto_cleared", entity: "member", entity_id: memberId,
      meta: {},
    });
    revalidate(ctx.gymId);
  }
  return { cleared: data === true };
}

// ── Owner update ──────────────────────────────────────────────────────────────

export async function updateMember(memberId: string, payload: Record<string, unknown>) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  // Fetch current assigned_trainer_id before the update so we can recalc the
  // old trainer if the assignment changes.
  const { data: existing } = await admin
    .from("pulse_members")
    .select("assigned_trainer_id")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();

  const { error } = await admin
    .from("pulse_members")
    .update(payload)
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);

  if (error) return { error: error.message };

  // Recalculate pending salary for affected trainer(s) when the trainer field
  // was part of the payload. Fire-and-forget — errors are swallowed inside
  // recalcPendingSalary so they never block the response.
  if (typeof payload.assigned_trainer_id !== "undefined") {
    const newTrainerId = payload.assigned_trainer_id as string | null;
    const oldTrainerId = existing?.assigned_trainer_id as string | null | undefined;
    const recalcTasks: Promise<void>[] = [];
    if (newTrainerId) recalcTasks.push(recalcPendingSalary(newTrainerId, ctx.gymId));
    if (oldTrainerId && oldTrainerId !== newTrainerId) {
      recalcTasks.push(recalcPendingSalary(oldTrainerId, ctx.gymId));
    }
    try {
      await Promise.all(recalcTasks);
    } catch (err) {
      console.error("[updateMember] recalcPendingSalary failed:", err);
    }
  }

  revalidate(ctx.gymId);
  return { success: true };
}

// ── Link device user to member ─────────────────────────────────────────────────

export async function linkDeviceUser(memberId: string, deviceUserId: string, unlinkedId: string) {
  const ctx = await requireOwner();
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, device_user_id")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();

  if (!member) return { error: "Member not found" };
  if (member.device_user_id !== null)
    return { error: `${member.full_name} is already linked to device user #${member.device_user_id}` };

  const { error: e1 } = await admin.from("pulse_members")
    .update({ device_user_id: deviceUserId })
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (e1) return { error: e1.message };

  const { error: e2 } = await admin.from("pulse_unlinked_punches")
    .delete()
    .eq("id", unlinkedId)
    .eq("gym_id", ctx.gymId);
  if (e2) return { error: e2.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.device_linked", entity: "member", entity_id: memberId,
    meta: { device_user_id: deviceUserId, unlinked_punch_id: unlinkedId },
  });

  revalidate(ctx.gymId);
  return { success: true };
}

