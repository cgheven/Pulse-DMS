"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addStockMovement(data: {
  shopId: string;
  productId: string;
  type: "in" | "out";
  quantity: number;
  note?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (data.quantity <= 0) return { error: "Quantity must be greater than 0" };

  const { error } = await supabase.from("dms_stock_movements").insert({
    shop_id: data.shopId,
    product_id: data.productId,
    type: data.type,
    quantity: data.quantity,
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
  if (threshold < 0) return { error: "Threshold cannot be negative" };

  const { error } = await supabase
    .from("dms_products")
    .update({ low_stock_threshold: threshold })
    .eq("id", productId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/stock");
  return { success: true };
}
