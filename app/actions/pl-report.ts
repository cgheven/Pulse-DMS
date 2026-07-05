"use server";

import { getAuthContext, getPLReport } from "@/lib/data";
import type { PLReport } from "@/types";

// branchId is ALWAYS resolved server-side via getAuthContext() (cookie-derived,
// validated against the authenticated user's own shop) — never accepted from
// the client. Mirrors app/actions/insights.ts's getInsightsData().
export async function getPLReportData(
  from: string,
  to: string
): Promise<{ data: PLReport | null; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx?.user) return { data: null, error: "Not authenticated." };

  const branchId = ctx.branchId;
  if (!branchId) return { data: null, error: "No active branch found." };

  try {
    const data = await getPLReport(branchId, from, to);
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to load report." };
  }
}
