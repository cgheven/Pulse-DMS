import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, getSales, getProducts } from "@/lib/data";
import { SalesClient } from "@/components/modules/sales/sales-client";
import { formatDateInput } from "@/lib/utils";

export default function SalesPage() {
  return (
    <Suspense fallback={<SalesSkeleton />}>
      <SalesData />
    </Suspense>
  );
}

async function SalesData() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.shop) redirect("/onboarding");

  const shopId = ctx.shop.id;
  const today = formatDateInput(new Date());

  const [sales, products] = await Promise.all([
    getSales(shopId, { from: today, to: today }),
    getProducts(shopId),
  ]);

  return (
    <SalesClient
      initialSales={sales}
      initialProducts={products}
      shopId={shopId}
    />
  );
}

function SalesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="animate-pulse bg-muted rounded-xl h-9 w-48" />
        <div className="animate-pulse bg-muted rounded-xl h-4 w-36" />
      </div>
      <div className="animate-pulse bg-muted rounded-xl h-28" />
      <div className="animate-pulse bg-muted rounded-xl h-64" />
      <div className="animate-pulse bg-muted rounded-xl h-80" />
    </div>
  );
}
