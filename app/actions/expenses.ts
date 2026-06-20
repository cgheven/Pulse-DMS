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

export async function addExpense(data: {
  branchId: string;
  category: "rent" | "electricity" | "internet" | "water" | "gas" | "phone" | "salary" | "misc";
  amount: number;
  note?: string;
  expenseDate?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(data.branchId, user.id))) return { error: "Forbidden" };
  if (data.amount <= 0) return { error: "Amount must be greater than 0" };

  const { error } = await supabase.from("dms_expenses").insert({
    branch_id: data.branchId,
    category: data.category,
    amount: data.amount,
    note: data.note?.trim() || null,
    expense_date: data.expenseDate ?? new Date().toISOString().slice(0, 10),
  });

  if (error) return { error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function editExpense(
  expenseId: string,
  branchId: string,
  data: {
    category: "rent" | "electricity" | "internet" | "water" | "gas" | "phone" | "salary" | "misc";
    amount: number;
    note?: string;
    expenseDate?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };
  if (data.amount <= 0) return { error: "Amount must be greater than 0" };

  const { error } = await supabase
    .from("dms_expenses")
    .update({
      category: data.category,
      amount: data.amount,
      note: data.note?.trim() || null,
      expense_date: data.expenseDate,
    })
    .eq("id", expenseId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteExpense(expenseId: string, branchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };

  const { error } = await supabase
    .from("dms_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function fetchExpenses(branchId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", expenses: [] };

  const { data, error } = await supabase
    .from("dms_expenses")
    .select("*")
    .eq("branch_id", branchId)
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { error: error.message, expenses: [] };
  return { expenses: data ?? [], error: null };
}
