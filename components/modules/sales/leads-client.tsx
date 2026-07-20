"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, RefreshCw, Loader2, Trash2, Inbox } from "lucide-react";
import {
  getLeadDetail, updateLeadStatus, setLeadPriority, updateFollowUpDate,
  addActivity, deleteLead, type Lead,
} from "@/app/actions/sales-rep";
import {
  LEAD_STATUS_CONFIG, LEAD_STATUS_ORDER, followUpUrgency, type LeadStatus,
} from "@/lib/lead-status";
import type { LeadPriority } from "@/lib/lead-priority";
import LeadsTable, { type LeadRow } from "@/components/modules/sales/leads-table";
import LeadFormModal from "@/components/modules/sales/lead-form-modal";
import LeadViewDialog from "@/components/modules/sales/lead-view-dialog";
import StatusChangeModal from "@/components/modules/sales/status-change-modal";

type DateFilter = "all" | "today" | "week" | "month";
type FollowUpFilter = "all" | "overdue" | "today" | "week";

// Statuses that can't be written blind — they collect payment or a reason first.
const CONFIRM_STATUSES: readonly LeadStatus[] = ["converted", "rejected"];

function Pill({ active, onClick, children, count }: {
  active: boolean; onClick: () => void; children: React.ReactNode; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${active ? "bg-primary/20" : "bg-white/5"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function LeadsClient({ leads: initialLeads }: { leads: Lead[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");

  const [formLead, setFormLead] = useState<Lead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [viewLead, setViewLead] = useState<LeadRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadRow | null>(null);
  const [statusChange, setStatusChange] = useState<{ lead: LeadRow; next: LeadStatus } | null>(null);
  const [pending, startTransition] = useTransition();

  const leads = initialLeads as LeadRow[];

  function refresh() {
    startTransition(() => router.refresh());
  }

  // Counts are computed over the date/search/follow-up filtered set (but before
  // the status filter) so each pill shows how many rows it would actually reveal.
  const preStatusFiltered = useMemo(() => {
    let rows = leads;

    if (dateFilter !== "all") {
      const since = dateFilter === "today" ? daysAgo(0) : dateFilter === "week" ? daysAgo(7) : daysAgo(30);
      rows = rows.filter(l => new Date(l.created_at) >= since);
    }

    if (followUpFilter !== "all") {
      rows = rows.filter(l => followUpUrgency(l.next_followup_date) === (followUpFilter === "week" ? "future" : followUpFilter));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(l =>
        l.business_name.toLowerCase().includes(q) ||
        l.contact_name.toLowerCase().includes(q) ||
        (l.whatsapp_number ?? "").includes(q) ||
        (l.city ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [leads, dateFilter, followUpFilter, search]);

  const counts = useMemo(() => {
    const map = {} as Record<LeadStatus, number>;
    for (const s of LEAD_STATUS_ORDER) map[s] = 0;
    for (const l of preStatusFiltered) map[l.status]++;
    return map;
  }, [preStatusFiltered]);

  const filtered = useMemo(
    () => (status === "all" ? preStatusFiltered : preStatusFiltered.filter(l => l.status === status)),
    [preStatusFiltered, status]
  );

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const res = await deleteLead(id);
      setDeleteTarget(null);
      if (res.error) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
            <Inbox size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">My Leads</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Track every conversation from first contact to closed deal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={pending}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-sidebar-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button onClick={() => { setFormLead(null); setFormOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus size={15} />Add Lead
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-sidebar-border bg-sidebar p-1.5">
        <Pill active={status === "all"} onClick={() => setStatus("all")} count={preStatusFiltered.length}>All</Pill>
        {LEAD_STATUS_ORDER.map(s => (
          <Pill key={s} active={status === s} onClick={() => setStatus(s)} count={counts[s]}>
            {LEAD_STATUS_CONFIG[s].label}
          </Pill>
        ))}
      </div>

      {/* Search — its own row for breathing room */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search business, contact, phone, city…"
          className="w-full pl-11 pr-3 py-3 rounded-xl border border-sidebar-border bg-sidebar text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
      </div>

      {/* Date + follow-up filters — separate row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar p-1">
          <span className="px-2.5 text-xs font-medium text-muted-foreground">Added</span>
          {([["all", "All"], ["today", "Today"], ["week", "7d"], ["month", "30d"]] as [DateFilter, string][]).map(([k, l]) => (
            <Pill key={k} active={dateFilter === k} onClick={() => setDateFilter(k)}>{l}</Pill>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar p-1">
          <span className="px-2.5 text-xs font-medium text-muted-foreground">Follow-up</span>
          {([["all", "All"], ["overdue", "Overdue"], ["today", "Today"], ["week", "Upcoming"]] as [FollowUpFilter, string][]).map(([k, l]) => (
            <Pill key={k} active={followUpFilter === k} onClick={() => setFollowUpFilter(k)}>{l}</Pill>
          ))}
        </div>

        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {leads.length}</span>
      </div>

      <LeadsTable
        leads={filtered}
        title="Leads"
        description="Track pipeline stage, set follow-ups, and close deals."
        onView={setViewLead}
        onStatusChange={(id, next) => updateLeadStatus(id, next)}
        onPriorityChange={(id, next) => setLeadPriority(id, next as LeadPriority)}
        onEdit={lead => { setFormLead(lead); setFormOpen(true); }}
        onDelete={setDeleteTarget}
        confirmStatuses={CONFIRM_STATUSES}
        onStatusNeedsConfirm={(lead, next) => setStatusChange({ lead, next })}
        emptyMessage={leads.length === 0 ? "No leads yet — add your first one" : "No leads match these filters"}
      />

      {formOpen && (
        <LeadFormModal lead={formLead} onClose={() => setFormOpen(false)} onSaved={() => router.refresh()} />
      )}

      {viewLead && (
        <LeadViewDialog
          lead={viewLead}
          loadActivities={async (id) => {
            const res = await getLeadDetail(id);
            return { activities: res.activities, error: res.error };
          }}
          onLogActivity={(id, type, note) => addActivity({ lead_id: id, activity_type: type, note })}
          onFollowUpChange={async (id, date) => {
            const res = await updateFollowUpDate(id, date);
            if (!res.error) router.refresh();
            return res;
          }}
          onStatusChange={async (id, next) => {
            const res = await updateLeadStatus(id, next);
            if (!res.error) router.refresh();
            return res;
          }}
          onPriorityChange={async (id, next) => {
            const res = await setLeadPriority(id, next as LeadPriority);
            if (!res.error) router.refresh();
            return res;
          }}
          confirmStatuses={CONFIRM_STATUSES}
          onStatusNeedsConfirm={(lead, next) => { setViewLead(null); setStatusChange({ lead: lead as LeadRow, next }); }}
          onDelete={(lead) => { setViewLead(null); setDeleteTarget(lead as LeadRow); }}
          onClose={() => setViewLead(null)}
        />
      )}

      {statusChange && (
        <StatusChangeModal
          lead={statusChange.lead}
          nextStatus={statusChange.next}
          onClose={() => setStatusChange(null)}
          onSaved={() => { setStatusChange(null); router.refresh(); }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={16} className="text-red-400" />
              <h3 className="text-base font-bold text-foreground">Delete lead</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Delete <span className="font-semibold text-foreground">{deleteTarget.business_name}</span> and its activity
              history? This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-white/5">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={pending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                {pending && <Loader2 size={13} className="animate-spin" />}Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
