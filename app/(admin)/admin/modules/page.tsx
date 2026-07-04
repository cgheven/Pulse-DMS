import { listShopsWithModules } from "@/app/actions/admin-modules";
import ShopModulesClient from "@/components/modules/admin/shop-modules-client";

export const dynamic = "force-dynamic";

export default async function AdminModulesPage() {
  const { shops = [], error } = await listShopsWithModules();

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <ShopModulesClient shops={shops} />
    </div>
  );
}
