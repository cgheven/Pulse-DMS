import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, getPLReport } from "@/lib/data";
import { PLReportClient } from "@/components/modules/pl-report/pl-report-client";
import { formatDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "P&L Report | Pulse DMS" };

// Uses LOCAL date components (via formatDateInput) rather than toISOString(),
// which would shift the date back a day for positive-offset timezones (e.g.
// Pakistan UTC+5) — matching the date math already used on expenses/sales pages.
function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = formatDateInput(now);
  return { from, to };
}

export default async function PLReportPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  const branchId = ctx.branchId ?? null;

  const { from, to } = getDefaultDateRange();
  const initialData = branchId ? await getPLReport(branchId, from, to) : null;

  // Keyed by branchId so switching the active branch (which triggers
  // router.refresh(), re-running this Server Component) remounts the client
  // component cleanly instead of leaving stale state from the previous branch.
  return (
    <PLReportClient
      key={branchId ?? "no-branch"}
      initialData={initialData}
      initialFrom={from}
      initialTo={to}
    />
  );
}
