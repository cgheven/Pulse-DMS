"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addSale(data: {
  shopId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  paymentMode: "cash" | "credit";
  customerName?: string;
  saleDate?: string;
  unitCost?: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (data.quantity <= 0) return { error: "Quantity must be greater than 0" };
  if (data.unitPrice < 0) return { error: "Price cannot be negative" };

  if (data.unitCost !== undefined && data.unitCost !== null) {
    if (!Number.isFinite(data.unitCost) || data.unitCost < 0) return { error: "Unit cost is invalid" };
    if (data.unitCost > 100_000_000) return { error: "Unit cost is unreasonably large" };
  }

  const total = data.quantity * data.unitPrice;

  const { error } = await supabase.from("dms_sales").insert({
    shop_id: data.shopId,
    product_id: data.productId,
    quantity: data.quantity,
    unit_price: data.unitPrice,
    total,
    payment_mode: data.paymentMode,
    customer_name: data.customerName?.trim() || null,
    sale_date: data.saleDate ?? new Date().toISOString().slice(0, 10),
    unit_cost: data.unitCost ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  return { success: true };
}

export async function editSale(
  saleId: string,
  shopId: string,
  data: {
    productId: string;
    quantity: number;
    unitPrice: number;
    paymentMode: "cash" | "credit";
    customerName?: string;
    saleDate?: string;
    unitCost?: number;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (data.quantity <= 0) return { error: "Quantity must be greater than 0" };
  if (data.unitPrice < 0) return { error: "Price cannot be negative" };

  if (data.unitCost !== undefined && data.unitCost !== null) {
    if (!Number.isFinite(data.unitCost) || data.unitCost < 0) return { error: "Unit cost is invalid" };
    if (data.unitCost > 100_000_000) return { error: "Unit cost is unreasonably large" };
  }

  const total = data.quantity * data.unitPrice;

  // Delete triggers the reverse-stock trigger; re-insert triggers auto-deduct
  const { error: delErr } = await supabase
    .from("dms_sales")
    .delete()
    .eq("id", saleId)
    .eq("shop_id", shopId);

  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase.from("dms_sales").insert({
    shop_id: shopId,
    product_id: data.productId,
    quantity: data.quantity,
    unit_price: data.unitPrice,
    total,
    payment_mode: data.paymentMode,
    customer_name: data.customerName?.trim() || null,
    sale_date: data.saleDate ?? new Date().toISOString().slice(0, 10),
    unit_cost: data.unitCost ?? null,
  });

  if (insErr) return { error: insErr.message };
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  return { success: true };
}

export async function deleteSale(saleId: string, shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("dms_sales")
    .delete()
    .eq("id", saleId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  return { success: true };
}
