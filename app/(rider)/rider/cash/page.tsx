import { getMyCashCollections } from "@/app/actions/rider";
import { CashHistoryClient } from "@/components/modules/rider-portal/cash-history-client";

export default async function RiderCashPage() {
  const { collections } = await getMyCashCollections();
  return (
    <div className="h-full overflow-y-auto">
      <CashHistoryClient collections={collections} />
    </div>
  );
}
