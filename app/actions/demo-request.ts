"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Allowlist — only these values accepted from the public internet
const VALID_PLANS = new Set(["single", "double", "triple"]);

// Truncate to max chars after trimming so the DB never sees oversized data
function cap(value: string | undefined | null, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

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
  // ── Required field presence ────────────────────────────────────────────────
  const contact_name = cap(data.contact_name, 100);
  const shop_name = cap(data.shop_name, 150);
  const phone = cap(data.phone, 20);

  if (!contact_name) return { error: "Name is required" };
  if (!shop_name) return { error: "Shop name is required" };
  if (!phone) return { error: "Phone number is required" };

  // ── Allowlist: plan_interest must be one of the known values or absent ─────
  const plan_interest =
    data.plan_interest && VALID_PLANS.has(data.plan_interest)
      ? data.plan_interest
      : null;

  // ── Clamp num_branches to a sane range ────────────────────────────────────
  let num_branches: number | null = null;
  if (data.num_branches !== undefined && data.num_branches !== null) {
    const n = Math.floor(Number(data.num_branches));
    if (Number.isFinite(n) && n >= 1 && n <= 99) num_branches = n;
  }

  // ── Cap all free-text fields ───────────────────────────────────────────────
  const city = cap(data.city, 100) || null;
  const whatsapp = cap(data.whatsapp, 20) || null;
  const message = cap(data.message, 1000) || null;

  const admin = createAdminClient();
  const { error } = await admin.from("dms_inquiries").insert({
    contact_name,
    shop_name,
    city,
    phone,
    whatsapp,
    plan_interest,
    num_branches,
    message,
  });

  if (error) return { error: "Something went wrong. Please try again." };
  return {};
}

