"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_UNIT_PRICE = 100_000_000; // 100 million — sanity cap

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

export async function addStockMovement(data: {
  branchId: string;
  productId: string;
  type: "in" | "out";
  quantity: number;
  unitPrice?: number;
  note?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!(await verifyBranchOwnership(data.branchId, user.id))) return { error: "Forbidden" };

  if (data.quantity <= 0 || !Number.isFinite(data.quantity)) return { error: "Quantity must be greater than 0" };
  if (data.unitPrice !== undefined) {
    if (!Number.isFinite(data.unitPrice) || isNaN(data.unitPrice)) return { error: "Purchase price is invalid" };
    if (data.unitPrice < 0) return { error: "Purchase price cannot be negative" };
    if (data.type === "in" && data.unitPrice === 0) return { error: "Purchase price must be greater than 0" };
    if (data.unitPrice > MAX_UNIT_PRICE) return { error: "Purchase price is unreasonably large" };
  }

  const { error } = await supabase.from("dms_stock_movements").insert({
    branch_id: data.branchId,
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

export async function updateLowStockThreshold(productId: string, branchId: string, threshold: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };

  if (!Number.isFinite(threshold) || threshold < 0) return { error: "Threshold cannot be negative" };

  const { error } = await supabase
    .from("dms_products")
    .update({ low_stock_threshold: threshold })
    .eq("id", productId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/stock");
  return { success: true };
}
