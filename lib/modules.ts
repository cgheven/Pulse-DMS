import { cache } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Module registry ────────────────────────────────────────────────────────
// Add new optional modules here. Each shop opts in/out per module via the
// dms_shop_modules table (super-admin toggle at /admin/modules). No row for
// a (shop_id, module_key) pair means the module is disabled.

export const MODULE_KEYS = {
  rider_management: {
    key: "rider_management",
    label: "Rider Management",
    description:
      "Delivery riders, mobile order taking with GPS, cash & cheque collection, and rider reports.",
  },
} as const;

export type ModuleKey = keyof typeof MODULE_KEYS;
export const ALL_MODULE_KEYS = Object.keys(MODULE_KEYS) as ModuleKey[];

export function modulesTag(shopId: string) {
  return `shop-modules:${shopId}`;
}

// React cache() dedupes within one request; unstable_cache adds cross-request
// TTL + tag invalidation (super-admin toggle calls revalidateTag(modulesTag(shopId))).
export const getEnabledModules = cache(
  async (shopId: string): Promise<Set<ModuleKey>> => {
    const fetchEnabled = unstable_cache(
      async () => {
        const admin = createAdminClient();
        const { data } = await admin
          .from("dms_shop_modules")
          .select("module_key")
          .eq("shop_id", shopId)
          .eq("enabled", true);
        return (data ?? []).map((r) => r.module_key as ModuleKey);
      },
      [`shop-modules-${shopId}`],
      { tags: [modulesTag(shopId)], revalidate: 60 }
    );
    return new Set(await fetchEnabled());
  }
);

export async function isModuleEnabled(
  shopId: string | null | undefined,
  key: ModuleKey
): Promise<boolean> {
  if (!shopId) return false;
  return (await getEnabledModules(shopId)).has(key);
}

// Layouts / server components: redirect if disabled. This is the real
// enforcement point — client-side nav hiding is UX only, never security.
export async function requireModuleOrRedirect(
  shopId: string | null | undefined,
  key: ModuleKey,
  fallback = "/dashboard"
) {
  if (!(await isModuleEnabled(shopId, key))) redirect(fallback);
}

// Server actions: throw if disabled, so callers get a normal { error } result
// instead of silently succeeding against a feature the shop hasn't enabled.
export async function requireModuleOrThrow(
  shopId: string | null | undefined,
  key: ModuleKey
) {
  if (!(await isModuleEnabled(shopId, key))) {
    throw new Error(`${MODULE_KEYS[key].label} is not enabled for this shop`);
  }
}

// Generic guard alias — throws by default (safe default for server actions).
export const requireModule = requireModuleOrThrow;
