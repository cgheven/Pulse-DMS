import { RiderClientsClient } from "@/components/modules/riders/clients-client";

export const dynamic = "force-dynamic";

export default function RiderClientsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <RiderClientsClient />
    </div>
  );
}
