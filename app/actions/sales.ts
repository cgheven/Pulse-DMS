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

async function verifyBranchAccess(branchId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  // Owner check
  const { data: own } = await admin
    .from("dms_branches")
    .select("id, dms_shops!inner(owner_id)")
    .eq("id", branchId)
    .eq("dms_shops.owner_id", userId)
    .maybeSingle();
  if (own) return true;
  // Staff check: user is active staff AND branch belongs to their shop
  const { data: st } = await admin
    .from("dms_staff")
    .select("shop_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!st) return false;
  const { data: br } = await admin
    .from("dms_branches")
    .select("id")
    .eq("id", branchId)
    .eq("shop_id", st.shop_id)
    .maybeSingle();
  return !!br;
}

export async function addSale(data: {
  branchId: string;
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

  if (!(await verifyBranchAccess(data.branchId, user.id))) return { error: "Forbidden" };

  if (data.quantity <= 0) return { error: "Quantity must be greater than 0" };
  if (data.unitPrice < 0) return { error: "Price cannot be negative" };

  if (data.unitCost !== undefined && data.unitCost !== null) {
    if (!Number.isFinite(data.unitCost) || data.unitCost < 0) return { error: "Unit cost is invalid" };
    if (data.unitCost > 100_000_000) return { error: "Unit cost is unreasonably large" };
  }

  const total = data.quantity * data.unitPrice;

  // Use admin client — access already verified above; RLS would block staff users on insert
  const admin = createAdminClient();

  // Snapshot the adder's name at write time (avoids join + RLS issues on reads)
  const { data: profileRow } = await admin
    .from("dms_profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const added_by_name = profileRow?.full_name ?? null;

  const { error } = await admin.from("dms_sales").insert({
    branch_id: data.branchId,
    product_id: data.productId,
    quantity: data.quantity,
    unit_price: data.unitPrice,
    total,
    payment_mode: data.paymentMode,
    customer_name: data.customerName?.trim() || null,
    sale_date: data.saleDate ?? new Date().toISOString().slice(0, 10),
    unit_cost: data.unitCost ?? null,
    added_by: user.id,
    added_by_name,
  });

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  return { success: true };
}

export async function editSale(
  saleId: string,
  branchId: string,
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

  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };

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
    .eq("branch_id", branchId);

  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase.from("dms_sales").insert({
    branch_id: branchId,
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

export async function deleteSale(saleId: string, branchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };

  const { error } = await supabase
    .from("dms_sales")
    .delete()
    .eq("id", saleId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  return { success: true };
}
