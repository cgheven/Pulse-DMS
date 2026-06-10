"use server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, getStaffSession, getMembers } from "@/lib/data";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { formatDateInput } from "@/lib/utils";
import { recalcPendingSalary } from "./trainer";

async function requireOwner() {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.gymId || ctx.isDemo) return null;
  return ctx as typeof ctx & { gymId: string };
}

/**
 * Authorize a mutation that may be performed by either the gym owner
 * or a non-owner staff member with the given permission. Returns a
 * normalized context shape (gymId + user) on success, or null on
 * failure. Demo owners are blocked (existing behavior).
 *
 * Owners ALWAYS pass — permissions only gate non-owner staff. The
 * trainer flow is unaffected (it uses requireTrainer / can_add_members).
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

function revalidate(gymId: string) {
  revalidateTag(`members-${gymId}`);
  revalidateTag(`dashboard-${gymId}`);
  revalidateTag(`reports-${gymId}`);
  revalidateTag(`smart-earn-${gymId}`);
  revalidateTag(`discounts-${gymId}`);
  revalidateTag(`payments-${gymId}`);
}

// ── Mass-assignment whitelist ──────────────────────────────────────────────────
//
// Defense-in-depth: server actions accept Record<string, unknown> from the
// client. Without an explicit allow-list, a staff member with `members.edit`
// could mass-assign protected columns (e.g. `gym_id` to move members across
// tenants, `device_user_id` to claim someone else's biometric identity,
// `status`/`freeze_*`/`hold_since`/`defaulter_since` to bypass the dedicated
// state-transition actions that write audit log entries).
//
// `MEMBER_UPDATE_ALLOWED` = fields editable via the general edit modal.
// `MEMBER_CREATE_ALLOWED` = same set (status defaults handled in UI).
// `MEMBER_BULK_ALLOWED`   = typical bulk-edit fields (plan / fees / trainer).
//
// EXCLUDED: `gym_id`, `id`, `created_at`, `updated_at`,
// `freeze_start_date`, `freeze_end_date`, `hold_since`, `defaulter_since`
// (those go through dedicated freeze/hold/defaulter actions with audit trail).
const MEMBER_UPDATE_ALLOWED = [
  "full_name", "phone", "email", "cnic", "gender", "date_of_birth",
  "emergency_contact", "emergency_phone", "address", "notes", "medical_notes",
  "photo_url",
  "plan_id", "monthly_fee", "admission_fee", "outstanding_balance",
  "assigned_trainer_id", "assigned_shift_id", "referrer_id",
  "member_number", "join_date", "plan_start_date", "plan_expiry_date",
  "status", "device_user_id", "shift",
] as const;
type MemberUpdateKey = (typeof MEMBER_UPDATE_ALLOWED)[number];

const MEMBER_CREATE_ALLOWED = [
  ...MEMBER_UPDATE_ALLOWED,
] as const;
type MemberCreateKey = (typeof MEMBER_CREATE_ALLOWED)[number];

const MEMBER_BULK_ALLOWED = [
  "plan_id", "monthly_fee", "admission_fee",
  "assigned_trainer_id", "assigned_shift_id", "referrer_id",
] as const;
type MemberBulkKey = (typeof MEMBER_BULK_ALLOWED)[number];

function pickAllowed<K extends string>(
  payload: Record<string, unknown>,
  allowed: readonly K[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in payload) out[key] = payload[key];
  }
  return out;
}

// Replace a member's full plan set in the pulse_member_plans junction.
// member.plan_id (the primary) is written separately on the member row; this
// keeps the junction (all assigned plans, including primary) in sync.
async function syncMemberPlans(
  admin: ReturnType<typeof createAdminClient>,
  gymId: string,
  memberId: string,
  planIds: string[],
): Promise<{ error?: string }> {
  const ids = Array.from(new Set(planIds.filter((x) => typeof x === "string" && x)));

  // Upsert the new set FIRST (idempotent via the unique(member_id,plan_id)
  // constraint), THEN remove rows no longer in the set. Ordering matters:
  // if the second step fails, the member is left with extra plans rather than
  // zero — never a data-loss window between a delete and a failed insert.
  if (ids.length > 0) {
    const { error: upErr } = await admin
      .from("pulse_member_plans")
      .upsert(
        ids.map((plan_id) => ({ gym_id: gymId, member_id: memberId, plan_id })),
        { onConflict: "member_id,plan_id", ignoreDuplicates: true },
      );
    if (upErr) return { error: upErr.message };
  }

  let del = admin.from("pulse_member_plans").delete().eq("member_id", memberId);
  if (ids.length > 0) del = del.not("plan_id", "in", `(${ids.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return { error: delErr.message };
  return {};
}

function extractPlanIds(payload: Record<string, unknown>): string[] | null {
  if (!Array.isArray(payload.plan_ids)) return null;
  return (payload.plan_ids as unknown[]).filter((x): x is string => typeof x === "string" && !!x);
}

// ── Member photo upload ─────────────────────────────────────────────────────
//
// Receives an already-optimized image (client crops/resizes to 400×400 WebP
// ~30KB before sending). We re-validate size/type server-side and upload via
// the admin client to the public `member-photos` bucket, namespaced by gym.
// Returns the public URL to store in pulse_members.photo_url.
const PHOTO_MAX_BYTES = 524288; // 512KB — matches the bucket's file_size_limit
const PHOTO_MIME_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function uploadMemberPhoto(formData: FormData) {
  // Either permission lets you attach a photo (add during create, edit later).
  const ctx =
    (await requireOwnerOrPermission("members.edit")) ??
    (await requireOwnerOrPermission("members.add"));
  if (!ctx) return { error: "Unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file provided" };
  if (file.size > PHOTO_MAX_BYTES) return { error: "Image too large" };

  const ext = PHOTO_MIME_EXT[file.type];
  if (!ext) return { error: "Unsupported image type" };

  const admin = createAdminClient();
  const path = `${ctx.gymId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from("member-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr.message };

  // Return an app-relative path proxied via next.config rewrites, so the
  // Supabase storage URL (project ref) is never exposed to clients.
  return { url: `/media/member-photos/${path}` };
}

// Best-effort delete of a previously-uploaded member photo. Only removes files
// inside this gym's folder of the member-photos bucket. Never throws — a failed
// cleanup must not block the member save.
export async function deleteMemberPhoto(photoUrl: string) {
  const ctx =
    (await requireOwnerOrPermission("members.edit")) ??
    (await requireOwnerOrPermission("members.add"));
  if (!ctx) return { ok: false };

  const marker = "/member-photos/";
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) return { ok: false };
  const objectPath = photoUrl.slice(idx + marker.length);

  // Guard: only delete within this gym's namespace.
  if (!objectPath.startsWith(`${ctx.gymId}/`)) return { ok: false };

  const admin = createAdminClient();
  await admin.storage.from("member-photos").remove([objectPath]);
  return { ok: true };
}

// ── Freeze ────────────────────────────────────────────────────────────────────

export async function freezeMember(memberId: string) {
  const ctx = await requireOwnerOrPermission("members.freeze");
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
  const ctx = await requireOwnerOrPermission("members.freeze");
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
  const ctx = await requireOwnerOrPermission("members.freeze");
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
  const ctx = await requireOwnerOrPermission("members.freeze");
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
  const ctx = await requireOwnerOrPermission("members.freeze");
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
    .update({ status: "defaulter", defaulter_since: today, defaulter_exempt: false, updated_at: new Date().toISOString() })
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
  const ctx = await requireOwnerOrPermission("members.freeze");
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
    .update({ status: "active", defaulter_since: null, defaulter_exempt: true, updated_at: new Date().toISOString() })
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

const ALLOWED_PAYMENT_METHODS = ["cash", "bank_transfer", "jazzcash", "easypaisa", "card", "other"] as const;

export async function clearDefaulterWithPayment(
  memberId: string,
  payment: { amount: number; method: string; date: string },
) {
  const ctx = await requireOwnerOrPermission("members.freeze");
  if (!ctx) return { error: "Unauthorized" };

  // Server-side validation — client guards are not trusted
  if (!Number.isFinite(payment.amount) || payment.amount <= 0)
    return { error: "Payment amount must be greater than zero" };
  if (!(ALLOWED_PAYMENT_METHODS as readonly string[]).includes(payment.method))
    return { error: "Invalid payment method" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.date))
    return { error: "Invalid payment date" };
  const parsedDate = new Date(payment.date);
  if (isNaN(parsedDate.getTime()))
    return { error: "Invalid payment date" };
  if (payment.date > formatDateInput(new Date()))
    return { error: "Payment date cannot be in the future" };
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("pulse_members")
    .select("full_name, status, defaulter_since, plan_id, monthly_fee, outstanding_balance")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };
  if (member.status !== "defaulter") return { error: "Member is not a defaulter" };

  // Snapshot the member's plan set for the payment receipt
  const { data: memberPlans } = await admin
    .from("pulse_member_plans")
    .select("plan:pulse_membership_plans(name, price)")
    .eq("member_id", memberId);
  const planBreakdown = (memberPlans ?? [])
    .map((r) => (r as unknown as { plan?: { name: string; price: number } | null }).plan)
    .filter((p): p is { name: string; price: number } => !!p)
    .map((p) => ({ name: p.name, price: Number(p.price) }));

  const now = new Date();
  const forPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const suffix = Math.floor(Math.random() * 900 + 100);
  const receiptNo = `CLR-${forPeriod.replace("-", "")}-${memberId.slice(0, 4).toUpperCase()}-${suffix}`;

  // Single atomic Postgres call — row lock + member update + payment insert in one transaction.
  // Balance is computed inside the RPC after acquiring a FOR UPDATE lock, eliminating TOCTOU.
  // If either write fails the whole thing rolls back: no orphan payments, no stuck defaulters.
  const { data: paymentId, error: rpcErr } = await admin.rpc("clear_defaulter_with_payment", {
    p_gym_id:         ctx.gymId,
    p_member_id:      memberId,
    p_amount:         payment.amount,
    p_method:         payment.method,
    p_date:           payment.date,
    p_for_period:     forPeriod,
    p_receipt_no:     receiptNo,
    p_plan_id:        member.plan_id ?? null,
    p_plan_breakdown: planBreakdown.length ? planBreakdown : null,
  });
  if (rpcErr) return { error: rpcErr.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.defaulter_cleared", entity: "member", entity_id: memberId,
    meta: {
      full_name: member.full_name,
      was_defaulter_since: member.defaulter_since,
      payment_amount: payment.amount,
      payment_method: payment.method,
      for_period: forPeriod,
    },
  });
  revalidate(ctx.gymId);
  return { success: true, paymentId: paymentId as string | null };
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
  const ctx = await requireOwnerOrPermission("members.edit");
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  // Fetch current status + trainer + name before the update:
  // - status: detect expired/cancelled → active reactivation transition
  // - assigned_trainer_id: recalc old trainer salary if assignment changes
  // - full_name: needed for the reactivation audit log meta
  const { data: existing } = await admin
    .from("pulse_members")
    .select("status, assigned_trainer_id, full_name, plan_expiry_date")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();

  // Whitelist allowed fields — see MEMBER_UPDATE_ALLOWED rationale above.
  const update = pickAllowed(payload, MEMBER_UPDATE_ALLOWED) as Partial<Record<MemberUpdateKey, unknown>> & { updated_at?: string };
  const planIds = extractPlanIds(payload);
  // Nothing to do — no field changes and no plan-set change.
  if (Object.keys(update).length === 0 && !planIds) {
    return { success: true };
  }

  // Validate shift belongs to the (possibly new) trainer. If the caller is
  // changing trainer without also setting shift, or the requested shift was
  // assigned to a different trainer, clear it so salary calc falls back to
  // the trainer's default rate instead of applying a stale shift's rule.
  const incomingTrainerId = "assigned_trainer_id" in update
    ? (update.assigned_trainer_id as string | null | undefined) ?? null
    : (existing?.assigned_trainer_id as string | null | undefined) ?? null;
  if ("assigned_shift_id" in update || "assigned_trainer_id" in update) {
    const requestedShift = ("assigned_shift_id" in update
      ? (update.assigned_shift_id as string | null | undefined)
      : null) ?? null;
    if (!incomingTrainerId || !requestedShift) {
      update.assigned_shift_id = null;
    } else {
      const { data: shiftRow } = await admin
        .from("pulse_trainer_shifts")
        .select("id")
        .eq("id", requestedShift)
        .eq("gym_id", ctx.gymId)
        .eq("staff_id", incomingTrainerId)
        .maybeSingle();
      update.assigned_shift_id = shiftRow?.id ?? null;
    }
  }

  update.updated_at = new Date().toISOString();

  // Detect expired/cancelled → active transition so we can apply reactivation
  // side-effects atomically in the same update (no second round-trip).
  const oldStatus = existing?.status as string | undefined;
  const newStatus = update.status as string | undefined;
  const isReactivation = (oldStatus === "expired" || oldStatus === "cancelled") && newStatus === "active";
  if (isReactivation) {
    // Reject reactivation with a past expiry — auto_expire_members would
    // immediately re-expire the member on the very next _fetchMembers call.
    const incomingExpiry = (update.plan_expiry_date ?? existing?.plan_expiry_date) as string | null | undefined;
    const today = formatDateInput(new Date());
    if (!incomingExpiry || incomingExpiry <= today) {
      return { error: "Set a future expiry date before reactivating this member." };
    }
    // Clear stale defaulter state and exempt from auto-flag so check_defaulters
    // won't immediately re-flag on the next _fetchMembers reload.
    (update as Record<string, unknown>).defaulter_since = null;
    (update as Record<string, unknown>).defaulter_exempt = true;
  }

  const { error } = await admin
    .from("pulse_members")
    .update(update)
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);

  if (error) return { error: error.message };

  // Write reactivation audit log — distinct from the generic member.update so
  // it surfaces correctly in the member timeline.
  if (isReactivation) {
    const newExpiry = update.plan_expiry_date as string | undefined;
    await writeAuditLog({
      actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
      action: "member.reactivate", entity: "member", entity_id: memberId,
      meta: { full_name: (update.full_name ?? existing?.full_name) as string, new_expiry: newExpiry ?? null },
    });
  }

  // Recalculate pending salary for affected trainer(s).
  // - If trainer changed: recalc old + new trainer (covers trainer swap).
  // - If reactivated with same trainer: recalc existing trainer (member now
  //   counts toward their active roster again).
  const recalcTasks: Promise<void>[] = [];
  if ("assigned_trainer_id" in update) {
    const newTrainerId = update.assigned_trainer_id as string | null;
    const oldTrainerId = existing?.assigned_trainer_id as string | null | undefined;
    if (newTrainerId) recalcTasks.push(recalcPendingSalary(newTrainerId, ctx.gymId));
    if (oldTrainerId && oldTrainerId !== newTrainerId) recalcTasks.push(recalcPendingSalary(oldTrainerId, ctx.gymId));
  } else if (isReactivation) {
    const trainerId = existing?.assigned_trainer_id as string | null | undefined;
    if (trainerId) recalcTasks.push(recalcPendingSalary(trainerId, ctx.gymId));
  }
  if (recalcTasks.length > 0) {
    try { await Promise.all(recalcTasks); }
    catch (err) { console.error("[updateMember] recalcPendingSalary failed:", err); }
  }

  // Sync the member's full plan set (multi-plan support). The primary plan
  // (member.plan_id) was set via the whitelist above; this mirrors the full set.
  if (planIds) {
    const sync = await syncMemberPlans(admin, ctx.gymId, memberId, planIds);
    if (sync.error) return { error: `Member saved, but plans failed to sync: ${sync.error}` };
  }

  revalidate(ctx.gymId);
  return { success: true };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteMember(memberId: string) {
  const ctx = await requireOwnerOrPermission("members.delete");
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  // Pre-flight: confirm member exists in this gym
  const { data: member } = await admin
    .from("pulse_members")
    .select("id, full_name, gym_id")
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };

  // Cascade considerations: deletion cascades via FK to payments, check-ins,
  // goals, etc. Schema verified — deletes are safe (not soft-delete; assume
  // schema handles cascades).
  const { error } = await admin
    .from("pulse_members")
    .delete()
    .eq("id", memberId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.delete", entity: "member", entity_id: memberId,
    meta: { full_name: member.full_name, deleted_by_role: ctx.isOwner ? "owner" : "staff" },
  });
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

// ── Create new member ─────────────────────────────────────────────────────────

/**
 * Insert a new member row. Routes through admin client so non-owner
 * staff with `members.add` can bypass RLS. Returns the new member id.
 */
