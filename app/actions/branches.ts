"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";
import { getAuthContext } from "@/lib/data";
import type { DmsBranch } from "@/types";

function branchesTag(shopId: string) {
  return `branches-shop-${shopId}`;
}

// Called by the in-app "Add Branch" dialog
export async function createBranchForSelf(data: {
  name: string;
  city?: string;
  address?: string;
  phone?: string;
}): Promise<{ branchId?: string; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.shop) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const shop = ctx.shop;

  // Enforce branch_limit
  const { count } = await admin
    .from("dms_branches")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shop.id);

  if ((count ?? 0) >= (shop.branch_limit ?? 1)) {
    return { error: "Branch limit reached. Contact support to increase your limit." };
  }

  const { data: branch, error } = await admin
    .from("dms_branches")
    .insert({
      shop_id: shop.id,
      name: data.name,
      city: data.city || null,
      address: data.address || null,
      phone: data.phone || null,
      is_active: true,
      is_default: false,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidateTag(branchesTag(shop.id));
  return { branchId: branch.id };
}

// Get all branches for the current user's shop
export async function getUserBranches(): Promise<{ branches: DmsBranch[]; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx?.shop) return { branches: [] };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dms_branches")
    .select("*")
    .eq("shop_id", ctx.shop.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return { branches: [], error: error.message };
  return { branches: (data as DmsBranch[]) ?? [] };
}
