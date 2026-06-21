import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { listStaff } from "@/app/actions/staff";
import { StaffClient } from "@/components/modules/staff/staff-client";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.profile?.role !== "owner") redirect("/sales");
  const { staff } = await listStaff();
  return <StaffClient staff={staff ?? []} shopName={ctx.shop?.shop_name ?? "My Shop"} />;
}
