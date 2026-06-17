import { getAuthContext, getStockLevels, getStockMovements } from "@/lib/data";
import { redirect } from "next/navigation";
import { StockClient } from "@/components/modules/stock/stock-client";

export const metadata = { title: "Stock | DMS" };

export default async function StockPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");

  const shopId = ctx.shop?.id;
  if (!shopId) redirect("/onboarding");

  const [stockLevels, movements] = await Promise.all([
    getStockLevels(shopId),
    getStockMovements(shopId, { limit: 50 }),
  ]);

  return (
    <StockClient
      shopId={shopId}
      initialStockLevels={stockLevels}
      initialMovements={movements}
    />
  );
}
