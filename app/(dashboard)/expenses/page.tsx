import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, getExpenses } from "@/lib/data";
import { ExpensesClient } from "@/components/modules/expenses/expenses-client";
import ExpensesLoading from "./loading";

export const metadata = { title: "Expenses | DMS" };

export default function ExpensesPage() {
  return (
    <Suspense fallback={<ExpensesLoading />}>
      <ExpensesData />
    </Suspense>
  );
}

async function ExpensesData() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.shop) redirect("/onboarding");

  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const expenses = await getExpenses(ctx.shop.id, { from, to, limit: 200 });

  return (
    <ExpensesClient
      shopId={ctx.shop.id}
      initialExpenses={expenses}
      defaultFrom={from}
      defaultTo={to}
    />
  );
}
