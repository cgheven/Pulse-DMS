import { listRiders } from "@/app/actions/riders";
import { RiderChequeClient } from "@/components/modules/riders/cheque-client";

export const dynamic = "force-dynamic";

export default async function RiderChequePage() {
  const { riders } = await listRiders();
  return (
    <div className="h-full overflow-y-auto">
      <RiderChequeClient riders={riders} />
    </div>
  );
}
