"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ── Admin guard ───────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("dms_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Forbidden: admin access required");

  return user;
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export async function listAuditLogs(): Promise<{
  logs: never[];
  note: string;
  error?: string;
}> {
  try {
    await requireAdmin();
    return {
      logs: [],
      note: "Audit logging coming in v2",
    };
  } catch (err) {
    return {
      logs: [],
      note: "Audit logging coming in v2",
      error: err instanceof Error ? err.message : "Failed to fetch audit logs",
    };
  }
}
