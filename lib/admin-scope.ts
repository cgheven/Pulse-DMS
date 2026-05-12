import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminScope } from "@/types";

// Server util — gates pages that should ONLY be visible to scope='full' admins.
// scope='prospects' admins get bounced to /admin/prospects (their only allowed
// route). Non-admins get bounced to /dashboard, unauthenticated users to /login.
export async function requireFullAdmin(): Promise<{ id: string; email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("pulse_profiles")
    .select("is_admin, admin_scope")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  const scope = ((profile.admin_scope as AdminScope | null) ?? "full") as AdminScope;
  if (scope === "prospects") redirect("/admin/prospects");

  return { id: user.id, email: user.email ?? "" };
}

// Resolve the caller's admin scope (assumes is_admin already verified by
// surrounding layout). Returns 'full' by default if the column is null.
export async function getAdminScope(): Promise<AdminScope> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "full";

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("pulse_profiles")
    .select("admin_scope")
    .eq("id", user.id)
    .single();

  return ((profile?.admin_scope as AdminScope | null) ?? "full") as AdminScope;
}
