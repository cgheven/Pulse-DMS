"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import type { AdminScope, AdminUser, StaffRole } from "@/types";

// ── Grouped types (for /admin/users redesign) ─────────────────────────────

export type AdminUserRow = {
  user_id: string | null;       // null when staff has no auth user linked
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: "owner" | StaffRole | "compliance" | "unassigned";
  is_admin: boolean;
  admin_scope?: AdminScope;     // only meaningful when is_admin === true
  is_demo: boolean;
  staff_id?: string | null;     // when this row is a staff record
  last_sign_in_at: string | null;
  created_at: string | null;
  // Multi-gym hints
  also_owns_count?: number;     // owner row: # of OTHER gyms also owned
  also_staff_at?: string[];     // owner row: names of OTHER gyms where they're staff
};

export type AdminGymGroup = {
  gym_id: string;
  gym_name: string;
  is_demo_gym: boolean;
  owner: AdminUserRow | null;   // null when gym has no owner (edge case)
  staff: AdminUserRow[];        // sorted by role priority
  totals: { owners: number; staff: number; total: number };
};

export type AdminUsersGrouped = {
  users: AdminUser[];           // flat list (kept for BranchManager dialog)
  groups: AdminGymGroup[];      // one per gym
  orphans: AdminUserRow[];      // users w/ no gym attached
};

// ── Guard ────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Use service role to bypass the recursive RLS policy on pulse_profiles
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("pulse_profiles")
    .select("is_admin, admin_scope")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Forbidden: admin access required");

  // Scope-tighten: every action in this file manages users/profiles/gyms.
  // Prospects-scope admins (e.g. marketing partners) must not call any of
  // these even via direct server-action POST. Page guards block the UI;
  // this guards the wire.
  const scope = (profile.admin_scope as AdminScope | null) ?? "full";
  if (scope !== "full") throw new Error("Forbidden: full admin required");

  return user;
}

// ── List Users ────────────────────────────────────────────────────────────────

