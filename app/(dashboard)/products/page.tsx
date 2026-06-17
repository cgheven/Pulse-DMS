import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, getProducts, getSuppliers } from "@/lib/data";
import { ProductsClient } from "@/components/modules/products/products-client";

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <ProductsData />
    </Suspense>
  );
}

async function ProductsData() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.shop) redirect("/onboarding");

  const [products, suppliers] = await Promise.all([
    getProducts(ctx.shop.id),
    getSuppliers(ctx.shop.id),
  ]);

  return <ProductsClient products={products} suppliers={suppliers} shopId={ctx.shop.id} />;
}

function ProductsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="animate-pulse bg-muted rounded-xl h-9 w-48" />
        <div className="animate-pulse bg-muted rounded-xl h-4 w-36" />
      </div>
      <div className="animate-pulse bg-muted rounded-xl h-10 w-48" />
      <div className="animate-pulse bg-muted rounded-xl h-64" />
    </div>
  );
}
