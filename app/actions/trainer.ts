"use server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, getTrainerContext } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

export async function createTrainerLogin(staffId: string, email: string, password: string) {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };

  if (!email.endsWith("@musabkhan.me")) return { error: "Email must use @musabkhan.me domain" };

  const admin = createAdminClient();

  const { data: staff, error: staffErr } = await admin
    .from("pulse_staff")
    .select("id, full_name, gym_id, user_id")
    .eq("id", staffId)
    .eq("gym_id", ctx.gymId)
    .single();

  if (staffErr || !staff) return { error: "Staff not found" };
  if (staff.user_id) return { error: "Login already exists for this trainer" };

  // Check if this email is already registered at another gym — link instead of create
  const { data: existingStaff } = await admin
    .from("pulse_staff")
    .select("user_id")
    .eq("email", email)
    .not("user_id", "is", null)
    .maybeSingle();

  let userId: string;

  if (existingStaff?.user_id) {
    // Trainer already has an account — just link to this gym's staff record
    userId = existingStaff.user_id;
  } else {
    const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: staff.full_name, role: "trainer" },
    });
    if (authErr) return { error: authErr.message };
    userId = newUser.user.id;
  }

  await admin.from("pulse_staff").update({ user_id: userId, email }).eq("id", staffId);

  return { success: true };
}

export async function checkMemberByPhone(phone: string) {
  const ctx = await getTrainerContext();
  if (!ctx) return { member: null };
  const admin = createAdminClient();
  const normalized = phone.replace(/\s/g, "");
  const { data } = await admin
    .from("pulse_members")
    .select("id, full_name, phone, email, cnic, plan_id, monthly_fee, admission_fee, join_date, plan_expiry_date, notes, assigned_trainer_id, status")
    .eq("gym_id", ctx.gymId)
    .eq("phone", normalized)
    .maybeSingle();
  return { member: data ?? null };
}

type MemberPayload = {
  full_name: string;
  phone: string;
  cnic?: string | null;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  emergency_contact?: string | null;
  address?: string | null;
  plan_id: string | null;
  monthly_fee: number;
  admission_fee: number;
  admission_fee_paid: boolean;
  join_date: string;
  plan_expiry_date: string | null;
  notes?: string | null;
  assigned_trainer_id?: string | null;
};

async function resolveTrainerAssignment(gymId: string, fallbackId: string, requested?: string | null) {
  if (requested === null) return null; // Gym Only
  if (!requested) return fallbackId;
  const admin = createAdminClient();
  const { data } = await admin
    .from("pulse_staff")
    .select("id")
    .eq("id", requested)
    .eq("gym_id", gymId)
    .eq("status", "active")
    .eq("role", "trainer")
    .maybeSingle();
  return data?.id ?? fallbackId;
}

export async function createMemberAsTrainer(payload: MemberPayload) {
  const ctx = await getTrainerContext();
  if (!ctx) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };
  if (!ctx.staff.can_add_members) return { error: "Permission denied" };

  const admin = createAdminClient();
  const outstanding = payload.admission_fee_paid ? 0 : payload.admission_fee;
  const trainerId = await resolveTrainerAssignment(ctx.gymId, ctx.staff.id, payload.assigned_trainer_id);

  const { data: member, error } = await admin
    .from("pulse_members")
    .insert({
      gym_id: ctx.gymId,
      assigned_trainer_id: trainerId,
      full_name: payload.full_name,
      phone: payload.phone,
      cnic: payload.cnic ?? null,
      email: payload.email ?? null,
      gender: payload.gender ?? null,
      date_of_birth: payload.date_of_birth ?? null,
      emergency_contact: payload.emergency_contact ?? null,
      address: payload.address ?? null,
      plan_id: payload.plan_id,
      monthly_fee: payload.monthly_fee,
      admission_fee: payload.admission_fee,
      join_date: payload.join_date,
      plan_expiry_date: payload.plan_expiry_date,
      status: "active",
      outstanding_balance: outstanding,
      notes: payload.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !member) return { error: error?.message ?? "Failed to create member" };

  // Auto-record admission payment if marked paid at onboarding
  if (payload.admission_fee_paid && payload.admission_fee > 0) {
    await admin.from("pulse_payments").insert({
      gym_id: ctx.gymId,
      member_id: member.id,
      plan_id: payload.plan_id,
      amount: payload.admission_fee,
      total_amount: payload.admission_fee,
      payment_method: "cash",
      payment_date: payload.join_date,
      for_period: "admission",
      status: "paid",
    });
  }

  revalidateTag(`members-${ctx.gymId}`);
  revalidateTag(`dashboard-${ctx.gymId}`);
  return { success: true, memberId: member.id };
}

