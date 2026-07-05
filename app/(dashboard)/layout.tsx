import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledModules } from "@/lib/modules";
import { ShopProvider } from "@/contexts/shop-context";
import { BranchProvider } from "@/contexts/branch-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");

  // Primary gate: profile flag
  if (ctx.profile?.is_sales_rep) redirect("/sales/dashboard");
  if (ctx.profile?.is_rider) redirect("/rider/dashboard");

  // Defense-in-depth: check active team membership in case the flag was not
  // set (e.g. accounts created before the flag was wired up). Mirrored for
  // riders too. These two checks are independent of each other, so run them
  // concurrently instead of sequentially.
  const admin = createAdminClient();
  const [{ data: membership }, { data: riderRow }] = await Promise.all([
    admin
      .from("dms_sales_team_members")
      .select("id")
      .eq("user_id", ctx.user.id)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("dms_riders")
      .select("id")
      .eq("profile_id", ctx.user.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (membership) redirect("/sales/dashboard");
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
