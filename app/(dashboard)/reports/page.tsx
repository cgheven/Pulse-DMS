import { Suspense } from "react";
import { getReportsData } from "@/lib/data";
import { ReportsClient } from "@/components/modules/reports/reports-client";
import ReportsLoading from "./loading";

export const metadata = { title: "Reports | Pulse" };

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <ReportsData />
    </Suspense>
  );
}

async function ReportsData() {
  const data = await getReportsData();
  return <ReportsClient data={data} />;
}
