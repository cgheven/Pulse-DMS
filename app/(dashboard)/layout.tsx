import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopProvider } from "@/contexts/shop-context";
import { BranchProvider } from "@/contexts/branch-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");

  // Primary gate: profile flag
  if (ctx.profile?.is_sales_rep) redirect("/sales/dashboard");

  // Defense-in-depth: check active team membership in case the flag was not
  // set (e.g. accounts created before the flag was wired up).
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("dms_sales_team_members")
    .select("id")
    .eq("user_id", ctx.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (membership) redirect("/sales/dashboard");

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

  return (
    <ShopProvider profile={ctx.profile} shop={ctx.shop}>
      <BranchProvider branch={ctx.branch ?? null} branches={ctx.branches ?? []}>
        <DashboardShell>{children}</DashboardShell>
      </BranchProvider>
    </ShopProvider>
  );
}
