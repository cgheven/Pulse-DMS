"use server";
import { getAuthContext } from "@/lib/data";

const MAX_PW_LENGTH = 72;
const MIN_PW_LENGTH = 8;

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function changePassword(currentPassword: string, newPassword: string) {
  if (!currentPassword || !newPassword) return { error: "All fields are required." };

  const trimmed = newPassword.trim();
  if (trimmed.length < MIN_PW_LENGTH) return { error: "Password must be at least 8 characters." };
  if (trimmed.length > MAX_PW_LENGTH) return { error: "Password cannot exceed 72 characters." };
  if (trimmed !== newPassword) return { error: "Password cannot start or end with spaces." };

  const ctx = await getAuthContext();
  if (!ctx?.user || !ctx.shop) return { error: "Unauthorized" };

  const userId = ctx.user.id;
  const email = ctx.user.email;
  if (!email) return { error: "Unauthorized" };

  const now = Date.now();
  const record = failedAttempts.get(userId);
  if (record && record.lockedUntil > now) {
    const minsLeft = Math.ceil((record.lockedUntil - now) / 60000);
    return { error: `Too many failed attempts. Try again in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}.` };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });

  if (authErr) {
    const attempts = (record?.count ?? 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      failedAttempts.set(userId, { count: attempts, lockedUntil: now + LOCKOUT_MS });
      return { error: "Too many failed attempts. Account locked for 15 minutes." };
    }
    failedAttempts.set(userId, { count: attempts, lockedUntil: 0 });
    return { error: "Current password is incorrect." };
  }

  failedAttempts.delete(userId);

  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) return { error: updateErr.message };

  return { success: true };
}
