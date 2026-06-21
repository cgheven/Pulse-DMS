"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Verify that branchId belongs to the authenticated user
async function verifyBranchOwnership(branchId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dms_branches")
    .select("dms_shops!inner(owner_id)")
    .eq("id", branchId)
    .eq("dms_shops.owner_id", userId)
    .single();
  return !!data;
}

export async function addProduct(data: {
  branchId: string;
  name: string;
  supplierId?: string;
  size?: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  lowStockThreshold: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(data.branchId, user.id))) return { error: "Forbidden" };
  if (!data.name.trim()) return { error: "Product name is required" };
  if (data.costPrice < 0 || data.salePrice < 0) return { error: "Prices cannot be negative" };

  const { error } = await supabase.from("dms_products").insert({
    branch_id: data.branchId,
    name: data.name.trim(),
    supplier_id: data.supplierId || null,
    size: data.size?.trim() || null,
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
  branchId: string,
  data: {
    name: string;
    supplierId?: string;
    size?: string;
    unit: string;
    costPrice: number;
    salePrice: number;
    lowStockThreshold: number;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };
  if (!data.name.trim()) return { error: "Product name is required" };

  const { error } = await supabase
    .from("dms_products")
    .update({
      name: data.name.trim(),
      supplier_id: data.supplierId || null,
      size: data.size?.trim() || null,
      unit: data.unit,
      cost_price: data.costPrice,
      sale_price: data.salePrice,
      low_stock_threshold: data.lowStockThreshold,
    })
    .eq("id", productId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/stock");
  return { success: true };
}

export async function deleteProduct(productId: string, branchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };

  const { error } = await supabase
    .from("dms_products")
    .delete()
    .eq("id", productId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/stock");
  return { success: true };
}

export async function addSupplier(data: {
  branchId: string;
  name: string;
  brand?: string;
  contact?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(data.branchId, user.id))) return { error: "Forbidden" };
  if (!data.name.trim()) return { error: "Supplier name is required" };

  const { error } = await supabase.from("dms_suppliers").insert({
    branch_id: data.branchId,
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
  branchId: string,
  data: { name: string; brand?: string; contact?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };
  if (!data.name.trim()) return { error: "Supplier name is required" };

  const { error } = await supabase
    .from("dms_suppliers")
    .update({
      name: data.name.trim(),
      brand: data.brand?.trim() || null,
      contact: data.contact?.trim() || null,
    })
    .eq("id", supplierId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/supplier-ledger");
  return { success: true };
}

export async function deleteSupplier(supplierId: string, branchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };

  const { error } = await supabase
    .from("dms_suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/supplier-ledger");
  return { success: true };
}
