"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";

// ── Cache tag ─────────────────────────────────────────────────────────────────

const SHOPS_CACHE_TAG = "admin-dms-shops";

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

export type DmsShopView = {
  id: string;
  owner_id: string;
  shop_name: string;
  trial_plan: string | null;
  trial_ends_at: string | null;
  is_active: boolean;
  phone: string | null;
  city: string | null;
  created_at: string;
  owner_email: string | null;
};

// ── Cached data fetch (auth-independent, 60-second TTL) ───────────────────────

const fetchShopsData = unstable_cache(
  async (): Promise<DmsShopView[]> => {
    const admin = createAdminClient();

    const [shopsRes, authRes] = await Promise.all([
      admin
        .from("dms_shops")
        .select("id, owner_id, shop_name, trial_plan, trial_ends_at, is_active, phone, city, created_at")
        .order("created_at", { ascending: false }),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    if (shopsRes.error) throw shopsRes.error;
    if (authRes.error) throw authRes.error;

    const authMap = new Map(
      (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? null])
    );

    const shops: DmsShopView[] = (shopsRes.data ?? []).map((s) => ({
      id: s.id,
      owner_id: s.owner_id,
      shop_name: s.shop_name,
      trial_plan: s.trial_plan,
      trial_ends_at: s.trial_ends_at,
      is_active: s.is_active,
      phone: s.phone,
      city: s.city,
      created_at: s.created_at,
      owner_email: authMap.get(s.owner_id) ?? null,
    }));

    return shops;
  },
  ["admin-dms-shops"],
  { revalidate: 60, tags: [SHOPS_CACHE_TAG] }
);

// ── List shops ────────────────────────────────────────────────────────────────

export async function listDmsShops(): Promise<{
  shops?: DmsShopView[];
  error?: string;
}> {
  try {
    await requireAdmin(); // security check — NOT cached
    const shops = await fetchShopsData();
    return { shops };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list shops" };
  }
}

// ── Delete shop ───────────────────────────────────────────────────────────────

export async function deleteDmsShop(shopId: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    if (!shopId) throw new Error("shopId is required");

    const admin = createAdminClient();
    const { error } = await admin.from("dms_shops").delete().eq("id", shopId);
    if (error) throw error;

    // Invalidate shops cache so the deleted shop disappears immediately
    revalidateTag(SHOPS_CACHE_TAG);

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete shop" };
  }
}
