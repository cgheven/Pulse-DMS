"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("pulse_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) throw new Error("Forbidden: admin access required");
  return user;
}

export interface GymWithOwner {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  total_capacity: number;
  device_serial: string | null;
  device_last_seen: string | null;
  created_at: string;
  updated_at: string;
  owner_name: string | null;
  owner_email: string;
}

export interface GetAdminGymsResult {
  gyms?: GymWithOwner[];
  error?: string;
}

export async function getAdminGyms(): Promise<GetAdminGymsResult> {
  return listAllGyms();
}

export async function listAllGyms(): Promise<{ gyms?: GymWithOwner[]; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const [gymsRes, profilesRes, authRes] = await Promise.all([
      admin.from("pulse_gyms").select("*").order("created_at", { ascending: false }),
      admin.from("pulse_profiles").select("id, full_name"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    if (gymsRes.error) throw gymsRes.error;

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const authMap = new Map((authRes.data?.users ?? []).map((u) => [u.id, u]));

    const gyms: GymWithOwner[] = (gymsRes.data ?? []).map((g) => ({
      ...g,
      owner_name: profileMap.get(g.owner_id)?.full_name ?? null,
      owner_email: authMap.get(g.owner_id)?.email ?? "",
    }));

    return { gyms };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list gyms" };
  }
}

export async function createGym(data: {
  owner_id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  total_capacity?: number;
}): Promise<{ gymId?: string; error?: string }> {
  try {
    const caller = await requireAdmin();
    if (!data.owner_id || !data.name) throw new Error("Owner and name are required");

    const admin = createAdminClient();
    const { data: gym, error } = await admin
      .from("pulse_gyms")
      .insert({
        owner_id: data.owner_id,
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        email: data.email || null,
        total_capacity: data.total_capacity ?? 0,
      })
      .select("id")
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_id: caller.id, actor_email: caller.email ?? "",
      action: "gym.create", entity: "gym", entity_id: gym.id,
      meta: { name: data.name, owner_id: data.owner_id },
    });

    return { gymId: gym.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create gym" };
  }
}

export async function updateGym(data: {
  gymId: string;
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  total_capacity?: number;
}): Promise<{ error?: string }> {
  try {
    const caller = await requireAdmin();
    const admin = createAdminClient();
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.address !== undefined) updates.address = data.address || null;
    if (data.phone !== undefined) updates.phone = data.phone || null;
    if (data.email !== undefined) updates.email = data.email || null;
    if (data.total_capacity !== undefined) updates.total_capacity = data.total_capacity;

    const { error } = await admin.from("pulse_gyms").update(updates).eq("id", data.gymId);
    if (error) throw error;

    await writeAuditLog({
      actor_id: caller.id, actor_email: caller.email ?? "",
      action: "gym.update", entity: "gym", entity_id: data.gymId,
      meta: { changes: updates },
    });

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update gym" };
  }
}

export async function deleteGym(gymId: string): Promise<{ error?: string }> {
  try {
    const caller = await requireAdmin();
    const admin = createAdminClient();

    const { data: gym } = await admin
      .from("pulse_gyms")
      .select("owner_id, name")
      .eq("id", gymId)
      .single();
    if (!gym) throw new Error("Gym not found");

    const { error } = await admin.from("pulse_gyms").delete().eq("id", gymId);
    if (error) throw error;

    await writeAuditLog({
      actor_id: caller.id, actor_email: caller.email ?? "",
      action: "gym.delete", entity: "gym", entity_id: gymId,
      meta: { name: gym.name, owner_id: gym.owner_id },
    });

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete gym" };
  }
}

export async function listOwners(): Promise<{
  owners?: { id: string; name: string; email: string }[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const [profilesRes, authRes] = await Promise.all([
      admin.from("pulse_profiles").select("id, full_name").order("full_name"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    const authMap = new Map((authRes.data?.users ?? []).map((u) => [u.id, u]));
    const owners = (profilesRes.data ?? [])
      .map((p) => ({
        id: p.id,
        name: p.full_name ?? "",
        email: authMap.get(p.id)?.email ?? "",
      }))
      .filter((o) => o.email);

    return { owners };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list owners" };
  }
}
