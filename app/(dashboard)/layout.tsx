import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { ShopProvider } from "@/contexts/shop-context";
import { BranchProvider } from "@/contexts/branch-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");

  // Sales reps have no shop — send to sales portal
  if (ctx.profile?.is_sales_rep) redirect("/sales/dashboard");

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
