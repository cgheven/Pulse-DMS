import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { ShopProvider } from "@/contexts/shop-context";
import { BranchProvider } from "@/contexts/branch-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");

  // Admin has no shop — send to admin panel, not onboarding
  if (!ctx.shop) {
    if (ctx.profile?.is_admin) redirect("/admin");
    redirect("/onboarding");
  }

  return (
    <ShopProvider profile={ctx.profile} shop={ctx.shop}>
      <BranchProvider branch={ctx.branch ?? null} branches={ctx.branches ?? []}>
        <DashboardShell>{children}</DashboardShell>
      </BranchProvider>
    </ShopProvider>
  );
}
