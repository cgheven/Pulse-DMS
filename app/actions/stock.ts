"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MAX_UNIT_PRICE = 100_000_000; // 100 million — sanity cap

export async function addStockMovement(data: {
  shopId: string;
  productId: string;
  type: "in" | "out";
  quantity: number;
  unitPrice?: number;
  note?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Authorization: verify the authenticated user belongs to the requested shop
  const { data: profile } = await supabase
    .from("dms_profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.shop_id !== data.shopId) return { error: "Forbidden" };

  if (data.quantity <= 0 || !Number.isFinite(data.quantity)) return { error: "Quantity must be greater than 0" };
  if (data.unitPrice !== undefined) {
    if (!Number.isFinite(data.unitPrice) || isNaN(data.unitPrice)) return { error: "Purchase price is invalid" };
    if (data.unitPrice < 0) return { error: "Purchase price cannot be negative" };
    if (data.type === "in" && data.unitPrice === 0) return { error: "Purchase price must be greater than 0" };
    if (data.unitPrice > MAX_UNIT_PRICE) return { error: "Purchase price is unreasonably large" };
  }

  const { error } = await supabase.from("dms_stock_movements").insert({
    shop_id: data.shopId,
    product_id: data.productId,
    type: data.type,
    quantity: data.quantity,
    unit_price: data.unitPrice ?? null,
    note: data.note?.trim() || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateLowStockThreshold(productId: string, shopId: string, threshold: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Authorization: verify the authenticated user belongs to the requested shop
  const { data: profile } = await supabase
    .from("dms_profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.shop_id !== shopId) return { error: "Forbidden" };

  if (!Number.isFinite(threshold) || threshold < 0) return { error: "Threshold cannot be negative" };

  const { error } = await supabase
    .from("dms_products")
    .update({ low_stock_threshold: threshold })
    .eq("id", productId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/stock");
  return { success: true };
}
