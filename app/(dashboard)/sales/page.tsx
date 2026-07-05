import { redirect } from "next/navigation";
import { getAuthContext, getSales, getProducts, getStockLevels } from "@/lib/data";
import { SalesClient } from "@/components/modules/sales/sales-client";

export const dynamic = "force-dynamic";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function SalesPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.branchId) redirect("/dashboard");

  const today = todayStr();
  const [sales, products, stockLevels] = await Promise.all([
    getSales(ctx.branchId, { from: today, to: today }),
    getProducts(ctx.branchId),
    getStockLevels(ctx.branchId),
  ]);

  const stockMap: Record<string, number> = {};
  for (const row of stockLevels) {
    stockMap[row.product_id] = row.current_stock;
  }

  return (
    <SalesClient
      key={ctx.branchId}
      initialSales={sales}
      initialProducts={products}
      initialStockMap={stockMap}
    />
  );
}
