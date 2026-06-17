import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, getDashboardStats } from "@/lib/data";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.shop) redirect("/onboarding");

  const stats = await getDashboardStats(ctx.shop.id);
  return <DashboardClient stats={stats} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="animate-pulse bg-muted rounded-xl h-9 w-48" />
        <div className="animate-pulse bg-muted rounded-xl h-4 w-36" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-28" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-20" />
        ))}
      </div>
    </div>
  );
}
