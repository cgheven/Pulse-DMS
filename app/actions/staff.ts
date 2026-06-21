"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, syntheticEmailFromPhone } from "@/lib/phone";
import { isUUID } from "@/lib/utils";
import type { Staff, DmsStaffRole } from "@/types";

const VALID_ROLES = new Set<DmsStaffRole>(["manager","sales","cashier","stock","accountant","driver","other"]);

const CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generatePassword(len = 10): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let p = "";
  for (let i = 0; i < len; i++) p += CHARSET[buf[i] % CHARSET.length];
  return p;
}

async function requireShopOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("dms_profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "owner") throw new Error("Not authorized");
  if (!profile.shop_id) throw new Error("No shop found");
  return { userId: user.id, shopId: profile.shop_id as string };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as any).message);
  return String(e);
}

export async function listStaff(): Promise<{ staff: Staff[]; error?: string }> {
  try {
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dms_staff")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { staff: (data ?? []) as Staff[] };
  } catch (e) {
    return { staff: [], error: errMsg(e) };
  }
}

export async function addStaff(input: {
  full_name: string;
  phone: string;
  role?: DmsStaffRole;
  notes?: string;
}): Promise<{ error?: string }> {
  try {
    const { shopId } = await requireShopOwner();
    const full_name = input.full_name.trim().slice(0, 100);
    const phone = input.phone.trim().slice(0, 20);
    const role: DmsStaffRole = (input.role && VALID_ROLES.has(input.role)) ? input.role : "sales";
    const notes = (input.notes ?? "").trim().slice(0, 500) || null;
    if (!full_name) return { error: "Name is required" };
    if (!phone) return { error: "Phone is required" };
    const admin = createAdminClient();
    const { error } = await admin.from("dms_staff").insert({ shop_id: shopId, full_name, phone, role, notes });
    if (error) throw error;
    revalidatePath("/staff");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function updateStaff(
  staffId: string,
  input: { full_name?: string; phone?: string; role?: DmsStaffRole; notes?: string; is_active?: boolean }
): Promise<{ error?: string }> {
  try {
    if (!isUUID(staffId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const updates: Record<string, unknown> = {};
    if (input.full_name !== undefined) updates.full_name = input.full_name.trim().slice(0, 100);
    if (input.phone !== undefined) updates.phone = input.phone.trim().slice(0, 20);
    if (input.role !== undefined && VALID_ROLES.has(input.role)) updates.role = input.role;
    if (input.notes !== undefined) updates.notes = input.notes.trim().slice(0, 500) || null;
    if (input.is_active !== undefined) updates.is_active = input.is_active;
    const admin = createAdminClient();
    const { error } = await admin.from("dms_staff").update(updates).eq("id", staffId).eq("shop_id", shopId);
    if (error) throw error;
    revalidatePath("/staff");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function deleteStaff(staffId: string): Promise<{ error?: string }> {
  try {
    if (!isUUID(staffId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: s } = await admin.from("dms_staff").select("profile_id").eq("id", staffId).eq("shop_id", shopId).single();
    if (s?.profile_id) {
      await admin.auth.admin.deleteUser(s.profile_id);
    }
    const { error } = await admin.from("dms_staff").delete().eq("id", staffId).eq("shop_id", shopId);
    if (error) throw error;
    revalidatePath("/staff");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function createStaffLogin(staffId: string, customPassword?: string): Promise<{
  password?: string;
  phone?: string;
  fullName?: string;
  error?: string;
}> {
  try {
    if (!isUUID(staffId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: s, error: fe } = await admin
      .from("dms_staff").select("*").eq("id", staffId).eq("shop_id", shopId).single();
    if (fe || !s) return { error: "Staff member not found" };
    if (s.profile_id) return { error: "Login already exists for this staff member" };
    const canonical = normalizePhone(s.phone);
    if (!canonical) return { error: "Invalid phone number. Use Pakistani format e.g. 0300-1234567" };
    const syntheticEmail = syntheticEmailFromPhone(canonical);
    if (customPassword !== undefined) {
      if (customPassword.length < 8) return { error: "Password must be at least 8 characters" };
      if (customPassword.length > 72) return { error: "Password must be 72 characters or fewer" };
    }
    const password = customPassword ?? generatePassword(10);
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: s.full_name },
    });
    if (authErr) {
      if (authErr.message.includes("already been registered")) return { error: "A login for this phone number already exists" };
      throw authErr;
    }
    const newUserId = authData.user.id;
    await admin.from("dms_profiles").update({ role: "staff", shop_id: shopId }).eq("id", newUserId);
    const { error: le } = await admin.from("dms_staff").update({ profile_id: newUserId }).eq("id", staffId).eq("shop_id", shopId);
    if (le) throw le;
    revalidatePath("/staff");
    return { password, phone: s.phone, fullName: s.full_name };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function revokeStaffLogin(staffId: string): Promise<{ error?: string }> {
  try {
    if (!isUUID(staffId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: s } = await admin.from("dms_staff").select("profile_id").eq("id", staffId).eq("shop_id", shopId).single();
    if (!s?.profile_id) return {};
    await admin.auth.admin.deleteUser(s.profile_id);
    await admin.from("dms_staff").update({ profile_id: null }).eq("id", staffId).eq("shop_id", shopId);
    revalidatePath("/staff");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function resetStaffPassword(staffId: string): Promise<{
  password?: string;
  phone?: string;
  fullName?: string;
  error?: string;
}> {
  try {
    if (!isUUID(staffId)) return { error: "Invalid ID" };
    const { shopId } = await requireShopOwner();
    const admin = createAdminClient();
    const { data: s } = await admin.from("dms_staff").select("profile_id, phone, full_name").eq("id", staffId).eq("shop_id", shopId).single();
    if (!s?.profile_id) return { error: "No login exists for this staff member" };
    const newPassword = generatePassword(10);
    const { error } = await admin.auth.admin.updateUserById(s.profile_id, { password: newPassword });
    if (error) throw error;
    return { password: newPassword, phone: s.phone, fullName: s.full_name };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
