import { listRiders } from "@/app/actions/riders";
import { RiderCashClient } from "@/components/modules/riders/cash-client";

export const dynamic = "force-dynamic";

export default async function RiderCashPage() {
  const { riders } = await listRiders();
  return (
    <div className="h-full overflow-y-auto">
      <RiderCashClient riders={riders} />
    </div>
  );
}
