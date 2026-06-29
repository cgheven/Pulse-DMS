import { notFound } from "next/navigation";
import { getLeadDetail } from "@/app/actions/sales-rep";
import LeadDetailClient from "@/components/modules/sales/lead-detail-client";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lead, activities, error } = await getLeadDetail(id);

  if (!lead && error === "Lead not found") notFound();

  return (
    <div className="h-full flex flex-col">
      {error && !lead && (
        <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {lead && <LeadDetailClient lead={lead} activities={activities} />}
    </div>
  );
}
