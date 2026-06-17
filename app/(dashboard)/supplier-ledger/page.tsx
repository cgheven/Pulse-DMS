import { redirect } from "next/navigation";
import { getAuthContext, getSupplierBalances } from "@/lib/data";
import { SupplierLedgerClient } from "@/components/modules/supplier-ledger/supplier-ledger-client";

export const metadata = { title: "Supplier Ledger | DMS" };

export default async function SupplierLedgerPage() {
  const ctx = await getAuthContext();
  if (!ctx?.shop) redirect("/onboarding");

  const balances = await getSupplierBalances(ctx.shop.id);

  return <SupplierLedgerClient initialBalances={balances} />;
}
