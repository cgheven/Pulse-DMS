"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AdminScope, AuditLog, LoginLog } from "@/types";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("pulse_profiles").select("is_admin, admin_scope").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("Forbidden");
  const scope = (profile.admin_scope as AdminScope | null) ?? "full";
  if (scope !== "full") throw new Error("Forbidden: full admin required");
  return user;
}

export async function listAuditLogs(): Promise<{ logs?: AuditLog[]; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("pulse_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { logs: (data ?? []) as AuditLog[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to fetch audit logs" };
  }
}

export async function listLoginLogs(): Promise<{ logs?: LoginLog[]; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("pulse_login_log")
      .select("*")
      .order("logged_in_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { logs: (data ?? []) as LoginLog[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to fetch login logs" };
  }
}
