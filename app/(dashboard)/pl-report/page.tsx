import type { Metadata } from "next";
import { PLReportClient } from "@/components/modules/pl-report/pl-report-client";

export const metadata: Metadata = { title: "P&L Report | Pulse DMS" };

export default function PLReportPage() {
  return <PLReportClient />;
}
