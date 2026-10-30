import { redirect } from "next/navigation";
import { getAuthContext, getSupplierBalances } from "@/lib/data";
import { SupplierLedgerClient } from "@/components/modules/supplier-ledger/supplier-ledger-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Supplier Ledger" };

export default async function SupplierLedgerPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  const branchId = ctx.branchId ?? null;

  const initialBalances = branchId ? await getSupplierBalances(branchId) : [];

  // Keyed by branchId so switching the active branch (which triggers
  // router.refresh(), re-running this Server Component) remounts the client
  // component cleanly instead of leaving stale state from the previous branch.
  return (
    <SupplierLedgerClient
      key={branchId ?? "no-branch"}
      initialBalances={initialBalances}
    />
  );
}
