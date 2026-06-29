import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SalesShell } from "@/components/layout/sales-shell";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("dms_profiles")
    .select("is_sales_rep, is_admin, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.is_sales_rep && !profile?.is_admin) {
    redirect("/dashboard");
  }

  return (
    <SalesShell email={user.email ?? ""} name={profile?.full_name ?? null}>
      {children}
    </SalesShell>
  );
}
