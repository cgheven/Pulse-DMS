"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/data";
import type { PaymentMethodAccount } from "@/types";

interface SaveReminderInput {
  template: string;
  payment_methods: PaymentMethodAccount[];
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
    })
    .eq("id", ctx.gymId);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}