type UpdatePayload = {
  full_name: string;
  phone: string;
  email?: string | null;
  cnic?: string | null;
  plan_id: string | null;
  monthly_fee: number;
  admission_fee: number;
  join_date: string;
  plan_expiry_date: string | null;
  notes?: string | null;
  assigned_trainer_id?: string | null;
};

export async function updateMemberAsTrainer(memberId: string, payload: UpdatePayload) {
  const ctx = await getTrainerContext();
  if (!ctx) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };
  if (!ctx.staff.can_add_members) return { error: "Permission denied" };

  const admin = createAdminClient();

  // Trainer with onboarding perm can edit own members + SELF (no assigned trainer) members in same gym.
  const { data: existing } = await admin
    .from("pulse_members")
    .select("id, assigned_trainer_id, gym_id")
    .eq("id", memberId)
    .single();

  const ownsMember = existing?.assigned_trainer_id === ctx.staff.id;
  const isSelfClient = existing?.assigned_trainer_id === null;
  if (!existing || existing.gym_id !== ctx.gymId || (!ownsMember && !isSelfClient)) {
    return { error: "Member not found or not editable by you" };
  }

  const trainerId = payload.assigned_trainer_id === undefined
    ? existing.assigned_trainer_id
    : await resolveTrainerAssignment(ctx.gymId, ctx.staff.id, payload.assigned_trainer_id);

  const { error } = await admin
    .from("pulse_members")
    .update({
      full_name: payload.full_name,
      phone: payload.phone,
      email: payload.email ?? null,
      cnic: payload.cnic ?? null,
      plan_id: payload.plan_id,
      monthly_fee: payload.monthly_fee,
      admission_fee: payload.admission_fee,
      join_date: payload.join_date,
      plan_expiry_date: payload.plan_expiry_date,
      notes: payload.notes ?? null,
      assigned_trainer_id: trainerId,
    })
    .eq("id", memberId);

  if (error) return { error: error.message };

  revalidateTag(`members-${ctx.gymId}`);
  revalidateTag(`dashboard-${ctx.gymId}`);
  return { success: true };
}

export async function checkInMemberAsTrainer(memberId: string) {
  const ctx = await getTrainerContext();
  if (!ctx) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };

  const admin = createAdminClient();

  // Verify member is assigned to this trainer
  const { data: member } = await admin
    .from("pulse_members")
    .select("id, gym_id, assigned_trainer_id")
    .eq("id", memberId)
    .single();

  if (!member || member.assigned_trainer_id !== ctx.staff.id || member.gym_id !== ctx.gymId) {
    return { error: "Member not found or not assigned to you" };
  }

  // Block duplicate check-in same day
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const { data: existing } = await admin
    .from("pulse_check_ins")
    .select("id")
    .eq("member_id", memberId)
    .gte("checked_in_at", dayStart)
    .lt("checked_in_at", dayEnd)
    .maybeSingle();

  if (existing) return { error: "Already checked in today" };

  const { data: row, error } = await admin
    .from("pulse_check_ins")
    .insert({
      gym_id: ctx.gymId,
      member_id: memberId,
      check_in_method: "manual",
    })
    .select("id, checked_in_at")
    .single();

  if (error) return { error: error.message };

  revalidateTag(`dashboard-${ctx.gymId}`);
  return { success: true, checkIn: row };
}

// ── Goal tracking ─────────────────────────────────────────────────────────

type GoalInput = {
  title: string;
  category: "weight_loss" | "muscle_gain" | "strength" | "endurance" | "flexibility"
    | "yoga" | "pilates" | "postnatal" | "toning" | "custom";
  unit: string;
  start_value: number | null;
  target_value: number;
  direction: "down" | "up";
  start_date: string;
  target_date: string;
  notes?: string | null;
};