export async function listAdminUsers(): Promise<{
  users?: AdminUser[];
  grouped?: AdminUsersGrouped;
  error?: string;
}> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const [authRes, profilesRes, gymsRes, staffRes, complianceRes] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin
        .from("pulse_profiles")
        .select("id, full_name, phone, is_admin, admin_scope, branch_limit, created_at, is_demo, demo_gym_id"),
      admin.from("pulse_gyms").select("owner_id, id, name, total_capacity"),
      admin
        .from("pulse_staff")
        .select("id, gym_id, full_name, role, phone, email, user_id, status, created_at"),
      admin
        .from("pulse_compliance_users")
        .select("id, gym_id, full_name, user_id, created_at"),
    ]);

    if (authRes.error) throw authRes.error;

    type ProfileRow = {
      id: string;
      full_name: string | null;
      phone: string | null;
      is_admin: boolean | null;
      admin_scope: AdminScope | null;
      branch_limit: number | null;
      created_at: string | null;
      is_demo: boolean | null;
      demo_gym_id: string | null;
    };
    type GymRow = { owner_id: string; id: string; name: string; total_capacity: number };
    type StaffRow = {
      id: string;
      gym_id: string;
      full_name: string;
      role: StaffRole;
      phone: string | null;
      email: string | null;
      user_id: string | null;
      status: string | null;
      created_at: string | null;
    };
    type ComplianceRow = {
      id: string;
      gym_id: string;
      full_name: string;
      user_id: string | null;
      created_at: string | null;
    };

    const profileRows = (profilesRes.data ?? []) as ProfileRow[];
    const gymRows = (gymsRes.data ?? []) as GymRow[];
    const staffRows = (staffRes.data ?? []) as StaffRow[];
    const complianceRows = (complianceRes.data ?? []) as ComplianceRow[];

    const profileMap = new Map(profileRows.map((p) => [p.id, p]));

    const gymsByOwner = new Map<string, { id: string; name: string; total_capacity: number }[]>();
    const gymById = new Map<string, GymRow>();
    for (const g of gymRows) {
      gymById.set(g.id, g);
      if (!gymsByOwner.has(g.owner_id)) gymsByOwner.set(g.owner_id, []);
      gymsByOwner.get(g.owner_id)!.push({ id: g.id, name: g.name, total_capacity: g.total_capacity });
    }

    // Demo gym ids = any gym that an is_demo profile points at via demo_gym_id
    const demoGymIds = new Set<string>(
      profileRows.filter((p) => p.is_demo && p.demo_gym_id).map((p) => p.demo_gym_id as string),
    );

    // Build flat AdminUser[] (preserved for BranchManager dialog)
    const users: AdminUser[] = authRes.data.users.map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        is_admin: profile?.is_admin ?? false,
        admin_scope: (profile?.admin_scope ?? "full") as AdminScope,
        branch_limit: profile?.branch_limit ?? 1,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        gyms: gymsByOwner.get(u.id) ?? [],
      };
    });

    // Auth lookup helpers
    const authByUserId = new Map<string, { email: string | null; created_at: string | null; last_sign_in_at: string | null }>();
    for (const au of authRes.data.users) {
      authByUserId.set(au.id, {
        email: au.email ?? null,
        created_at: au.created_at ?? null,
        last_sign_in_at: au.last_sign_in_at ?? null,
      });
    }

    // Staff role priority (manager → frontdesk → trainer → cleaner → guard → cook → other)
    const rolePriority: Record<string, number> = {
      manager: 1, frontdesk: 2, trainer: 3, cleaner: 4, guard: 5, cook: 6, other: 7, compliance: 8,
    };

    // Track which user_ids appear as staff at which gyms (for owner cross-references)
    const staffByUserId = new Map<string, { gym_id: string; gym_name: string }[]>();
    for (const s of staffRows) {
      if (!s.user_id) continue;
      if (!staffByUserId.has(s.user_id)) staffByUserId.set(s.user_id, []);
      staffByUserId
        .get(s.user_id)!
        .push({ gym_id: s.gym_id, gym_name: gymById.get(s.gym_id)?.name ?? "—" });
    }

    // Build groups
    const groups: AdminGymGroup[] = [];
    // Stable order: by gym name
    const sortedGyms = [...gymRows].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    // Track which user_ids are accounted for (have a section) so we can compute orphans
    const accountedUserIds = new Set<string>();

    for (const g of sortedGyms) {
      // Owner row
      const ownerProfile = profileMap.get(g.owner_id);
      const ownerAuth = authByUserId.get(g.owner_id);
      const ownerOtherGymCount = (gymsByOwner.get(g.owner_id)?.length ?? 0) - 1;
      const ownerStaffElsewhere = (staffByUserId.get(g.owner_id) ?? [])
        .filter((r) => r.gym_id !== g.id)
        .map((r) => r.gym_name);

      const ownerRow: AdminUserRow | null = ownerAuth
        ? {
            user_id: g.owner_id,
            email: ownerAuth.email,
            full_name: ownerProfile?.full_name ?? null,
            phone: ownerProfile?.phone ?? null,
            role: "owner",
            is_admin: ownerProfile?.is_admin ?? false,
            admin_scope: (ownerProfile?.admin_scope ?? "full") as AdminScope,
            is_demo: ownerProfile?.is_demo ?? false,
            last_sign_in_at: ownerAuth.last_sign_in_at,
            created_at: ownerAuth.created_at,
            also_owns_count: ownerOtherGymCount > 0 ? ownerOtherGymCount : undefined,
            also_staff_at: ownerStaffElsewhere.length > 0 ? ownerStaffElsewhere : undefined,
          }
        : null;

      if (ownerRow?.user_id) accountedUserIds.add(ownerRow.user_id);

      // Staff rows for this gym
      const gymStaff: AdminUserRow[] = staffRows
        .filter((s) => s.gym_id === g.id && s.status !== "inactive")
        .map((s) => {
          const sAuth = s.user_id ? authByUserId.get(s.user_id) : null;
          const sProfile = s.user_id ? profileMap.get(s.user_id) : null;
          if (s.user_id) accountedUserIds.add(s.user_id);
          return {
            user_id: s.user_id,
            email: sAuth?.email ?? s.email ?? null,
            full_name: s.full_name ?? sProfile?.full_name ?? null,
            phone: s.phone ?? sProfile?.phone ?? null,
            role: s.role,
            is_admin: sProfile?.is_admin ?? false,
            admin_scope: (sProfile?.admin_scope ?? "full") as AdminScope,
            is_demo: sProfile?.is_demo ?? false,
            staff_id: s.id,
            last_sign_in_at: sAuth?.last_sign_in_at ?? null,
            created_at: s.created_at,
          };
        });

      // Compliance users for this gym → treat as staff with role 'compliance'
      const gymCompliance: AdminUserRow[] = complianceRows
        .filter((c) => c.gym_id === g.id)
        .map((c) => {
          const cAuth = c.user_id ? authByUserId.get(c.user_id) : null;
          const cProfile = c.user_id ? profileMap.get(c.user_id) : null;
          if (c.user_id) accountedUserIds.add(c.user_id);
          return {
            user_id: c.user_id,
            email: cAuth?.email ?? null,
            full_name: c.full_name ?? cProfile?.full_name ?? null,
            phone: cProfile?.phone ?? null,
            role: "compliance" as const,
            is_admin: cProfile?.is_admin ?? false,
            admin_scope: (cProfile?.admin_scope ?? "full") as AdminScope,
            is_demo: cProfile?.is_demo ?? false,
            last_sign_in_at: cAuth?.last_sign_in_at ?? null,
            created_at: c.created_at,
          };
        });

      const staff = [...gymStaff, ...gymCompliance].sort((a, b) => {
        const pa = rolePriority[a.role] ?? 99;
        const pb = rolePriority[b.role] ?? 99;
        if (pa !== pb) return pa - pb;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      });

      groups.push({
        gym_id: g.id,
        gym_name: g.name,
        is_demo_gym: demoGymIds.has(g.id),
        owner: ownerRow,
        staff,
        totals: {
          owners: ownerRow ? 1 : 0,
          staff: staff.length,
          total: (ownerRow ? 1 : 0) + staff.length,
        },
      });
    }

    // Orphans: auth users not part of any gym (not owner, not staff, not compliance)
    const orphans: AdminUserRow[] = authRes.data.users
      .filter((u) => !accountedUserIds.has(u.id))
      .map((u) => {
        const profile = profileMap.get(u.id);
        return {
          user_id: u.id,
          email: u.email ?? null,
          full_name: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          role: "unassigned" as const,
          is_admin: profile?.is_admin ?? false,
          admin_scope: (profile?.admin_scope ?? "full") as AdminScope,
          is_demo: profile?.is_demo ?? false,
          last_sign_in_at: u.last_sign_in_at ?? null,
          created_at: u.created_at ?? null,
        };
      })
      .sort((a, b) => (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));

    return {
      users,
      grouped: { users, groups, orphans },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list users" };
  }
}

