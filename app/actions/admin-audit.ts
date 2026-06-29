"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

export type ActivityStatus = "active" | "idle" | "dormant" | "new" | "no_shop";

export type ShopActivity = {
  user_id: string;
  email: string;
  full_name: string | null;
  shop_id: string | null;
  shop_name: string | null;
  shop_phone: string | null;
  trial_plan: string | null;
  trial_ends_at: string | null;
  is_shop_active: boolean;
  last_sign_in_at: string | null;
  joined_at: string;
  sales_7d: number;
  sales_30d: number;
  total_sales: number;
  last_sale_date: string | null;
  total_products: number;
  activity_status: ActivityStatus;
  days_inactive: number | null;
};

export async function listActivityLog(): Promise<{ logs: ShopActivity[]; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const [
      { data: { users }, error: usersErr },
      { data: shopStats, error: statsErr },
      { data: profiles },
    ] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.rpc("admin_shop_activity"),
      admin.from("dms_profiles").select("id, full_name, is_admin"),
    ]);

    if (usersErr) throw usersErr;
    if (statsErr) throw statsErr;

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const shopStatMap = new Map(
      (shopStats as Array<{
        owner_id: string; shop_id: string; shop_name: string; shop_phone: string | null;
        trial_plan: string | null; trial_ends_at: string | null; is_active: boolean;
        sales_7d: number; sales_30d: number; total_sales: number;
        last_sale_date: string | null; total_products: number;
      }> ?? []).map((s) => [s.owner_id, s])
    );

    const now = Date.now();
    const STATUS_ORDER: Record<ActivityStatus, number> = {
      dormant: 0, idle: 1, active: 2, new: 3, no_shop: 4,
    };

    const logs: ShopActivity[] = users
      .filter((u) => {
        const profile = profileMap.get(u.id);
        return profile && !profile.is_admin;
      })
      .map((u) => {
        const profile = profileMap.get(u.id)!;
        const stats = shopStatMap.get(u.id);

        const lastSignInMs = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null;
        const daysInactive = lastSignInMs !== null
          ? Math.floor((now - lastSignInMs) / (1000 * 60 * 60 * 24))
          : null;
        const daysSinceJoined = Math.floor(
          (now - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        let activity_status: ActivityStatus;
        if (!stats) {
          activity_status = "no_shop";
        } else if (daysInactive === null) {
          activity_status = daysSinceJoined <= 3 ? "new" : "dormant";
        } else if (daysInactive <= 3) {
          activity_status = "active";
        } else if (daysInactive <= 14) {
          activity_status = "idle";
        } else {
          activity_status = "dormant";
        }

        return {
          user_id: u.id,
          email: u.email ?? "",
          full_name: profile.full_name ?? null,
          shop_id: stats?.shop_id ?? null,
          shop_name: stats?.shop_name ?? null,
          shop_phone: stats?.shop_phone ?? null,
          trial_plan: stats?.trial_plan ?? null,
          trial_ends_at: stats?.trial_ends_at ?? null,
          is_shop_active: stats?.is_active ?? false,
          last_sign_in_at: u.last_sign_in_at ?? null,
          joined_at: u.created_at,
          sales_7d: Number(stats?.sales_7d ?? 0),
          sales_30d: Number(stats?.sales_30d ?? 0),
          total_sales: Number(stats?.total_sales ?? 0),
          last_sale_date: stats?.last_sale_date ?? null,
          total_products: Number(stats?.total_products ?? 0),
          activity_status,
          days_inactive: daysInactive,
        };
      })
      .sort((a, b) => STATUS_ORDER[a.activity_status] - STATUS_ORDER[b.activity_status]);

    return { logs };
  } catch (err) {
    return {
      logs: [],
      error: err instanceof Error ? err.message : "Failed to fetch activity log",
    };
  }
}