async function verifyOwnsMember(memberId: string) {
  const ctx = await getTrainerContext();
  if (!ctx) return { error: "Unauthorized" as const };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." as const };
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("pulse_members")
    .select("id, gym_id, assigned_trainer_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.gym_id !== ctx.gymId || member.assigned_trainer_id !== ctx.staff.id) {
    return { error: "Member not assigned to you" as const };
  }
  return { ctx, admin, member };
}

async function verifyOwnsGoal(goalId: string) {
  const ctx = await getTrainerContext();
  if (!ctx) return { error: "Unauthorized" as const };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." as const };
  const admin = createAdminClient();
  const { data: goal } = await admin
    .from("pulse_member_goals")
    .select("id, gym_id, member_id, member:pulse_members(assigned_trainer_id)")
    .eq("id", goalId)
    .maybeSingle();
  const member = (goal as { member?: { assigned_trainer_id: string | null } | null } | null)?.member;
  if (!goal || goal.gym_id !== ctx.gymId || member?.assigned_trainer_id !== ctx.staff.id) {
    return { error: "Goal not found or not editable" as const };
  }
  return { ctx, admin, goal };
}

export async function createGoal(memberId: string, payload: GoalInput) {
  const v = await verifyOwnsMember(memberId);
  if ("error" in v) return { error: v.error };
  const { ctx, admin } = v;
  const { data, error } = await admin
    .from("pulse_member_goals")
    .insert({
      gym_id: ctx.gymId,
      member_id: memberId,
      trainer_id: ctx.staff.id,
      title: payload.title,
      category: payload.category,
      unit: payload.unit,
      start_value: payload.start_value,
      target_value: payload.target_value,
      current_value: payload.start_value,
      direction: payload.direction,
      start_date: payload.start_date,
      target_date: payload.target_date,
      notes: payload.notes ?? null,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  return { success: true, goal: data };
}

export async function updateGoal(goalId: string, payload: Partial<GoalInput> & { status?: "active" | "achieved" | "paused" | "abandoned" }) {
  const v = await verifyOwnsGoal(goalId);
  if ("error" in v) return { error: v.error };
  const { admin } = v;
  const { error } = await admin
    .from("pulse_member_goals")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteGoal(goalId: string) {
  const v = await verifyOwnsGoal(goalId);
  if ("error" in v) return { error: v.error };
  const { admin } = v;
  const { error } = await admin.from("pulse_member_goals").delete().eq("id", goalId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function logGoalProgress(goalId: string, value: number, recordedAt?: string, notes?: string | null) {
  const v = await verifyOwnsGoal(goalId);
  if ("error" in v) return { error: v.error };
  const { admin, goal } = v;

  const { data: entry, error } = await admin
    .from("pulse_goal_progress")
    .insert({
      goal_id: goalId,
      value,
      recorded_at: recordedAt ?? new Date().toISOString().slice(0, 10),
      notes: notes ?? null,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  // Refresh current_value + auto-flip to achieved if hit target.
  const { data: g } = await admin
    .from("pulse_member_goals")
    .select("target_value, direction, status")
    .eq("id", goalId)
    .single();

  let nextStatus = g?.status;
  if (g?.status === "active") {
    const hit = g.direction === "down" ? value <= g.target_value : value >= g.target_value;
    if (hit) nextStatus = "achieved";
  }

  await admin
    .from("pulse_member_goals")
    .update({ current_value: value, status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", goal.id);

  return { success: true, entry, achieved: nextStatus === "achieved" };
}

export async function deleteGoalProgress(progressId: string, goalId: string) {
  const v = await verifyOwnsGoal(goalId);
  if ("error" in v) return { error: v.error };
  const { admin } = v;
  const { error } = await admin.from("pulse_goal_progress").delete().eq("id", progressId);
  if (error) return { error: error.message };
  return { success: true };
}

// ── Body metrics tracking ────────────────────────────────────────────────────

type BodyMetricInput = {
  measurement_date: string;
  weight_kg?: number | null;
  body_fat_percentage?: number | null;
  chest_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  bicep_cm?: number | null;
  thigh_l_cm?: number | null;
  custom_metrics?: Record<string, number> | null;
  notes?: string | null;
};

export async function logBodyMetric(memberId: string, payload: BodyMetricInput) {
  const v = await verifyOwnsMember(memberId);
  if ("error" in v) return { error: v.error };
  const { ctx, admin } = v;

  const { data, error } = await admin
    .from("pulse_body_metrics")
    .insert({
      gym_id: ctx.gymId,
      member_id: memberId,
      measurement_date: payload.measurement_date,
      weight_kg: payload.weight_kg ?? null,
      body_fat_percentage: payload.body_fat_percentage ?? null,
      chest_cm: payload.chest_cm ?? null,
      waist_cm: payload.waist_cm ?? null,
      hips_cm: payload.hips_cm ?? null,
      bicep_cm: payload.bicep_cm ?? null,
      thigh_l_cm: payload.thigh_l_cm ?? null,
      custom_metrics: payload.custom_metrics ?? {},
      notes: payload.notes ?? null,
      measured_by: ctx.staff.id,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  return { success: true, metric: data };
}

export async function deleteBodyMetric(metricId: string, memberId: string) {
  const v = await verifyOwnsMember(memberId);
  if ("error" in v) return { error: v.error };
  const { admin } = v;
  const { error } = await admin.from("pulse_body_metrics").delete().eq("id", metricId).eq("member_id", memberId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function skipMetricWeek(memberId: string, weekStart: string, reason?: string | null) {
  const v = await verifyOwnsMember(memberId);
  if ("error" in v) return { error: v.error };
  const { ctx, admin } = v;
  const { error } = await admin
    .from("pulse_metric_skips")
    .upsert({
      gym_id: ctx.gymId,
      member_id: memberId,
      week_start: weekStart,
      reason: reason ?? null,
      closed_by: ctx.staff.id,
    }, { onConflict: "member_id,week_start" });
  if (error) return { error: error.message };
  return { success: true };
}

export async function undoMetricSkip(memberId: string, weekStart: string) {
  const v = await verifyOwnsMember(memberId);
  if ("error" in v) return { error: v.error };
  const { admin } = v;
  const { error } = await admin
    .from("pulse_metric_skips")
    .delete()
    .eq("member_id", memberId)
    .eq("week_start", weekStart);
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeTrainerLogin(staffId: string) {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };

  const admin = createAdminClient();

  const { data: staff } = await admin
    .from("pulse_staff")
    .select("id, user_id, gym_id")
    .eq("id", staffId)
    .eq("gym_id", ctx.gymId)
    .single();

  if (!staff?.user_id) return { error: "No login exists" };

  await admin.auth.admin.deleteUser(staff.user_id);
  await admin.from("pulse_staff").update({ user_id: null }).eq("id", staffId);

  return { success: true };
}

// ── Bulk transfer all active clients from one trainer to another ─────────────
// Use when a trainer resigns/leaves and the gym owner needs to move every
// active client to a replacement trainer in one action. All member-level data
// (goals, body metrics, payment history, notes) stays attached to the member —
// only assigned_trainer_id changes. Optionally also flips goal.trainer_id so
// the new trainer gets credit/leaderboard ownership going forward.
export async function transferTrainerClients(
  fromTrainerId: string,
  toTrainerId: string,
  transferGoals: boolean,
): Promise<{ transferredCount?: number; goalsTransferred?: number; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };
  if (!fromTrainerId || !toTrainerId) return { error: "Both trainers are required" };
  if (fromTrainerId === toTrainerId) return { error: "Source and destination must be different" };

  const admin = createAdminClient();
  const gymId = ctx.gymId;

  // Verify both trainers belong to the caller's gym.
  const { data: trainers, error: trErr } = await admin
    .from("pulse_staff")
    .select("id, full_name, gym_id, status, role")
    .in("id", [fromTrainerId, toTrainerId])
    .eq("gym_id", gymId);

  if (trErr) return { error: trErr.message };
  if (!trainers || trainers.length !== 2) {
    return { error: "One or both trainers not found in this gym" };
  }

  const dest = trainers.find((t) => t.id === toTrainerId);
  const src = trainers.find((t) => t.id === fromTrainerId);
  if (!dest || !src) return { error: "Trainers not found" };
  if (dest.status !== "active") return { error: "Destination trainer must be active" };

  // Transfer active members.
  const { data: updatedMembers, error: memErr } = await admin
    .from("pulse_members")
    .update({ assigned_trainer_id: toTrainerId })
    .eq("gym_id", gymId)
    .eq("assigned_trainer_id", fromTrainerId)
    .eq("status", "active")
    .select("id");

  if (memErr) return { error: memErr.message };
  const transferredCount = updatedMembers?.length ?? 0;

  // Transfer active goals if requested. Scoped to the same gym + active goals
  // owned by the source trainer. Past achieved/abandoned goals stay credited
  // historically to the original trainer.
  let goalsTransferred = 0;
  if (transferGoals) {
    const { data: updatedGoals, error: goalErr } = await admin
      .from("pulse_member_goals")
      .update({ trainer_id: toTrainerId })
      .eq("gym_id", gymId)
      .eq("trainer_id", fromTrainerId)
      .eq("status", "active")
      .select("id");

    if (goalErr) return { error: goalErr.message };
    goalsTransferred = updatedGoals?.length ?? 0;
  }

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "trainer.transfer_clients",
    entity: "staff",
    entity_id: fromTrainerId,
    meta: {
      from_trainer_id: fromTrainerId,
      from_trainer_name: src.full_name,
      to_trainer_id: toTrainerId,
      to_trainer_name: dest.full_name,
      transferred_count: transferredCount,
      goals_transferred: goalsTransferred,
    },
  });

  revalidateTag(`members-${gymId}`);
  revalidateTag(`staff-${gymId}`);
  revalidateTag(`dashboard-${gymId}`);

  return { transferredCount, goalsTransferred };
}

// ── Delete staff member (trainer-aware) ──────────────────────────────────────
// Checks edge cases before deleting:
//   1. Active assigned members  → blocked, must transfer first
//   2. Salary payment history   → blocked, must deactivate instead
//   3. Auth login exists        → deleted automatically
//   4. Goals / body metrics     → trainer_id / measured_by nulled automatically
export async function deleteStaffMember(staffId: string): Promise<{
  success?: boolean;
  blocked?: "has_members" | "has_salary_history";
  activeCount?: number;
  error?: string;
}> {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };
  const gymId = ctx.gymId;
  const admin = createAdminClient();

  const { data: staff } = await admin
    .from("pulse_staff")
    .select("id, full_name, user_id, role")
    .eq("id", staffId)
    .eq("gym_id", gymId)
    .single();

  if (!staff) return { error: "Staff not found" };

  // 1. Block if trainer has active assigned members
  const { count: activeCount } = await admin
    .from("pulse_members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("assigned_trainer_id", staffId)
    .eq("status", "active");

  if (activeCount && activeCount > 0) {
    return { blocked: "has_members", activeCount };
  }

  // 2. Block if staff has salary payment history (preserve financial records)
  const { count: salaryCount } = await admin
    .from("pulse_salary_payments")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId);

  if (salaryCount && salaryCount > 0) {
    return { blocked: "has_salary_history" };
  }

  // 3. Delete auth login if exists
  if (staff.user_id) {
    await admin.auth.admin.deleteUser(staff.user_id);
  }

  // 4. Null out trainer references on goals + metrics (inactive/historical members)
  await Promise.all([
    admin.from("pulse_member_goals").update({ trainer_id: null }).eq("trainer_id", staffId),
    admin.from("pulse_body_metrics").update({ measured_by: null }).eq("measured_by", staffId),
    admin.from("pulse_members").update({ assigned_trainer_id: null }).eq("assigned_trainer_id", staffId),
  ]);

  // 5. Delete staff record
  const { error } = await admin.from("pulse_staff").delete().eq("id", staffId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "staff.delete",
    entity: "staff",
    entity_id: staffId,
    meta: { full_name: staff.full_name, had_login: !!staff.user_id },
  });

  revalidateTag(`staff-${gymId}`);
  revalidateTag(`members-${gymId}`);
  revalidateTag(`dashboard-${gymId}`);

  return { success: true };
}