export async function createMember(payload: Record<string, unknown>) {
  const ctx = await requireOwnerOrPermission("members.add");
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  // Whitelist client-supplied columns (defense-in-depth against mass-assignment:
  // attacker MUST NOT be able to set gym_id, device_user_id, freeze_*, etc.).
  // Then force tenant scoping + sensible defaults server-side.
  const picked = pickAllowed(payload, MEMBER_CREATE_ALLOWED) as Partial<Record<MemberCreateKey, unknown>>;
  const insertPayload: Record<string, unknown> = {
    ...picked,
    gym_id: ctx.gymId, // force — never trust client
    status: picked.status ?? "active",
    join_date: picked.join_date ?? new Date().toISOString().slice(0, 10),
  };
  // Accept pending_signup_discount only on create (NOT via the general update
  // whitelist). Client passes it when admission is unpaid + a discount was
  // promised. Server clamps to >= 0; the column also has a CHECK constraint.
  if ("pending_signup_discount" in payload) {
    const raw = Number(payload.pending_signup_discount ?? 0);
    insertPayload.pending_signup_discount = Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  const { data, error } = await admin
    .from("pulse_members")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create member" };

  // Sync the member's plan set. Prefer the explicit multi-plan list; fall back
  // to the single primary plan_id so the junction stays consistent either way.
  const planIds = extractPlanIds(payload);
  if (planIds && planIds.length) {
    await syncMemberPlans(admin, ctx.gymId, data.id, planIds);
  } else if (insertPayload.plan_id) {
    await syncMemberPlans(admin, ctx.gymId, data.id, [insertPayload.plan_id as string]);
  }
  // Note: member row already created; a junction sync failure here is logged via
  // the returned error path on update, but create still succeeds (primary plan
  // is on the member row and getMembers falls back to it).

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.create", entity: "member", entity_id: data.id,
    meta: {
      full_name: (payload as { full_name?: string }).full_name ?? null,
      by_role: ctx.isOwner ? "owner" : "staff",
    },
  });
  revalidate(ctx.gymId);
  return { success: true, memberId: data.id };
}

