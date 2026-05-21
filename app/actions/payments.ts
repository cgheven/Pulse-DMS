"use server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, getStaffSession } from "@/lib/data";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import type { Payment } from "@/types";

/**
 * Authorize a mutation that may be performed by either the gym owner
 * or a non-owner staff member with the given permission. Returns a
 * normalized context shape (gymId + user) on success, or null on
 * failure. Demo owners are blocked. Trainer flow is unaffected — it
 * goes through getTrainerContext + RLS trainers_insert_payments.
 */
async function requireOwnerOrPermission(perm: PermissionKey) {
  const owner = await getAuthContext();
  if (owner?.user && owner.gymId && !owner.isDemo) {
    return {
      gymId: owner.gymId as string,
      user: owner.user,
      isOwner: true as const,
      staffId: null as string | null,
    };
  }
  const staff = await getStaffSession();
  if (staff && hasPermission(staff.permissions, perm)) {
    return {
      gymId: staff.gymId,
      user: staff.user,
      isOwner: false as const,
      staffId: staff.staffId,
    };
  }
  return null;
}

function revalidateAll(gymId: string) {
  revalidateTag(`payments-${gymId}`);
  revalidateTag(`dashboard-${gymId}`);
  revalidateTag(`reports-${gymId}`);
  revalidateTag(`members-${gymId}`);
  revalidateTag(`discounts-${gymId}`);
}

export async function revalidatePayments() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return;
  // A payment touches dashboard stats + reports + members outstanding balance.
  revalidateAll(ctx.gymId);
}

interface CreatePaymentPayload {
  member_id: string;
  amount: number;
  discount?: number;
  late_fee?: number;
  total_amount: number;
  payment_method: string;
  payment_date: string;
  for_period: string;
  status: "paid" | "pending" | "overdue" | "refunded" | "waived";
  receipt_number?: string | null;
  notes?: string | null;
  plan_id?: string | null;
}

export async function createPayment(payload: CreatePaymentPayload) {
  const ctx = await requireOwnerOrPermission("payments.create");
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  // Verify member belongs to this gym. Also pull pending_signup_discount so
  // we know whether to clear it after recording an admission payment.
  const { data: member } = await admin
    .from("pulse_members")
    .select("id, gym_id, full_name, pending_signup_discount")
    .eq("id", payload.member_id)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };

  const { data, error } = await admin
    .from("pulse_payments")
    .insert({
      gym_id: ctx.gymId,
      member_id: payload.member_id,
      plan_id: payload.plan_id ?? null,
      amount: payload.amount,
      discount: payload.discount ?? 0,
      late_fee: payload.late_fee ?? 0,
      total_amount: payload.total_amount,
      payment_method: payload.payment_method,
      payment_date: payload.payment_date,
      for_period: payload.for_period,
      status: payload.status,
      receipt_number: payload.receipt_number ?? null,
      notes: payload.notes ?? null,
    })
    .select("*, member:pulse_members(full_name,plan_id)")
    .single();
  if (error) return { error: error.message };

  // Clear-on-paid: when the owner actually records the admission payment
  // (status=paid, for_period=admission), the previously promised discount
  // moves from "pulse_members.pending_signup_discount" (Promised) to the
  // freshly inserted "pulse_payments.discount" row (Realized). Zero out the
  // member column so the report doesn't double-count.
  const pendingPromised = Number(member.pending_signup_discount ?? 0);
  if (
    pendingPromised > 0 &&
    payload.for_period === "admission" &&
    payload.status === "paid"
  ) {
    await admin
      .from("pulse_members")
      .update({ pending_signup_discount: 0, updated_at: new Date().toISOString() })
      .eq("id", payload.member_id)
      .eq("gym_id", ctx.gymId);
  }

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "payment.create", entity: "payment", entity_id: data.id,
    meta: { member_id: payload.member_id, member_name: member.full_name, amount: payload.total_amount, by_role: ctx.isOwner ? "owner" : "staff" },
  });
  revalidateAll(ctx.gymId);
  return { success: true, payment: data };
}

// ── Read payments list (staff-safe) ─────────────────────────────────────────

/**
 * Fetch recent payments for the active gym. Uses admin client after a
 * permission check so non-owner staff (managers/frontdesk) can read
 * even though there's no RLS SELECT policy for them.
 */
export async function listPaymentsForGym() {
  const ctx = await requireOwnerOrPermission("payments.view");
  if (!ctx) return { error: "Unauthorized" as const };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pulse_payments")
    .select("*, member:pulse_members(full_name,plan_id)")
    .eq("gym_id", ctx.gymId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { error: error.message };
  return { success: true as const, payments: (data ?? []) as Payment[] };
}

/**
 * Fetch the full audit-log + payment timeline for a single member.
 * Tenant-checked: member must belong to the active gym.
 */
export async function listMemberTimeline(memberId: string) {
  const ctx = await requireOwnerOrPermission("members.view_all");
  if (!ctx) return { error: "Unauthorized" as const };
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("pulse_members")
    .select("id, gym_id")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };

  const [auditRes, payRes] = await Promise.all([
    admin
      .from("pulse_audit_log")
      .select("id,action,created_at,meta")
      .eq("entity", "member")
      .eq("entity_id", memberId)
      .order("created_at", { ascending: false }),
    admin
      .from("pulse_payments")
      .select("id,total_amount,payment_method,for_period,status,receipt_number,payment_date,created_at")
      .eq("member_id", memberId)
      .eq("status", "paid")
      .order("payment_date", { ascending: false }),
  ]);
  return {
    success: true as const,
    audit: (auditRes.data ?? []) as Array<{ id: string; action: string; created_at: string; meta: Record<string, unknown> | null }>,
    payments: (payRes.data ?? []) as Array<{ id: string; total_amount: number; payment_method: string; for_period: string; status: string; receipt_number: string | null; payment_date: string; created_at: string }>,
  };
}

export async function updatePayment(paymentId: string, payload: Partial<CreatePaymentPayload>) {
  const ctx = await requireOwnerOrPermission("payments.create");
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("pulse_payments")
    .select("id, gym_id")
    .eq("id", paymentId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!existing) return { error: "Payment not found" };

  const update: Record<string, unknown> = {};
  for (const key of ["amount", "discount", "late_fee", "total_amount", "payment_method", "payment_date", "for_period", "status", "receipt_number", "notes"] as const) {
    if (key in payload) update[key] = payload[key];
  }

  const { error } = await admin
    .from("pulse_payments")
    .update(update)
    .eq("id", paymentId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "payment.update", entity: "payment", entity_id: paymentId,
    meta: { changes: payload, by_role: ctx.isOwner ? "owner" : "staff" },
  });
  revalidateAll(ctx.gymId);
  return { success: true };
}
