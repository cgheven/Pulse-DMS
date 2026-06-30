"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createShop(shopName: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = shopName.trim();
  if (!trimmed) return { error: "Shop name is required" };

  const admin = createAdminClient();

  const { data: shop, error: shopErr } = await supabase
    .from("dms_shops")
    .insert({ owner_id: user.id, shop_name: trimmed })
    .select("id")
    .single();

  if (shopErr) return { error: shopErr.message };

  // Create a default branch — required for the dashboard branch context to resolve.
  const { error: branchErr } = await admin
    .from("dms_branches")
    .insert({ shop_id: shop.id, name: "Main Branch", is_default: true, is_active: true });

  if (branchErr) return { error: branchErr.message };

  const { error: profileErr } = await supabase
    .from("dms_profiles")
    .update({ shop_id: shop.id })
    .eq("id", user.id);

  if (profileErr) return { error: profileErr.message };

  revalidatePath("/dashboard");
  return { shopId: shop.id };
}

export async function updateShopName(shopId: string, shopName: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = shopName.trim();
  if (!trimmed) return { error: "Shop name is required" };

  // Verify the caller owns this shop — prevents any authenticated user from
  // renaming another shop by supplying an arbitrary shopId.
  const admin = createAdminClient();
  const { data: shop } = await admin
    .from("dms_shops")
    .select("owner_id")
    .eq("id", shopId)
    .single();
  if (!shop || shop.owner_id !== user.id) return { error: "Forbidden" };

  const { error } = await supabase
    .from("dms_shops")
    .update({ shop_name: trimmed })
    .eq("id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}
