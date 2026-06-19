import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminShopsPage() {
  const admin = createAdminClient();
  const { data: shops } = await admin
    .from("dms_shops")
    .select("id, shop_name, owner_id, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-foreground mb-1">Shops</h1>
      <p className="text-sm text-muted-foreground mb-6">{shops?.length ?? 0} registered shops</p>

      <div className="rounded-xl border border-sidebar-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sidebar-border bg-sidebar">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shop Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sidebar-border">
            {(shops ?? []).map((s) => (
              <tr key={s.id} className="bg-card hover:bg-sidebar/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{s.shop_name}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{s.owner_id.slice(0, 16)}…</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(s.created_at).toLocaleDateString("en-PK")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shops?.length && (
          <div className="px-4 py-12 text-center text-muted-foreground">No shops yet.</div>
        )}
      </div>
    </div>
  );
}
