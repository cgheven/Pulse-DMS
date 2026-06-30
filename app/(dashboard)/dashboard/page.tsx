import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  // Staff role must not see financial overview — middleware is the primary gate,
  // this is defense-in-depth.
  if (ctx?.profile?.role === "staff") redirect("/sales");
  return <DashboardClient />;
}
