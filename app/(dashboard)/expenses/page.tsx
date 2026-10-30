import { redirect } from "next/navigation";
import { getAuthContext, getExpenses } from "@/lib/data";
import { formatDateInput } from "@/lib/utils";
import { ExpensesClient } from "@/components/modules/expenses/expenses-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Expenses" };

function getThisMonthRange() {
  const now = new Date();
  return {
    from: formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export default async function ExpensesPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  const { from, to } = getThisMonthRange();

  const initialExpenses = ctx?.branchId
    ? await getExpenses(ctx.branchId, { from, to, limit: 200 })
    : [];

  return (
    <ExpensesClient
      key={ctx?.branchId ?? "no-branch"}
      initialExpenses={initialExpenses}
      initialFrom={from}
      initialTo={to}
    />
  );
}
