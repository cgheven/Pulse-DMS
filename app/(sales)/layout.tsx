import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSalesAuthContext } from "@/app/actions/sales-rep";
import { SalesShell } from "@/components/layout/sales-shell";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  // Same cached lookup every page's data-fetching function uses — one
  // getUser()+profile round-trip per navigation instead of a duplicate per call site.
  const ctx = await getSalesAuthContext();
  if (!ctx?.user) redirect("/login");
  const { user, profile } = ctx;

  if (!profile?.is_sales_rep && !profile?.is_admin) {
    // Defense-in-depth: mirror (dashboard)/layout.tsx's fallback so a profile
    // flag out of sync with team membership can't produce a redirect loop.
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("dms_sales_team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) redirect("/dashboard");
  }

  return (
    <SalesShell email={user.email ?? ""} name={profile?.full_name ?? null}>
      {children}
    </SalesShell>
  );
}
