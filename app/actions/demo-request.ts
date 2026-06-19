"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function submitDemoRequest(data: {
  contact_name: string;
  shop_name: string;
  city?: string;
  phone: string;
  whatsapp?: string;
  plan_interest?: string;
  num_branches?: number;
  message?: string;
}): Promise<{ error?: string }> {
  if (!data.contact_name?.trim()) return { error: "Name is required" };
  if (!data.shop_name?.trim()) return { error: "Shop name is required" };
  if (!data.phone?.trim()) return { error: "Phone number is required" };

  const admin = createAdminClient();
  const { error } = await admin.from("dms_inquiries").insert({
    contact_name: data.contact_name.trim(),
    shop_name: data.shop_name.trim(),
    city: data.city?.trim() || null,
    phone: data.phone.trim(),
    whatsapp: data.whatsapp?.trim() || null,
    plan_interest: data.plan_interest || null,
    num_branches: data.num_branches ?? null,
    message: data.message?.trim() || null,
  });

  if (error) return { error: "Something went wrong. Please try again." };
  return {};
}
