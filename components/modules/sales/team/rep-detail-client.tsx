"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Target, TrendingUp, Award, Trophy } from "lucide-react";
import { getLeadDetailForManager } from "@/app/actions/sales-manager";
import type { RepDetailForManager } from "@/lib/sales-manager-types";
import LeadsTable, { type LeadRow } from "@/components/modules/sales/leads-table";
import LeadViewDialog from "@/components/modules/sales/lead-view-dialog";

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="text-2xl font-black text-foreground">{value}</p>
    </div>
  );
}

// Manager's read-only drill-down: the same leads table the rep uses, with the
// mutation handlers omitted so every row renders as a static badge.
export default function RepDetailClient({ data }: { data: RepDetailForManager }) {
  const [viewLead, setViewLead] = useState<LeadRow | null>(null);

  const converted = data.leads.filter(l => l.status === "converted").length;

  return (
    <div className="space-y-5">
      <Link href="/sales/team"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={13} />Back to team
      </Link>

      <div>
        <h1 className="text-2xl font-black text-foreground">{data.repName ?? "Sales Rep"}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data.leads.length} lead{data.leads.length !== 1 ? "s" : ""} · {converted} converted · read-only view
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Target size={15} />} label="Deal Target"
          value={data.goals.monthly_deal_target ? String(data.goals.monthly_deal_target) : "—"} />
        <StatCard icon={<TrendingUp size={15} />} label="Revenue Target"
          value={data.goals.monthly_revenue_target ? data.goals.monthly_revenue_target.toLocaleString() : "—"} />
        <StatCard icon={<Award size={15} />} label="Monthly Comm." value={`${data.goals.monthly_commission_pct}%`} />
        <StatCard icon={<Trophy size={15} />} label="Annual Comm." value={`${data.goals.annual_commission_pct}%`} />
      </div>

      <LeadsTable
        leads={data.leads as LeadRow[]}
        onView={setViewLead}
        emptyMessage="This rep has no leads assigned yet"
      />

      {viewLead && (
        <LeadViewDialog
          lead={viewLead}
          loadActivities={async (id) => {
            const res = await getLeadDetailForManager(id);
            return { activities: res.data?.activities ?? [], error: res.error };
          }}
          onClose={() => setViewLead(null)}
        />
      )}
    </div>
  );
}
