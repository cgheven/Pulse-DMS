import { getMyRiderInfo, getMyOrders, getMyCashCollections, getMyChequeCollections } from "@/app/actions/rider";
import { RiderDashboardClient, type RiderTodayStats } from "@/components/modules/rider-portal/dashboard-client";

export default async function RiderDashboardPage() {
  const [{ info }, { orders }, { collections }, { cheques }] = await Promise.all([
    getMyRiderInfo(),
    getMyOrders(),
    getMyCashCollections(),
    getMyChequeCollections({ status: "pending" }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todaysOrders = orders.filter((o) => o.order_date === today);
  const stats: RiderTodayStats = {
    ordersToday: todaysOrders.length,
    pendingCount: orders.filter((o) => o.status === "pending").length,
    totalToday: todaysOrders.reduce((sum, o) => sum + o.total_amount, 0),
    cashCollectedToday: collections
      .filter((c) => c.collection_date === today)
      .reduce((sum, c) => sum + c.amount, 0),
    pendingChequeCount: cheques.length,
    pendingChequeTotal: cheques.reduce((sum, c) => sum + c.amount, 0),
  };

  return (
    <div className="h-full overflow-y-auto">
      <RiderDashboardClient info={info} stats={stats} />
    </div>
  );
}
