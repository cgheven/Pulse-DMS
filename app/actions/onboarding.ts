"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Allowlists (mirror the wizard UI) ─────────────────────────────────────────
const TRIAL_CHOICES = ["1_month", "2_months", "skip"] as const;
const PLAN_CHOICES = ["starter", "growth", "pro"] as const;
const BILLING_CYCLES = ["monthly", "annual"] as const;
const BRANCH_TYPES = ["single", "multi"] as const;
const GYM_TYPES = [
  "general", "ladies_only", "mens_only",
  "crossfit", "martial_arts", "yoga", "mixed",
] as const;
const HEARD_FROM = [
  "referral", "instagram", "whatsapp",
  "google", "facebook", "other",
] as const;

export type OnboardingPayload = {
  owner_name: string;
  phone: string;
  email?: string | null;
  gym_name: string;
  city: string;
  area?: string | null;
  gym_type?: typeof GYM_TYPES[number] | null;
  active_members_count?: number | null;
  trial_choice: typeof TRIAL_CHOICES[number];
  preferred_start_date?: string | null;
  heard_from?: typeof HEARD_FROM[number] | null;
  plan_choice: typeof PLAN_CHOICES[number];
  billing_cycle: typeof BILLING_CYCLES[number];
  branch_type: typeof BRANCH_TYPES[number];
  branch_count: number;
};

export type OnboardingResult =
  | { success: true; prospectId: string }
  | { error: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
function isOneOf<T extends readonly string[]>(
  v: unknown,
  arr: T
): v is T[number] {
  return typeof v === "string" && (arr as readonly string[]).includes(v);
}

export async function submitOnboarding(
  payload: OnboardingPayload
): Promise<OnboardingResult> {
  // ── Required fields ────────────────────────────────────────────────────────
  if (!payload?.owner_name?.trim()) return { error: "Owner name is required" };
  if (!payload.phone?.trim()) return { error: "Phone is required" };
  if (!payload.gym_name?.trim()) return { error: "Gym name is required" };
  if (!payload.city?.trim()) return { error: "City is required" };

  // ── Length caps (basic spam guard) ─────────────────────────────────────────
  if (payload.owner_name.length > 100) return { error: "Name too long" };
  if (payload.gym_name.length > 100) return { error: "Gym name too long" };
  if (payload.city.length > 80) return { error: "City too long" };
  if ((payload.area ?? "").length > 120) return { error: "Area too long" };
  if ((payload.email ?? "").length > 160) return { error: "Email too long" };

  // ── Pakistani phone validation ─────────────────────────────────────────────
  // Accepts: 03001234567, +923001234567, 923001234567, with optional spaces / dashes.
  const phone = payload.phone.replace(/[\s\-]/g, "");
  const validPhone = /^(\+92|92|0)?3\d{9}$/.test(phone);
  if (!validPhone) {
    return { error: "Invalid Pakistani phone number (expected 03XXXXXXXXX)" };
  }

  // ── Email — only validate if present ───────────────────────────────────────
  const email = payload.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }

  // ── Enum allowlists ────────────────────────────────────────────────────────
  if (!isOneOf(payload.trial_choice, TRIAL_CHOICES)) {
    return { error: "Invalid trial choice" };
  }
  if (!isOneOf(payload.plan_choice, PLAN_CHOICES)) {
    return { error: "Invalid plan choice" };
  }
  if (!isOneOf(payload.billing_cycle, BILLING_CYCLES)) {
    return { error: "Invalid billing cycle" };
  }
  if (!isOneOf(payload.branch_type, BRANCH_TYPES)) {
    return { error: "Invalid branch type" };
  }
  if (payload.gym_type && !isOneOf(payload.gym_type, GYM_TYPES)) {
    return { error: "Invalid gym type" };
  }
  if (payload.heard_from && !isOneOf(payload.heard_from, HEARD_FROM)) {
    return { error: "Invalid referral source" };
  }

  // ── Branch count bounds ────────────────────────────────────────────────────
  let branchCount = Math.floor(Number(payload.branch_count) || 1);
  if (payload.branch_type === "single") branchCount = 1;
  if (branchCount < 1) branchCount = 1;
  if (branchCount > 20) branchCount = 20;

  // ── Active member count bounds ─────────────────────────────────────────────
  let activeMembers: number | null = null;
  if (payload.active_members_count != null && payload.active_members_count !== undefined) {
    const n = Math.floor(Number(payload.active_members_count));
    if (Number.isFinite(n) && n >= 0 && n < 100_000) activeMembers = n;
  }

  // ── Preferred start date — basic ISO date check ───────────────────────────
  let preferredStart: string | null = null;
  if (payload.preferred_start_date) {
    const d = String(payload.preferred_start_date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) preferredStart = d;
  }

  // ── Request metadata ──────────────────────────────────────────────────────
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const userAgent = h.get("user-agent")?.slice(0, 500) || null;

  // ── Insert ────────────────────────────────────────────────────────────────
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pulse_prospects")
    .insert({
      // existing columns (preserve compatibility with admin pipeline view)
      name: payload.gym_name.trim(),         // pulse_prospects.name = gym name
      owner_name: payload.owner_name.trim(),
      phone,
      area: payload.area?.trim() || null,
      city: payload.city.trim(),
      status: "pending",                      // matches existing enum

      // new columns from this migration
      email,
      gym_name: payload.gym_name.trim(),
      gym_type: payload.gym_type || null,
      active_members_count: activeMembers,
      trial_choice: payload.trial_choice,
      preferred_start_date: preferredStart,
      heard_from: payload.heard_from || null,
      plan_choice: payload.plan_choice,
      billing_cycle: payload.billing_cycle,
      branch_type: payload.branch_type,
      branch_count: branchCount,
      submission_source: "public-form",
      ip_address: ip,
      user_agent: userAgent,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  return { success: true, prospectId: data.id };
}
