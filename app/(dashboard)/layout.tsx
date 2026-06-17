import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { ShopProvider } from "@/contexts/shop-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");

  // No shop yet → onboarding
  if (!ctx.shop) redirect("/onboarding");

  return (
    <ShopProvider profile={ctx.profile} shop={ctx.shop}>
      <DashboardShell>{children}</DashboardShell>
    </ShopProvider>
  );
}