// ── Create User (with password) ───────────────────────────────────────────────

export async function createUserWithPassword(data: {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  branch_limit?: number;
}): Promise<{ userId?: string; error?: string }> {
  try {
    const caller = await requireAdmin();

    if (!data.email || !data.password || data.password.length < 8) {
      throw new Error("Email and password (min 8 chars) are required");
    }

    const admin = createAdminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });

    if (error) throw error;

    // Upsert profile — auth trigger may not fire for admin-created users
    const branchLimit = data.branch_limit && data.branch_limit >= 1 ? data.branch_limit : 1;
    await admin.from("pulse_profiles").upsert(
      {
        id: created.user.id,
        full_name: data.full_name || null,
        phone: data.phone?.trim() || null,
        branch_limit: branchLimit,
      },
      { onConflict: "id" }
    );
    revalidateTag(`profile-${created.user.id}`);

    await writeAuditLog({
      actor_id: caller.id, actor_email: caller.email ?? "",
      action: "user.create", entity: "user", entity_id: created.user.id,
      meta: { email: data.email, full_name: data.full_name },
    });

    return { userId: created.user.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create user" };
  }
}

// ── Invite User (magic link via email) ───────────────────────────────────────

export async function inviteUser(data: {
  email: string;
  full_name: string;
  branch_limit?: number;
}): Promise<{ error?: string }> {
  try {
    const caller = await requireAdmin();

    if (!data.email) throw new Error("Email is required");

    const admin = createAdminClient();
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name },
    });

    if (error) throw error;

    // Upsert profile so the user appears in the admin panel immediately
    if (invited.user) {
      const branchLimit = data.branch_limit && data.branch_limit >= 1 ? data.branch_limit : 1;
      await admin.from("pulse_profiles").upsert(
        { id: invited.user.id, full_name: data.full_name || null, branch_limit: branchLimit },
        { onConflict: "id" }
      );
      revalidateTag(`profile-${invited.user.id}`);
    }

    await writeAuditLog({
      actor_id: caller.id, actor_email: caller.email ?? "",
      action: "user.invite", entity: "user", entity_id: invited.user?.id,
      meta: { email: data.email, full_name: data.full_name },
    });

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send invite" };
  }
}

