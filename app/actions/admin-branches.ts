"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";

// ── Cache tag ─────────────────────────────────────────────────────────────────

const CLIENTS_CACHE_TAG = "admin-dms-clients";

function branchesTag(shopId: string) {
  return `branches-shop-${shopId}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsBranch = {
  id: string;
  shop_id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateBranchInput = {
  shopId: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
};

// ── Admin guard (never cached) ────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("dms_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Forbidden: admin access required");

  return user;
}

// ── List branches for a shop (cached) ────────────────────────────────────────

function makeFetchBranchesForShop(shopId: string) {
  return unstable_cache(
    async (): Promise<DmsBranch[]> => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("dms_branches")
        .select("*")
        .eq("shop_id", shopId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) return [];
      return (data as DmsBranch[]) ?? [];
    },
    ["branches", shopId],
    { revalidate: 300, tags: [branchesTag(shopId)] }
  );
}

export async function adminListBranchesForShop(
  shopId: string
): Promise<{ branches: DmsBranch[]; error?: string }> {
  try {
    await requireAdmin();
    const branches = await makeFetchBranchesForShop(shopId)();
    return { branches };
  } catch (err) {
    return {
      branches: [],
      error: err instanceof Error ? err.message : "Failed to list branches",
    };
  }
}

// ── Create branch (admin bypasses branch_limit) ───────────────────────────────

export async function adminCreateBranch(
  input: CreateBranchInput
): Promise<{ branchId?: string; error?: string }> {
  try {
    const adminUser = await requireAdmin();
    const admin = createAdminClient();

    const { data: branch, error } = await admin
      .from("dms_branches")
      .insert({
        shop_id: input.shopId,
        name: input.name,
        city: input.city || null,
        address: input.address || null,
        phone: input.phone || null,
        is_active: true,
        is_default: input.isDefault ?? false,
      })
      .select("id")
      .single();

    if (error) throw error;

    revalidateTag(branchesTag(input.shopId));
    revalidateTag(CLIENTS_CACHE_TAG);

    return { branchId: branch.id };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to create branch",
    };
  }
}

// ── Update branch ─────────────────────────────────────────────────────────────

export async function adminUpdateBranch(
  branchId: string,
  updates: {
    name?: string;
    city?: string;
    address?: string;
    phone?: string;
    is_active?: boolean;
  }
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    // Fetch branch to get shop_id for cache invalidation
    const { data: existing } = await admin
      .from("dms_branches")
      .select("shop_id")
      .eq("id", branchId)
      .single();

    if (!existing) return { error: "Branch not found" };

    const { error } = await admin
      .from("dms_branches")
      .update(updates)
      .eq("id", branchId);

    if (error) throw error;

    revalidateTag(branchesTag(existing.shop_id));
    revalidateTag(CLIENTS_CACHE_TAG);

    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to update branch",
    };
  }
}

// ── Delete branch (cannot delete default branch) ──────────────────────────────

export async function adminDeleteBranch(
  branchId: string
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const { data: branch } = await admin
      .from("dms_branches")
      .select("is_default, shop_id, name")
      .eq("id", branchId)
      .single();

    if (!branch) return { error: "Branch not found" };
    if (branch.is_default) return { error: "Cannot delete the default branch" };

    const { error } = await admin
      .from("dms_branches")
      .delete()
      .eq("id", branchId);

    if (error) throw error;

    revalidateTag(branchesTag(branch.shop_id));
    revalidateTag(CLIENTS_CACHE_TAG);

    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to delete branch",
    };
  }
}

// ── Update shop branch_limit ──────────────────────────────────────────────────

export async function adminUpdateShopBranchLimit(
  shopId: string,
  branchLimit: number
): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    if (branchLimit < 1)
      return { error: "Branch limit must be at least 1" };

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_shops")
      .update({ branch_limit: branchLimit })
      .eq("id", shopId);

    if (error) throw error;

    revalidateTag(CLIENTS_CACHE_TAG);

    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to update branch limit",
    };
  }
}
