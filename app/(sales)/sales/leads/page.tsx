import { getMyLeads } from "@/app/actions/sales-rep";
import LeadsClient from "@/components/modules/sales/leads-client";

export default async function SalesLeadsPage() {
  const { leads, error } = await getMyLeads();

  return (
    <div className="h-full overflow-y-auto p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <LeadsClient leads={leads} />
    </div>
  );
}
