import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { requireModuleOrRedirect } from "@/lib/modules";

// Enforces the "rider_management" module gate server-side for the whole
// /riders/* subtree. The sidebar only *shows* this link when the module is
// enabled (contexts/shop-context.tsx + components/layout/sidebar.tsx) — that
// is UX only. Hitting the URL directly must still be blocked here.
export default async function RidersLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.shop) redirect("/dashboard");

  // Owner-only, mirrors the existing "staff sees only Sales" precedent —
  // no new permission tier invented (lib/permissions.ts stays deferred).
  // is_rider/is_sales_rep is extra defense-in-depth against role='owner'
  // alone ever being sufficient (see app/actions/staff.ts's requireShopOwner
  // for the same hardening after a real bug was found there).
  if (ctx.profile?.role !== "owner" || ctx.profile?.is_rider || ctx.profile?.is_sales_rep) redirect("/dashboard");

  await requireModuleOrRedirect(ctx.shop.id, "rider_management", "/dashboard");

  return <>{children}</>;
}
