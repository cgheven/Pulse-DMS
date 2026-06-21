import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { getInsightsData } from "@/app/actions/insights";
import { InsightsClient } from "@/components/modules/insights/insights-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Insights | Pulse DMS" };

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function InsightsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.profile?.role !== "owner") redirect("/dashboard");
  if (!ctx.branchId) redirect("/dashboard");

  const { from, to } = getDefaultDateRange();
  const { data, error } = await getInsightsData(from, to);

  return (
    <InsightsClient
      initialData={data}
      initialError={error}
      initialFrom={from}
      initialTo={to}
    />
  );
}
