import { getMyStats, getTodaysFollowUps } from "@/app/actions/sales-rep";
import SalesDashboardClient from "@/components/modules/sales/dashboard-client";

export default async function SalesDashboardPage() {
  const [{ stats, error: statsError }, { leads: followups }] = await Promise.all([
    getMyStats(),
    getTodaysFollowUps(),
  ]);

  return (
    <div className="h-full overflow-y-auto p-6">
      {statsError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {statsError}
        </div>
      )}
      <SalesDashboardClient stats={stats} todayFollowups={followups} />
    </div>
  );
}
