"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addLedgerEntry(data: {
  shopId: string;
  supplierId: string;
  type: "purchase" | "payment";
  amount: number;
  note?: string;
  transactionDate?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (data.amount <= 0) return { error: "Amount must be greater than 0" };

  const { error } = await supabase.from("dms_supplier_ledger").insert({
    shop_id: data.shopId,
    supplier_id: data.supplierId,
    type: data.type,
    amount: data.amount,
    note: data.note?.trim() || null,
    transaction_date: data.transactionDate ?? new Date().toISOString().slice(0, 10),
  });

  if (error) return { error: error.message };
  revalidatePath("/supplier-ledger");
  return { success: true };
}

export async function deleteLedgerEntry(entryId: string, shopId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("dms_supplier_ledger")
    .delete()
    .eq("id", entryId)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };
  revalidatePath("/supplier-ledger");
  return { success: true };
}
