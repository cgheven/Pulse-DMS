"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, getComplianceSettingsForGym } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

export async function getComplianceSettingsAction() {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return null;
  return getComplianceSettingsForGym(ctx.gymId);
}

interface SaveSettingsInput {
  ntn?: string | null;
  fields?: string[];
  notes?: string | null;
  headerTitle?: string | null;
  taxRate?: number | null;
  taxInclusive?: boolean;
  taxLabel?: string | null;
}

export async function saveComplianceSettings(input: SaveSettingsInput) {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };
  const admin = createAdminClient();
  const reportSettings: Record<string, unknown> = {};
  if (input.fields !== undefined)       reportSettings.fields = input.fields;
  if (input.notes !== undefined)        reportSettings.notes = input.notes;
  if (input.headerTitle !== undefined)  reportSettings.headerTitle = input.headerTitle;
  if (input.taxRate !== undefined)      reportSettings.taxRate = input.taxRate;
  if (input.taxInclusive !== undefined) reportSettings.taxInclusive = input.taxInclusive;
  if (input.taxLabel !== undefined)     reportSettings.taxLabel = input.taxLabel;

  const { error } = await admin
    .from("pulse_gyms")
    .update({
      ...(input.ntn !== undefined ? { ntn: input.ntn } : {}),
      report_settings: reportSettings,
    })
    .eq("id", ctx.gymId);
  if (error) return { error: error.message };

  // Refresh owner's cached gyms list so updated settings show on next nav.
  const { data: gymRow } = await admin
    .from("pulse_gyms").select("owner_id").eq("id", ctx.gymId).single();
  if (gymRow?.owner_id) revalidateTag(`gyms-owner-${gymRow.owner_id}`);
  return { success: true };
}

interface LogReportInput {
  memberCount: number;
  totalRevenue: number;
  startDate: string;
  endDate: string;
  fields: string[];
}

export async function logComplianceReport(input: LogReportInput) {
  const ctx = await getAuthContext();
  if (!ctx?.gymId || !ctx.user) return { error: "Unauthorized" };
  await writeAuditLog({
    actor_id: ctx.user.id,
    actor_email: ctx.user.email ?? "",
    action: "compliance.report.generated",
    entity: "gym",
    entity_id: ctx.gymId,
    meta: {
      member_count: input.memberCount,
      total_revenue: input.totalRevenue,
      period: `${input.startDate} → ${input.endDate}`,
      fields: input.fields,
    },
  });
  return { success: true };
}

// ── Compliance Manager ────────────────────────────────────────────────────────

export async function createComplianceLogin(
  gymId: string,
  fullName: string,
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const ctx = await getAuthContext();
  if (!ctx?.gymId || ctx.gymId !== gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };
  if (!fullName.trim()) return { error: "Full name is required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const admin = createAdminClient();

  const { data: newUserData, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !newUserData?.user) {
    return { error: createError?.message ?? "Failed to create auth user" };
  }

  const newUser = newUserData.user;

  const { error: profileError } = await admin.from("pulse_profiles").upsert({
    id: newUser.id,
    email,
    full_name: fullName,
    role: "compliance",
  }, { onConflict: "id" });

  if (profileError) {
    await admin.auth.admin.deleteUser(newUser.id);
    return { error: profileError.message };
  }
  revalidateTag(`profile-${newUser.id}`);

  const { error: complianceError } = await admin
    .from("pulse_compliance_users")
    .insert({ gym_id: gymId, user_id: newUser.id, full_name: fullName });

  if (complianceError) {
    await admin.auth.admin.deleteUser(newUser.id);
    return { error: complianceError.message };
  }

  return { error: null };
}

export async function removeComplianceLogin(
  gymId: string,
): Promise<{ error: string | null }> {
  const ctx = await getAuthContext();
  if (!ctx?.gymId || ctx.gymId !== gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };

  const admin = createAdminClient();

  const { data: complianceUser, error: fetchError } = await admin
    .from("pulse_compliance_users")
    .select("user_id")
    .eq("gym_id", gymId)
    .single();

  if (fetchError || !complianceUser) {
    return { error: fetchError?.message ?? "Compliance login not found" };
  }

  const userId = complianceUser.user_id as string;

  const { error: deleteRowError } = await admin
    .from("pulse_compliance_users")
    .delete()
    .eq("gym_id", gymId);

  if (deleteRowError) return { error: deleteRowError.message };

  await admin.from("pulse_profiles").delete().eq("id", userId);
  revalidateTag(`profile-${userId}`);

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
  if (deleteAuthError) return { error: deleteAuthError.message };

  return { error: null };
}

export async function updateComplianceSettings(
  gymId: string,
  pctSelf: number,
  pctPt: number,
): Promise<{ error: string | null }> {
  const ctx = await getAuthContext();
  if (!ctx?.gymId || ctx.gymId !== gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };

  const clampedSelf = Math.min(100, Math.max(1, Math.round(pctSelf)));
  const clampedPt = Math.min(100, Math.max(1, Math.round(pctPt)));

  const admin = createAdminClient();

  const { error } = await admin
    .from("pulse_gyms")
    .update({ compliance_settings: { pct_self: clampedSelf, pct_pt: clampedPt } })
    .eq("id", gymId);

  if (error) return { error: error.message };

  // Refresh owner's cached gyms list so updated settings show on next nav.
  const { data: gymRow } = await admin
    .from("pulse_gyms").select("owner_id").eq("id", gymId).single();
  if (gymRow?.owner_id) revalidateTag(`gyms-owner-${gymRow.owner_id}`);

  revalidatePath("/compliance-portal");
  return { error: null };
}
