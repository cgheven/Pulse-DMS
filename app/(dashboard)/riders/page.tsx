import { listRiders } from "@/app/actions/riders";
import { RidersClient } from "@/components/modules/riders/riders-client";

export const dynamic = "force-dynamic";

// Reaching this page at all already proves the server-side module gate and
// role==='owner' check passed (see app/(dashboard)/riders/layout.tsx). Order
// taking, clients, cash/cheque collection and reports all live under their
// own /riders/* subroutes, covered by this same layout gate.
export default async function RidersPage() {
  const { riders, error } = await listRiders();
  return (
    <div className="h-full overflow-y-auto">
      {error && (
        <div className="mx-4 mt-4 md:mx-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <RidersClient riders={riders} />
    </div>
  );
}
