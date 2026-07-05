import { redirect } from "next/navigation";
import { getAuthContext, getProducts, getSuppliers } from "@/lib/data";
import { ProductsClient } from "@/components/modules/products/products-client";
import type { Product, Supplier } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  const branchId = ctx.branchId ?? null;

  const [products, suppliers]: [Product[], Supplier[]] = branchId
    ? await Promise.all([getProducts(branchId), getSuppliers(branchId)])
    : [[], []];

  return (
    <ProductsClient
      key={branchId ?? "no-branch"}
      branchId={branchId}
      initialProducts={products}
      initialSuppliers={suppliers}
    />
  );
}
