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

  const admin = createAdminClient();
  const { data: oldRow, error: fetchErr } = await admin
    .from("dms_sales")
    .select("*")
    .eq("id", saleId)
    .eq("branch_id", branchId)
    .single();
  if (fetchErr || !oldRow) return { error: "Sale not found" };

  const newSaleDate = data.saleDate ?? new Date().toISOString().slice(0, 10);
  const newCustomerName = data.customerName?.trim() || null;

  // Delete triggers the reverse-stock trigger; re-insert triggers auto-deduct.
  // logical_id, added_by/added_by_name carry over so history and original
  // attribution survive this delete+reinsert (the row's own id does not).
  const { error: delErr } = await supabase
    .from("dms_sales")
    .delete()
    .eq("id", saleId)
    .eq("branch_id", branchId);

  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase.from("dms_sales").insert({
    branch_id: branchId,
    shop_id: oldRow.shop_id,
    product_id: data.productId,
    quantity: data.quantity,
    unit_price: data.unitPrice,
    total,
    payment_mode: data.paymentMode,
    customer_name: newCustomerName,
    sale_date: newSaleDate,
    unit_cost: data.unitCost ?? null,
    added_by: oldRow.added_by,
    added_by_name: oldRow.added_by_name,
    logical_id: oldRow.logical_id,
  });

  if (insErr) return { error: insErr.message };

  // Best-effort edit log — must never block the main action.
  try {
    const { data: profileRow } = await admin.from("dms_profiles").select("full_name").eq("id", user.id).single();
    await admin.from("dms_sale_edits").insert({
      logical_id: oldRow.logical_id,
      branch_id: branchId,
      old_product_id: oldRow.product_id,
      new_product_id: data.productId,
      old_quantity: oldRow.quantity,
      new_quantity: data.quantity,
      old_unit_price: oldRow.unit_price,
      new_unit_price: data.unitPrice,
      old_total: oldRow.total,
      new_total: total,
      old_payment_mode: oldRow.payment_mode,
      new_payment_mode: data.paymentMode,
      old_customer_name: oldRow.customer_name,
      new_customer_name: newCustomerName,
      old_sale_date: oldRow.sale_date,
      new_sale_date: newSaleDate,
      edited_by: user.id,
      edited_by_name: profileRow?.full_name ?? null,
    });
  } catch (logErr) {
    // Never block the edit on logging failure, but don't lose it silently either.
    console.error("Failed to write sale edit history:", logErr);
  }

  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  return { success: true };
}

export type SaleEdit = {
  id: string;
  logical_id: string;
  old_product_id: string | null;
  new_product_id: string | null;
  old_quantity: number | null;
  new_quantity: number | null;
  old_unit_price: number | null;
  new_unit_price: number | null;
  old_total: number | null;
  new_total: number | null;
  old_payment_mode: string | null;
  new_payment_mode: string | null;
  old_customer_name: string | null;
  new_customer_name: string | null;
  old_sale_date: string | null;
  new_sale_date: string | null;
  edited_by_name: string | null;
  edited_at: string;
};

export async function getSaleEditHistory(
  logicalId: string,
  branchId: string
): Promise<{ edits: SaleEdit[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { edits: [], error: "Not authenticated" };

  if (!(await verifyBranchAccess(branchId, user.id))) return { edits: [], error: "Forbidden" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dms_sale_edits")
    .select("*")
    .eq("logical_id", logicalId)
    .eq("branch_id", branchId)
    .order("edited_at", { ascending: false });

  if (error) return { edits: [], error: error.message };
  return { edits: (data as SaleEdit[]) ?? [] };
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
