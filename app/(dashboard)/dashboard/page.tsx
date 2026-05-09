import { Suspense } from "react";
import { getDashboardData, getLeadsSummary } from "@/lib/data";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";
import DashboardLoading from "./loading";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const [data, leadsSummary] = await Promise.all([
    getDashboardData(),
    getLeadsSummary(),
  ]);
  return <DashboardClient data={data} leadsSummary={leadsSummary} />;
}