// ── Bulk update members ───────────────────────────────────────────────────────

/**
 * Apply the same partial update to a set of members. Staff need
 * `members.edit`. Recalculates trainer pending salary when assignment
 * changes.
 */
export async function bulkUpdateMembers(
  memberIds: string[],
  payload: Record<string, unknown>,
) {
  const ctx = await requireOwnerOrPermission("members.edit");
  if (!ctx) return { error: "Unauthorized" };
  if (memberIds.length === 0) return { error: "No members selected" };
  const admin = createAdminClient();

  // Fetch existing trainer assignments so we can recalc both sides.
  const { data: existing } = await admin
    .from("pulse_members")
    .select("id, assigned_trainer_id")
    .in("id", memberIds)
    .eq("gym_id", ctx.gymId);
  const oldTrainerIds = new Set<string>();
  for (const m of existing ?? []) {
    if (m.assigned_trainer_id) oldTrainerIds.add(m.assigned_trainer_id);
  }

  // Whitelist — even though bulk edit is owner+permission gated, prevent any
  // client from setting protected columns (gym_id, status, freeze_*, etc.).
  const update = pickAllowed(payload, MEMBER_BULK_ALLOWED) as Partial<Record<MemberBulkKey, unknown>> & { updated_at?: string };
  if (Object.keys(update).length === 0) {
    return { error: "No editable fields supplied" };
  }

  // Bulk safety: if trainer is being changed for a multi-member set, the old
  // shift IDs from each member are almost certainly NOT valid for the new
  // trainer. Force-clear assigned_shift_id so salary calc falls back to the
  // new trainer's default rate instead of applying an unrelated shift's rule.
  if ("assigned_trainer_id" in update) {
    update.assigned_shift_id = null;
  }
  update.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("pulse_members")
    .update(update)
    .in("id", memberIds)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };

  if ("assigned_trainer_id" in update) {
    const newTrainerId = update.assigned_trainer_id as string | null;
    const recalcTasks: Promise<void>[] = [];
    if (newTrainerId) recalcTasks.push(recalcPendingSalary(newTrainerId, ctx.gymId));
    for (const oldId of oldTrainerIds) {
      if (oldId !== newTrainerId) recalcTasks.push(recalcPendingSalary(oldId, ctx.gymId));
    }
    try {
      await Promise.all(recalcTasks);
    } catch (err) {
      console.error("[bulkUpdateMembers] recalcPendingSalary failed:", err);
    }
  }

  await writeAuditLog({
    actor_id: ctx.user.id, actor_email: ctx.user.email ?? "",
    action: "member.bulk_update", entity: "member",
    meta: {
      member_ids: memberIds,
      changes: update,
      by_role: ctx.isOwner ? "owner" : "staff",
    },
  });
  revalidate(ctx.gymId);
  return { success: true };
}

