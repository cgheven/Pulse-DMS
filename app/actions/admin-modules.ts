"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { ALL_MODULE_KEYS, modulesTag, type ModuleKey } from "@/lib/modules";

// ── Cache tag ─────────────────────────────────────────────────────────────────

const SHOP_MODULES_CACHE_TAG = "admin-shop-modules";

// ── Admin guard (never cached) ────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("dms_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Forbidden: admin access required");

  return user;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopModulesRow = {
  id: string;
  shop_name: string;
  owner_email: string | null;
  modules: Record<ModuleKey, boolean>;
};

// ── Cached data fetch (auth-independent, 60-second TTL) ───────────────────────

const fetchShopsWithModules = unstable_cache(
  async (): Promise<ShopModulesRow[]> => {
    const admin = createAdminClient();

    const [shopsRes, modulesRes] = await Promise.all([
      admin
        .from("dms_shops")
        .select("id, owner_id, shop_name, created_at")
        .order("created_at", { ascending: false }),
      admin.from("dms_shop_modules").select("shop_id, module_key, enabled"),
    ]);

    if (shopsRes.error) throw shopsRes.error;
    if (modulesRes.error) throw modulesRes.error;

    // Resolve each owner's email via a targeted per-user lookup rather than a
    // single listUsers() call — that call caps at perPage and would silently
    // show "-" for owners once the platform passes that many total auth users.
    const ownerIds = Array.from(
      new Set((shopsRes.data ?? []).map((s) => s.owner_id).filter((id): id is string => !!id))
    );
    const authEntries = await Promise.all(
      ownerIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        return [id, data?.user?.email ?? null] as const;
      })
    );
    const authMap = new Map(authEntries);

    const enabledMap = new Map<string, Set<ModuleKey>>();
    for (const row of modulesRes.data ?? []) {
      if (!row.enabled) continue;
      const set = enabledMap.get(row.shop_id) ?? new Set<ModuleKey>();
      set.add(row.module_key as ModuleKey);
      enabledMap.set(row.shop_id, set);
    }

    return (shopsRes.data ?? []).map((s) => {
      const enabled = enabledMap.get(s.id) ?? new Set<ModuleKey>();
      const modules = Object.fromEntries(
        ALL_MODULE_KEYS.map((key) => [key, enabled.has(key)])
      ) as Record<ModuleKey, boolean>;

      return {
        id: s.id,
        shop_name: s.shop_name,
        owner_email: authMap.get(s.owner_id) ?? null,
        modules,
      };
    });
  },
  ["admin-shop-modules"],
  { revalidate: 60, tags: [SHOP_MODULES_CACHE_TAG] }
);

// ── List shops with module state ──────────────────────────────────────────────

export async function listShopsWithModules(): Promise<{
  shops?: ShopModulesRow[];
  error?: string;
}> {
  try {
    await requireAdmin(); // security check — NOT cached
    const shops = await fetchShopsWithModules();
    return { shops };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list shops" };
  }
}

// ── Toggle a module for a shop ────────────────────────────────────────────────

export async function setShopModule(
  shopId: string,
  moduleKey: ModuleKey,
  enabled: boolean
): Promise<{ error?: string }> {
  try {
    const user = await requireAdmin();

    if (!shopId) throw new Error("shopId is required");
    if (!ALL_MODULE_KEYS.includes(moduleKey)) {
      throw new Error(`Unknown module key: ${moduleKey}`);
    }

    const admin = createAdminClient();
    const { error } = await admin.from("dms_shop_modules").upsert(
      {
        shop_id: shopId,
        module_key: moduleKey,
        enabled,
        enabled_at: enabled ? new Date().toISOString() : null,
        enabled_by: user.id,
      },
      { onConflict: "shop_id,module_key" }
    );
    if (error) throw error;

    revalidateTag(modulesTag(shopId));
    revalidateTag(SHOP_MODULES_CACHE_TAG);

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update module" };
  }
}
