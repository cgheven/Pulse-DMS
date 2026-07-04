import { notFound } from "next/navigation";
import { getOrderDetail } from "@/app/actions/rider";
import { OrderDetailClient } from "@/components/modules/rider-portal/order-detail-client";

export default async function RiderOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { order, items } = await getOrderDetail(id);
  if (!order) notFound();

  return (
    <div className="h-full">
      <OrderDetailClient order={order} items={items} />
    </div>
  );
}