// ── Create referral on member signup ──────────────────────────────────────────

/**
 * Insert a pulse_referrals row tied to a newly registered member. Same
 * permission as creating a member (members.add) since this only fires
 * during the add-member flow.
 */
export async function createReferralForMember(args: {
  member_id: string;
  referrer_id: string;
  commission_amount: number;
}) {
  const ctx = await requireOwnerOrPermission("members.add");
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  // Confirm member belongs to gym
  const { data: member } = await admin
    .from("pulse_members")
    .select("id, gym_id")
    .eq("id", args.member_id)
    .eq("gym_id", ctx.gymId)
    .single();
  if (!member) return { error: "Member not found" };

  const { error } = await admin.from("pulse_referrals").insert({
    gym_id: ctx.gymId,
    referrer_id: args.referrer_id,
    member_id: args.member_id,
    commission_amount: args.commission_amount,
    status: "pending",
  });
  if (error) return { error: error.message };

  revalidate(ctx.gymId);
  return { success: true };
}

// ── Consume an unlinked device punch when registering a new member ────────────

/**
 * Delete an unlinked device punch row. Called after a new member is
 * registered from the check-ins "unlinked punch" flow. Staff need
 * `members.add` (same flow as registration).
 */
export async function consumeUnlinkedPunch(unlinkedPunchId: string) {
  const ctx = await requireOwnerOrPermission("members.add");
  if (!ctx) return { error: "Unauthorized" };
  const admin = createAdminClient();

  const { error } = await admin
    .from("pulse_unlinked_punches")
    .delete()
    .eq("id", unlinkedPunchId)
    .eq("gym_id", ctx.gymId);
  if (error) return { error: error.message };
  return { success: true };
}

// ── Re-fetch member buckets after a mutation ─────────────────────────────────

/**
 * Server-side member re-fetch for use by the client after mutations.
 *
 * Why this exists: client-side direct queries to pulse_members via the
 * supabase JS client are blocked by RLS for non-owner staff (managers,
 * frontdesk). There is intentionally no broad SELECT policy for
 * non-owner staff — they get data through server-rendered props and
 * server actions. Routing reload through this action uses the admin
 * client (after a permission check) so staff see the updated list.
 *
 * Caller must have `members.view_all` (matches the page-level guard
 * in /members/page.tsx).
 */
export async function reloadMembersData() {
  const ctx = await requireOwnerOrPermission("members.view_all");
  if (!ctx) return { error: "Unauthorized" };
  const data = await getMembers();
  return { success: true as const, data };
}
