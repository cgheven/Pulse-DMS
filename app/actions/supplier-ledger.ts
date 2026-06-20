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

export async function addInvoice(data: {
  branchId: string;
  supplierId: string;
  amount: number;
  invoiceNumber?: string;
  note?: string;
  transactionDate?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!(await verifyBranchOwnership(data.branchId, user.id))) return { error: "Forbidden" };

  if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Amount must be greater than 0" };
  if (data.amount > 100_000_000) return { error: "Amount is unreasonably large" };

  const { error } = await supabase.from("dms_supplier_ledger").insert({
    branch_id: data.branchId,
    supplier_id: data.supplierId,
    type: "purchase",
    amount: data.amount,
    paid_amount: 0,
    invoice_number: data.invoiceNumber?.trim() || null,
    note: data.note?.trim() || null,
    transaction_date: data.transactionDate ?? new Date().toISOString().slice(0, 10),
  });

  if (error) return { error: error.message };
  revalidatePath("/supplier-ledger");
  return { success: true };
}

export async function recordPayment(data: {
  branchId: string;
  invoiceId: string;
  amount: number;
  paymentDate?: string;
  note?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!(await verifyBranchOwnership(data.branchId, user.id))) return { error: "Forbidden" };

  if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Amount must be greater than 0" };
  if (data.amount > 100_000_000) return { error: "Amount is unreasonably large" };

  const { data: invoice, error: fetchErr } = await supabase
    .from("dms_supplier_ledger")
    .select("amount, paid_amount")
    .eq("id", data.invoiceId)
    .eq("branch_id", data.branchId)
    .eq("type", "purchase")
    .single();

  if (fetchErr || !invoice) return { error: "Invoice not found" };

  const newPaid = Number(invoice.paid_amount) + data.amount;
  const today = new Date().toISOString().slice(0, 10);

  // Insert payment record + update invoice paid_amount atomically
  const [paymentRes, updateRes] = await Promise.all([
    supabase.from("dms_supplier_payments").insert({
      branch_id: data.branchId,
      invoice_id: data.invoiceId,
      amount: data.amount,
      payment_date: data.paymentDate ?? today,
      note: data.note?.trim() || null,
    }),
    supabase
      .from("dms_supplier_ledger")
      .update({ paid_amount: newPaid })
      .eq("id", data.invoiceId)
      .eq("branch_id", data.branchId),
  ]);

  if (paymentRes.error) return { error: paymentRes.error.message };
  if (updateRes.error) return { error: updateRes.error.message };

  revalidatePath("/supplier-ledger");
  return { success: true };
}

export async function deleteLedgerEntry(entryId: string, branchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!(await verifyBranchOwnership(branchId, user.id))) return { error: "Forbidden" };

  const { error } = await supabase
    .from("dms_supplier_ledger")
    .delete()
    .eq("id", entryId)
    .eq("branch_id", branchId);

  if (error) return { error: error.message };
  revalidatePath("/supplier-ledger");
  return { success: true };
}
