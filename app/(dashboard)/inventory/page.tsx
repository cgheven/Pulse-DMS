import { getInventoryData } from "@/lib/data";
import { InventoryClient } from "@/components/modules/inventory/inventory-client";

export default async function InventoryPage() {
  const data = await getInventoryData();
  return <InventoryClient {...data} />;
}
