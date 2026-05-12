import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/layout/admin-shell";
import type { AdminScope } from "@/types";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("pulse_profiles")
    .select("is_admin, admin_scope")
    .eq("id", user.id)
    .single();

  if (error || !profile?.is_admin) redirect("/dashboard");

  const scope = ((profile.admin_scope as AdminScope | null) ?? "full") as AdminScope;

  return (
    <AdminShell email={user.email ?? ""} scope={scope}>
      {children}
    </AdminShell>
  );
}
