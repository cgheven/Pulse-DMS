"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";

// ── Cache tag ─────────────────────────────────────────────────────────────────

const CLIENTS_CACHE_TAG = "admin-dms-clients";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsClient = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  shop_id: string | null;
  shop_name: string | null;
  trial_plan: string | null; // '7_day' | '14_day' | '30_day' | 'full' | null
  trial_ends_at: string | null;
  trial_status: "active" | "expiring" | "expired" | "full";
  is_active: boolean;
  is_admin: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
};

// ── Trial helpers ─────────────────────────────────────────────────────────────

function computeTrialStatus(
  trial_ends_at: string | null
): "active" | "expiring" | "expired" | "full" {
  if (!trial_ends_at) return "full";
  const endsAt = new Date(trial_ends_at);
  const now = new Date();
  if (endsAt <= now) return "expired";
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (endsAt <= threeDaysFromNow) return "expiring";
  return "active";
}

function computeTrialEndsAt(trialPlan: string): string | null {
  if (trialPlan === "full") return null;
  const now = new Date();
  const days = trialPlan === "7_day" ? 7 : trialPlan === "14_day" ? 14 : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

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

// ── Cached data fetch (auth-independent, 60-second TTL) ───────────────────────

type ProfileRow = {
  id: string;
  full_name: string | null;
  shop_id: string | null;
  is_admin: boolean | null;
  created_at: string | null;
};

type ShopRow = {
  id: string;
  owner_id: string;
  shop_name: string;
  trial_plan: string | null;
  trial_ends_at: string | null;
  is_active: boolean;
};

const fetchClientsData = unstable_cache(
  async (): Promise<DmsClient[]> => {
    const admin = createAdminClient();

    const [authRes, profilesRes, shopsRes] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin
        .from("dms_profiles")
        .select("id, full_name, shop_id, is_admin, created_at"),
      admin
        .from("dms_shops")
        .select("id, owner_id, shop_name, trial_plan, trial_ends_at, is_active"),
    ]);

    if (authRes.error) throw authRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (shopsRes.error) throw shopsRes.error;

    const profileMap = new Map(
      ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p])
    );
    const shopByOwner = new Map(
      ((shopsRes.data ?? []) as ShopRow[]).map((s) => [s.owner_id, s])
    );

    const clients: DmsClient[] = authRes.data.users.map((u) => {
      const profile = profileMap.get(u.id);
      const shop = shopByOwner.get(u.id);

      return {
        user_id: u.id,
        email: u.email ?? null,
        full_name: profile?.full_name ?? null,
        shop_id: shop?.id ?? profile?.shop_id ?? null,
        shop_name: shop?.shop_name ?? null,
        trial_plan: shop?.trial_plan ?? null,
        trial_ends_at: shop?.trial_ends_at ?? null,
        trial_status: computeTrialStatus(shop?.trial_ends_at ?? null),
        is_active: shop?.is_active ?? false,
        is_admin: profile?.is_admin ?? false,
        created_at: u.created_at ?? profile?.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    });

    clients.sort((a, b) =>
      (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "")
    );

    return clients;
  },
  ["admin-dms-clients"],
  { revalidate: 60, tags: [CLIENTS_CACHE_TAG] }
);

// ── List clients ──────────────────────────────────────────────────────────────

export async function listDmsClients(): Promise<{
  clients?: DmsClient[];
  error?: string;
}> {
  try {
    await requireAdmin(); // security check — NOT cached
    const clients = await fetchClientsData();
    return { clients };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list clients" };
  }
}

// ── Create client ─────────────────────────────────────────────────────────────

export async function createDmsClient(data: {
  email: string;
  password: string;
  full_name: string;
  shop_name?: string;
  trial_plan?: string;
}): Promise<{ userId?: string; shopId?: string; email?: string; full_name?: string; error?: string }> {
  try {
    await requireAdmin();

    if (!data.email || !data.password || data.password.length < 8) {
      throw new Error("Email and password (min 8 characters) are required");
    }

    const trialPlan = data.trial_plan ?? "14_day";
    const trialEndsAt = computeTrialEndsAt(trialPlan);
    const shopName = data.shop_name?.trim();

    const admin = createAdminClient();

    // 1. Create auth user
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: data.email.trim().toLowerCase(),
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
    if (createError) throw createError;

    const userId = created.user.id;

    // 2. Upsert profile — handle_new_dms_user trigger may have already inserted
    const { error: profileError } = await admin.from("dms_profiles").upsert(
      {
        id: userId,
        full_name: data.full_name.trim() || null,
        role: "owner",
      },
      { onConflict: "id" }
    );
    if (profileError) throw profileError;

    let shopId: string | undefined;

    // 3. Insert shop only if a name was provided — otherwise client gets onboarding on first login
    if (shopName) {
      const { data: shop, error: shopError } = await admin
        .from("dms_shops")
        .insert({
          owner_id: userId,
          shop_name: shopName,
          trial_plan: trialPlan,
          trial_ends_at: trialEndsAt,
          is_active: true,
        })
        .select("id")
        .single();
      if (shopError) throw shopError;

      shopId = shop.id;

      // 4. Link shop to profile
      const { error: linkError } = await admin
        .from("dms_profiles")
        .update({ shop_id: shopId })
        .eq("id", userId);
      if (linkError) throw linkError;
    }

    revalidateTag(CLIENTS_CACHE_TAG);

    return { userId, shopId, email: data.email.trim().toLowerCase(), full_name: data.full_name.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create client" };
  }
}

// ── Delete client ─────────────────────────────────────────────────────────────

export async function deleteDmsClient(
  userId: string
): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    if (!userId) throw new Error("userId is required");

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;

    // Invalidate client cache so the deleted user disappears immediately
    revalidateTag(CLIENTS_CACHE_TAG);

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete client" };
  }
}

// ── Update trial ──────────────────────────────────────────────────────────────

export async function updateDmsClientTrial(
  shopId: string,
  trialPlan: string
): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    if (!shopId) throw new Error("shopId is required");
    const validPlans = ["7_day", "14_day", "30_day", "full"];
    if (!validPlans.includes(trialPlan)) {
      throw new Error(`Invalid trial plan. Must be one of: ${validPlans.join(", ")}`);
    }

    const trialEndsAt = computeTrialEndsAt(trialPlan);

    const admin = createAdminClient();
    const { error } = await admin
      .from("dms_shops")
      .update({ trial_plan: trialPlan, trial_ends_at: trialEndsAt })
      .eq("id", shopId);
    if (error) throw error;

    // Invalidate client cache so trial status updates are reflected immediately
    revalidateTag(CLIENTS_CACHE_TAG);

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update trial" };
  }
}
