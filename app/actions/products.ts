"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addProduct(data: {
  shopId: string;
  name: string;
  supplierId?: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  lowStockThreshold: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!data.name.trim()) return { error: "Product name is required" };
  if (data.costPrice < 0 || data.salePrice < 0) return { error: "Prices cannot be negative" };

  const { error } = await supabase.from("dms_products").insert({
    shop_id: data.shopId,
    name: data.name.trim(),
    supplier_id: data.supplierId || null,
    unit: data.unit,
    cost_price: data.costPrice,
    sale_price: data.salePrice,
    low_stock_threshold: data.lowStockThreshold,
  });

  if (error) return { error: error.message };
  revalidatePath("/products");
  return { success: true };
}

export async function editProduct(
  productId: string,
  shopId: string,
  data: {
    name: string;
    supplierId?: string;
    unit: string;
    costPrice: number;
    salePrice: number;
    lowStockThreshold: number;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!data.name.trim()) return { error: "Product name is required" };

  const { error } = await supabase
    .from("dms_products")
    .update({
      name: data.name.trim(),
      supplier_id: data.supplierId || null,
      unit: data.unit,
      cost_price: data.costPrice,
      sale_price: data.salePrice,
      low_stock_threshold: data.lowStockThreshold,
    })
    .eq("id", productId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/stock");
  return { success: true };
}

export async function deleteProduct(productId: string, shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("dms_products")
    .delete()
    .eq("id", productId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/stock");
  return { success: true };
}

export async function addSupplier(data: {
  shopId: string;
  name: string;
  brand?: string;
  contact?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!data.name.trim()) return { error: "Supplier name is required" };

  const { error } = await supabase.from("dms_suppliers").insert({
    shop_id: data.shopId,
    name: data.name.trim(),
    brand: data.brand?.trim() || null,
    contact: data.contact?.trim() || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/supplier-ledger");
  return { success: true };
}

export async function editSupplier(
  supplierId: string,
  shopId: string,
  data: { name: string; brand?: string; contact?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!data.name.trim()) return { error: "Supplier name is required" };

  const { error } = await supabase
    .from("dms_suppliers")
    .update({
      name: data.name.trim(),
      brand: data.brand?.trim() || null,
      contact: data.contact?.trim() || null,
    })
    .eq("id", supplierId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/supplier-ledger");
  return { success: true };
}

export async function deleteSupplier(supplierId: string, shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("dms_suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/supplier-ledger");
  return { success: true };
}
