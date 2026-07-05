import { redirect } from "next/navigation";
import { getAuthContext, getDashboardStats } from "@/lib/data";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  // Staff role must not see financial overview — middleware is the primary gate,
  // this is defense-in-depth.
  if (ctx?.profile?.role === "staff") redirect("/sales");

  const branchId = ctx?.branchId ?? null;
  const initialStats = branchId ? await getDashboardStats(branchId) : null;

  // Keyed by branchId so switching the active branch (which triggers
  // router.refresh(), re-running this Server Component) remounts the client
  // component cleanly instead of leaving stale state from the previous branch.
  return <DashboardClient key={branchId ?? "no-branch"} initialStats={initialStats} />;
}
