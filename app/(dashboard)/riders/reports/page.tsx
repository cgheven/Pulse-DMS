import { listRiders } from "@/app/actions/riders";
import { RiderReportsClient } from "@/components/modules/riders/reports-client";

export const dynamic = "force-dynamic";

export default async function RiderReportsPage() {
  const { riders } = await listRiders();
  return (
    <div className="h-full overflow-y-auto">
      <RiderReportsClient riders={riders} />
    </div>
  );
}
