"use server";
import { revalidateTag } from "next/cache";
import { getAuthContext } from "@/lib/data";

// Cache tags used in lib/data.ts unstable_cache() wrappers.
// Call the matching helper after a mutation so the next page load returns fresh data
// instead of waiting for the TTL window to expire.

async function gymTag(prefix: string) {
  const ctx = await getAuthContext();
  if (ctx?.gymId) revalidateTag(`${prefix}-${ctx.gymId}`);
}

export async function revalidateDashboard() { await gymTag("dashboard"); }
export async function revalidateMembers()   { await gymTag("members"); }
export async function revalidatePlans()     { await gymTag("plans"); }
export async function revalidateStaff()     { await gymTag("staff"); }
export async function revalidateReports()   { await gymTag("reports"); }
export async function revalidateSmartEarn() { await gymTag("smart-earn"); }

// Per-user cache invalidators — call after mutating pulse_profiles or pulse_gyms ownership.
// Match the tags used in lib/data.ts → getAuthContext.
export async function revalidateProfile(userId: string) {
  if (userId) revalidateTag(`profile-${userId}`);
}

export async function revalidateOwnerGyms(userId: string) {
  if (userId) revalidateTag(`gyms-owner-${userId}`);
}
