import { getRepDetailForManager } from "@/app/actions/sales-manager";
import RepDetailClient from "@/components/modules/sales/team/rep-detail-client";

export default async function SalesTeamRepDetailPage({
  params,
}: {
  params: Promise<{ repId: string }>;
}) {
  const { repId } = await params;
  const { data, error } = await getRepDetailForManager(repId);

  if (error || !data) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error ?? "Rep not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <RepDetailClient data={data} />
    </div>
  );
}
