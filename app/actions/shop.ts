"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createShop(shopName: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = shopName.trim();
  if (!trimmed) return { error: "Shop name is required" };

  const { data: shop, error: shopErr } = await supabase
    .from("dms_shops")
    .insert({ owner_id: user.id, shop_name: trimmed })
    .select("id")
    .single();

  if (shopErr) return { error: shopErr.message };

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
  const trimmed = shopName.trim();
  if (!trimmed) return { error: "Shop name is required" };

  const { error } = await supabase
    .from("dms_shops")
    .update({ shop_name: trimmed })
    .eq("id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}
