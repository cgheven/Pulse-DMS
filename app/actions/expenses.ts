"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addExpense(data: {
  shopId: string;
  category: "rent" | "electricity" | "internet" | "water" | "gas" | "phone" | "salary" | "misc";
  amount: number;
  note?: string;
  expenseDate?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (data.amount <= 0) return { error: "Amount must be greater than 0" };

  const { error } = await supabase.from("dms_expenses").insert({
    shop_id: data.shopId,
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
  shopId: string,
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
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteExpense(expenseId: string, shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("dms_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function fetchExpenses(shopId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", expenses: [] };

  const { data, error } = await supabase
    .from("dms_expenses")
    .select("*")
    .eq("shop_id", shopId)
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { error: error.message, expenses: [] };
  return { expenses: data ?? [], error: null };
}
