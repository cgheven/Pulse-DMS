import { getTodaysFollowUps } from "@/app/actions/sales-rep";
import FollowupsClient from "@/components/modules/sales/followups-client";

export default async function FollowupsPage() {
  const { leads, error } = await getTodaysFollowUps();

  return (
    <div className="h-full overflow-y-auto p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <FollowupsClient leads={leads} />
    </div>
  );
}
