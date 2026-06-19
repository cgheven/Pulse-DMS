import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import { Building2, Clock, AlertTriangle, Users } from "lucide-react";

export const dynamic = "force-dynamic";

// ── Cache tags (shared with action files) ──────────────────────────────────────
export const CLIENTS_CACHE_TAG = "admin-dms-clients";
export const LEADS_CACHE_TAG = "admin-dms-leads";

// ── Cached stats fetch ────────────────────────────────────────────────────────

type RecentShop = {
  id: string;
  shop_name: string;
  owner_id: string;
  trial_ends_at: string | null;
  created_at: string;
  owner_name: string | null;
};

type AdminStats = {
  total_clients: number;
  active_trials: number;
  expiring_soon: number;
  expired_trials: number;
  total_leads: number;
  leads_by_status: Record<string, number>;
  recent_shops: RecentShop[];
};

const fetchAdminStats = unstable_cache(
  async (): Promise<AdminStats> => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_dms_admin_stats");
    if (error) throw error;
    return data as AdminStats;
  },
  ["admin-dashboard-stats"],
  { revalidate: 30, tags: [CLIENTS_CACHE_TAG, LEADS_CACHE_TAG] }
);

// ── Trial status badge ────────────────────────────────────────────────────────

function TrialBadge({ trialEndsAt }: { trialEndsAt: string | null }) {
  if (!trialEndsAt) {
    return <span className="text-xs text-muted-foreground">Full Access</span>;
  }

  const now = Date.now();
  const ends = new Date(trialEndsAt).getTime();
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  if (ends <= now) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
        Expired
      </span>
    );
  }

  if (ends - now <= threeDays) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
        Expiring
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
      Active
    </span>
  );
}

// ── Lead status colours ───────────────────────────────────────────────────────

const LEAD_STATUS_STYLE: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  contacted: "bg-blue-500/10 text-blue-400",
  demo_done: "bg-purple-500/10 text-purple-400",
  negotiating: "bg-amber-500/10 text-amber-400",
  won: "bg-emerald-500/10 text-emerald-400",
  lost: "bg-red-500/10 text-red-400",
};

const LEAD_STATUS_ORDER = ["new", "contacted", "demo_done", "negotiating", "won", "lost"];

// ── Admin guard (never cached — validates the live session) ───────────────────

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
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  // Auth check is NOT cached — always validates the current session
  await requireAdmin();

  const stats = await fetchAdminStats();

  const {
    total_clients,
    active_trials,
    expiring_soon,
    total_leads,
    leads_by_status,
    recent_shops,
  } = stats;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Overview of all clients and leads
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Total Clients */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Total Clients
            </span>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-3xl font-bold text-foreground">{total_clients}</span>
        </div>

        {/* Active Trials */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Active Trials
            </span>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-3xl font-bold text-foreground">{active_trials}</span>
        </div>

        {/* Expiring Soon */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Expiring Soon
            </span>
            <AlertTriangle
              className={`w-4 h-4 ${expiring_soon > 0 ? "text-amber-400" : "text-muted-foreground"}`}
            />
          </div>
          <span
            className={`text-3xl font-bold ${expiring_soon > 0 ? "text-amber-400" : "text-foreground"}`}
          >
            {expiring_soon}
          </span>
        </div>

        {/* Total Leads */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Total Leads
            </span>
            <Users className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-3xl font-bold text-foreground">{total_leads}</span>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Recent Clients */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">Recent Clients</h2>

          {recent_shops.length > 0 ? (
            <ul className="divide-y divide-sidebar-border">
              {recent_shops.map((shop) => (
                <li key={shop.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {shop.shop_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {shop.owner_name ?? "Unknown owner"} &middot;{" "}
                      {new Date(shop.created_at).toLocaleDateString("en-PK")}
                    </p>
                  </div>
                  <TrialBadge trialEndsAt={shop.trial_ends_at} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No shops yet.</p>
          )}
        </div>

        {/* Lead Pipeline */}
        <div className="rounded-xl border border-sidebar-border bg-card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">Lead Pipeline</h2>

          {total_leads > 0 ? (
            <ul className="space-y-2.5">
              {LEAD_STATUS_ORDER.map((status) => {
                const count = leads_by_status[status] ?? 0;
                const style = LEAD_STATUS_STYLE[status] ?? "bg-muted text-muted-foreground";
                const label = status.replace(/_/g, " ");
                return (
                  <li key={status} className="flex items-center justify-between gap-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}
                    >
                      {label}
                    </span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No leads yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
