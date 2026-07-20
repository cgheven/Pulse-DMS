import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledModules } from "@/lib/modules";
import { salesLandingPath } from "@/lib/sales-landing";
import { ShopProvider } from "@/contexts/shop-context";
import { BranchProvider } from "@/contexts/branch-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");

  if (ctx.profile?.is_rider) redirect("/rider/dashboard");

  // Sales accounts belong in the (sales) portal, not here. Fetch the team
  // memberships (with role) so a manager-only account lands on the team view
  // and a rep on their leads — the old code sent everyone to /sales/dashboard,
  // which no longer exists and produced a redirect loop. Also covers accounts
  // whose is_sales_rep flag is out of sync with their membership rows.
  const admin = createAdminClient();
  const [{ data: memberships }, { data: riderRow }] = await Promise.all([
    admin
      .from("dms_sales_team_members")
      .select("role")
      .eq("user_id", ctx.user.id)
      .eq("is_active", true),
    admin
      .from("dms_riders")
      .select("id")
      .eq("profile_id", ctx.user.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (ctx.profile?.is_sales_rep || (memberships?.length ?? 0) > 0) {
    redirect(salesLandingPath(memberships ?? []));
  }
  if (riderRow) redirect("/rider/dashboard");

  // Admin has no shop — send to admin panel, not onboarding
  if (!ctx.shop) {
    if (ctx.profile?.is_admin) redirect("/admin");
    redirect("/onboarding");
  }

  // Finding 6 fix: enforce trial expiry and shop active status server-side.
  // The TrialBanner component is purely cosmetic — access must be blocked here.
  const trialExpired =
    ctx.shop.trial_ends_at != null &&
    new Date(ctx.shop.trial_ends_at) < new Date();
  if (!ctx.shop.is_active || trialExpired) {
    redirect("/pricing");
  }

  const enabledModules = [...(await getEnabledModules(ctx.shop.id))];

  return (
    <ShopProvider profile={ctx.profile} shop={ctx.shop} enabledModules={enabledModules}>
      <BranchProvider branch={ctx.branch ?? null} branches={ctx.branches ?? []}>
        <DashboardShell>{children}</DashboardShell>
      </BranchProvider>
    </ShopProvider>
  );
}
