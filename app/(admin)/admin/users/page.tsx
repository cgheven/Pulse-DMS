import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("dms_profiles")
    .select("id, full_name, role, shop_id, created_at")
    .order("created_at", { ascending: false });

  const { data: shops } = await admin
    .from("dms_shops")
    .select("id, shop_name, owner_id");

  const shopMap = Object.fromEntries((shops ?? []).map((s) => [s.id, s.shop_name]));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-1">User Management</h1>
      <p className="text-sm text-muted-foreground mb-6">{profiles?.length ?? 0} registered users</p>

      <div className="rounded-xl border border-sidebar-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sidebar-border bg-sidebar">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shop</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sidebar-border">
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="bg-card hover:bg-sidebar/50 transition-colors">
                <td className="px-4 py-3 text-foreground">{p.full_name ?? p.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.shop_id ? (shopMap[p.shop_id] ?? "—") : "No shop"}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{p.role}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString("en-PK")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!profiles?.length && (
          <div className="px-4 py-12 text-center text-muted-foreground">No users yet.</div>
        )}
      </div>
    </div>
  );
}
