import { getMyOrders } from "@/app/actions/rider";
import { OrdersListClient } from "@/components/modules/rider-portal/orders-list-client";

export default async function MyOrdersPage() {
  const { orders } = await getMyOrders();
  return (
    <div className="h-full">
      <OrdersListClient initialOrders={orders} />
    </div>
  );
}