// ── Update User ───────────────────────────────────────────────────────────────

export async function updateAdminUser(data: {
  userId: string;
  full_name?: string;
  phone?: string | null;
  email?: string;
  password?: string;
  is_admin?: boolean;
  branch_limit?: number;
}): Promise<{ error?: string }> {
  try {
    const caller = await requireAdmin();

    if (!data.userId) throw new Error("userId is required");
    if (data.password && data.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const admin = createAdminClient();

    // Update auth user (email / password)
    const authUpdates: { email?: string; password?: string } = {};
    if (data.email) authUpdates.email = data.email;
    if (data.password) authUpdates.password = data.password;

    if (Object.keys(authUpdates).length > 0) {
      const { error } = await admin.auth.admin.updateUserById(data.userId, authUpdates);
      if (error) throw error;
    }

    // Update profile (full_name, phone, is_admin, branch_limit)
    const profileUpdates: { full_name?: string; phone?: string | null; is_admin?: boolean; branch_limit?: number } = {};
    if (data.full_name !== undefined) profileUpdates.full_name = data.full_name;
    if (data.phone !== undefined) profileUpdates.phone = data.phone || null;
    if (data.branch_limit !== undefined && data.branch_limit >= 1) {
      profileUpdates.branch_limit = data.branch_limit;
    }
    // Prevent revoking own admin
    if (data.is_admin !== undefined && data.userId !== caller.id) {
      profileUpdates.is_admin = data.is_admin;
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error } = await admin
        .from("pulse_profiles")
        .update(profileUpdates)
        .eq("id", data.userId);
      if (error) throw error;
      revalidateTag(`profile-${data.userId}`);
    }

    const changes: Record<string, unknown> = {};
    if (data.email) changes.email = data.email;
    if (data.full_name !== undefined) changes.full_name = data.full_name;
    if (data.is_admin !== undefined) changes.is_admin = data.is_admin;
    if (data.branch_limit !== undefined) changes.branch_limit = data.branch_limit;
    if (data.password) changes.password = "***";
    await writeAuditLog({
      actor_id: caller.id, actor_email: caller.email ?? "",
      action: "user.update", entity: "user", entity_id: data.userId,
      meta: { changes },
    });

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update user" };
  }
}

// ── Delete User ───────────────────────────────────────────────────────────────

export async function deleteAdminUser(userId: string): Promise<{ error?: string }> {
  try {
    const caller = await requireAdmin();

    if (caller.id === userId) throw new Error("Cannot delete your own account");

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    revalidateTag(`profile-${userId}`);
    revalidateTag(`gyms-owner-${userId}`);

    await writeAuditLog({
      actor_id: caller.id, actor_email: caller.email ?? "",
      action: "user.delete", entity: "user", entity_id: userId,
    });

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete user" };
  }
}

// ── Reset Password ────────────────────────────────────────────────────────────

export async function resetUserPassword(data: {
  userId: string;
  newPassword: string;
}): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    if (data.newPassword.length < 8) throw new Error("Password must be at least 8 characters");

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });

    if (error) throw error;
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reset password" };
  }
}
