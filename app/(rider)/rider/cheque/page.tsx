import { getMyChequeCollections } from "@/app/actions/rider";
import { ChequeHistoryClient } from "@/components/modules/rider-portal/cheque-history-client";

export default async function RiderChequePage() {
  const { cheques } = await getMyChequeCollections();
  return (
    <div className="h-full overflow-y-auto">
      <ChequeHistoryClient cheques={cheques} />
    </div>
  );
}
