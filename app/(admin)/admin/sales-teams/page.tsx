import { listSalesTeams } from "@/app/actions/admin-sales-teams";
import SalesTeamsClient from "@/components/modules/admin/sales-teams-client";

export const dynamic = "force-dynamic";

export default async function AdminSalesTeamsPage() {
  const { teams, error } = await listSalesTeams();

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <SalesTeamsClient teams={teams} />
    </div>
  );
}
