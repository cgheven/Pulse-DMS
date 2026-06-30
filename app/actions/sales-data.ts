"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSales } from "@/lib/data";
import type { Sale } from "@/types";

async function verifyBranchAccess(branchId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  // Both shop owners and staff have shop_id set on their profile.
  // Match the branch's shop against the user's shop — covers both roles.
  const [{ data: branch }, { data: profile }] = await Promise.all([
    admin.from("dms_branches").select("shop_id").eq("id", branchId).single(),
    admin.from("dms_profiles").select("shop_id").eq("id", userId).single(),
  ]);
  return !!(branch?.shop_id && profile?.shop_id && branch.shop_id === profile.shop_id);
}

export async function fetchSales(
  branchId: string,
  from: string,
  to: string
): Promise<Sale[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await verifyBranchAccess(branchId, user.id))) return [];
  return getSales(branchId, { from, to });
}
