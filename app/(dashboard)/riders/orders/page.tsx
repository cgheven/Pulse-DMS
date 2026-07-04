import { listRiders } from "@/app/actions/riders";
import { RiderOrdersClient } from "@/components/modules/riders/orders-client";

export const dynamic = "force-dynamic";

// This IS the "map view" per the product decision: a plain list where every
// row exposes a https://www.google.com/maps?q={lat},{lng} link — no map SDK.
export default async function RiderOrdersPage() {
  const { riders } = await listRiders();
  return (
    <div className="h-full overflow-y-auto">
      <RiderOrdersClient riders={riders} />
    </div>
  );
}
