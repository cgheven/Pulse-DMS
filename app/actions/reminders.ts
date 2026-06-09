"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/data";
import type { PaymentMethodAccount } from "@/types";

interface SaveReminderInput {
  template: string;
  payment_methods: PaymentMethodAccount[];
  payment_overdue_grace_days: number;
}

export async function saveReminderSettings(input: SaveReminderInput) {
  const ctx = await getAuthContext();
  if (!ctx?.gymId) return { error: "Unauthorized" };
  if (ctx.isDemo) return { error: "Demo mode — sign up to make changes." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("pulse_gyms")
    .update({
      reminder_template: input.template,
      payment_methods: input.payment_methods,
      payment_overdue_grace_days: input.payment_overdue_grace_days,
    })
    .eq("id", ctx.gymId);

  if (error) return { error: error.message };

  // Invalidate cached gyms list for the owner so reminder/payment-method changes
  // are reflected on the next nav.
  const { data: gymRow } = await admin
    .from("pulse_gyms").select("owner_id").eq("id", ctx.gymId).single();
  if (gymRow?.owner_id) revalidateTag(`gyms-owner-${gymRow.owner_id}`);

  revalidatePath("/", "layout");
  return { success: true };
}
