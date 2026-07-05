import { redirect } from "next/navigation";
import { getAuthContext, getStockLevels, getStockMovements, getStockBatchMovements, getFullProductMovements } from "@/lib/data";
import { computeBatches, type BatchRow } from "@/lib/stock-batches";
import { StockClient } from "@/components/modules/stock/stock-client";

export const metadata = { title: "Stock | DMS" };
export const dynamic = "force-dynamic";

export default async function StockPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.branchId) redirect("/dashboard");

  const [stockLevels, movements, batchMovements] = await Promise.all([
    getStockLevels(ctx.branchId),
    getStockMovements(ctx.branchId, { limit: 60 }),
    getStockBatchMovements(ctx.branchId),
  ]);

  const byProduct: Record<string, typeof batchMovements> = {};
  for (const m of batchMovements) {
    (byProduct[m.product_id] ??= []).push(m);
  }
  const batchMap: Record<string, BatchRow[]> = {};
  for (const level of stockLevels) {
    batchMap[level.product_id] = computeBatches(byProduct[level.product_id] ?? [], level.current_stock);
  }

  // Reconcile the rare product whose windowed history under-accounts for its real
  // stock (i.e. still holds unsold stock older than the window) — refetch just
  // THAT product's full history so its opening batch carries a real historical
  // price instead of falling back to current cost_price. Bounded per-product, so
  // this doesn't reintroduce the old "fetch everything" cost.
  const legacyProductIds = Object.entries(batchMap)
    .filter(([, rows]) => rows.some((r) => r.unitPrice === null))
    .map(([pid]) => pid);
  if (legacyProductIds.length > 0) {
    const stockByProduct: Record<string, number> = {};
    stockLevels.forEach((s) => { stockByProduct[s.product_id] = s.current_stock; });
    const fullHistories = await Promise.all(
      legacyProductIds.map((pid) => getFullProductMovements(ctx.branchId!, pid))
    );
    legacyProductIds.forEach((pid, i) => {
      batchMap[pid] = computeBatches(fullHistories[i], stockByProduct[pid]);
    });
  }

  return (
    <StockClient
      key={ctx.branchId}
      initialStockLevels={stockLevels}
      initialMovements={movements}
      initialBatchMap={batchMap}
    />
  );
}
