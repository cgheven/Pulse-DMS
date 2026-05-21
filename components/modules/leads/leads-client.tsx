"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Target, Plus, Search, Phone, MessageCircle, CheckCircle2, XCircle,
  Send, Clock, Trash2, ArrowRight, User, ChevronRight, BarChart2, Kanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatDateInput, formatCurrency } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp-reminder";
import {
  createLead, updateLead, deleteLead, setLeadStatus, markLeadLost,
  logLeadActivity, convertLeadToMember,
} from "@/app/actions/leads";
import type {
  Lead, LeadSource, LeadStatus, LeadLostReason, LeadActivityType,
  MembershipPlan, Staff,
} from "@/types";

type PlanLite = Pick<MembershipPlan, "id" | "name" | "price">;
type StaffLite = Pick<Staff, "id" | "full_name" | "role">;
type ActivityRow = { lead_id: string; type: string; content: string | null; created_at: string };

// "2 min ago", "3 hours ago", "5 days ago" — for lead activity timeline
function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Absolute date+time for activity history. Owner needs to know "called him on
// May 9 at 3pm" not just "2 days ago". Format: "11 May, 7:14 PM" or
// "11 May 2025, 7:14 PM" (year only when different from current year).
function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateStr}, ${timeStr}`;
}

// Map activity type → emoji icon. Covers all known types + status_change.
function activityIcon(type: string): string {
  if (type === "call") return "📞";
  if (type === "message") return "💬";
  if (type === "visit") return "🚪";
  if (type === "trial") return "🏋️";
  if (type === "offer") return "🎁";
  if (type === "status_change") return "🔄";
  if (type === "note") return "📝";
  return "•";
}

interface Props {
  gymId: string | null;
  leads: Lead[];
  plans: PlanLite[];
  staff: StaffLite[];
  activities: ActivityRow[];
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: "Walk-in", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
  referral: "Referral", ad: "Ad", website: "Website", google: "Google", other: "Other",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New", contacted: "Contacted", visited: "Visited",
  trial: "Trial", negotiating: "Negotiating", won: "Won", lost: "Lost",
};

type StageConfig = {
  status: LeadStatus;
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
  headerBg: string;
};

const PIPELINE: StageConfig[] = [
  { status: "new",         label: "New",         color: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/25",    dot: "bg-sky-400",    headerBg: "bg-sky-500/[0.06]" },
  { status: "contacted",   label: "Contacted",   color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/25",   dot: "bg-blue-400",   headerBg: "bg-blue-500/[0.06]" },
  { status: "visited",     label: "Visited",     color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/25",  dot: "bg-amber-400",  headerBg: "bg-amber-500/[0.06]" },
  { status: "trial",       label: "Trial",       color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/25", dot: "bg-purple-400", headerBg: "bg-purple-500/[0.06]" },
  { status: "negotiating", label: "Negotiating", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/25", dot: "bg-orange-400", headerBg: "bg-orange-500/[0.06]" },
];

const OFFER_TEMPLATES = [
  { id: "discount20",  label: "20% off first month",       text: "Hi {name}! 🏋️ Special offer — get 20% off your first month. Reply YES to claim before it expires!" },
  { id: "freeTrial",   label: "Free 3-day trial",          text: "Hi {name}! Try our gym FREE for 3 days — no commitment. Just bring your gear and we'll set you up!" },
  { id: "noAdmission", label: "No admission fee",          text: "Hi {name}! Limited-time: skip the admission fee when you sign up this week. Want me to lock it in?" },
  { id: "buddy",       label: "Bring a friend, both save", text: "Hi {name}! Sign up with a friend — both get 15% off + waived admission. Who's your gym buddy?" },
  { id: "followup",    label: "Soft follow-up",            text: "Hi {name}! Just checking in after your visit. Any questions about plans or trainers? Happy to help!" },
];

type ConcernItem = { value: string; label: string };
type ConcernGroup = { group: string; items: ConcernItem[] };

const CONCERN_GROUPS: ConcernGroup[] = [
  {
    group: "💰 Pricing & Payment",
    items: [
      { value: "admission_fee",  label: "Admission fee too high" },
      { value: "monthly_fee",    label: "Monthly fee too high" },
      { value: "installment",    label: "Wants installment / split payment" },
      { value: "family_discount",label: "Wants family or couple discount" },
      { value: "student_discount",label: "Expects student discount" },
    ],
  },
  {
    group: "🏋️ Facility & Equipment",
    items: [
      { value: "machines",       label: "Machines outdated / insufficient" },
      { value: "hygiene",        label: "Hygiene issue" },
      { value: "parking",        label: "No parking available" },
      { value: "female_area",    label: "No female-only hours or area" },
      { value: "lockers",        label: "Locker / changing room issue" },
      { value: "pool_sauna",     label: "No pool / sauna (comparing with competitor)" },
    ],
  },
  {
    group: "📅 Schedule & Trainer",
    items: [
      { value: "timing",         label: "Timing / slot mismatch" },
      { value: "trainer",        label: "Trainer not suitable" },
      { value: "trainer_avail",  label: "Preferred trainer not available on their days" },
      { value: "class_schedule", label: "Preferred class not in schedule (yoga, Zumba, etc.)" },
      { value: "no_equipment",   label: "Specific equipment missing (boxing, CrossFit, etc.)" },
      { value: "no_nutrition",   label: "No nutrition / diet counseling offered" },
    ],
  },
  {
    group: "📍 Location & Access",
    items: [
      { value: "distance",       label: "Too far / distance issue" },
    ],
  },
  {
    group: "🤝 Trust & People",
    items: [
      { value: "needs_reviews",  label: "Wants more reviews / social proof first" },
      { value: "staff_issue",    label: "Bad experience with a staff member" },
      { value: "friend_uninterested", label: "Friend / partner not interested" },
    ],
  },
  {
    group: "👤 Personal Reasons",
    items: [
      { value: "health_issue",   label: "Health issue / doctor restriction" },
      { value: "existing_membership", label: "Already member elsewhere, contract not expired" },
      { value: "family_approval",label: "Family not allowing" },
      { value: "not_ready",      label: "Just browsing / no urgency yet" },
    ],
  },
  {
    group: "🏆 Competitor",
    items: [
      { value: "competitor_price",   label: "Competitor offered lower price" },
      { value: "competitor_location",label: "Competitor closer to home" },
      { value: "competitor_trial",   label: "Doing trial at another gym first" },
    ],
  },
];

const CONCERNS = CONCERN_GROUPS.flatMap((g) => g.items);

const LOST_REASONS: { value: LeadLostReason; label: string }[] = [
  { value: "price",       label: "Price too high" },
  { value: "location",    label: "Location" },
  { value: "schedule",    label: "Schedule mismatch" },
  { value: "competitor",  label: "Joined competitor" },
  { value: "not_ready",   label: "Not ready yet" },
  { value: "no_response", label: "No response" },
  { value: "other",       label: "Other" },
];

function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function followupStatus(date: string | null | undefined, status: LeadStatus) {
  if (!date || status === "won" || status === "lost") return null;
  const today = formatDateInput(new Date());
  if (date < today)  return { text: `Overdue ${daysSince(date)}d`, cls: "text-rose-400 bg-rose-500/10 border-rose-500/20" };
  if (date === today) return { text: "Today", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
  return               { text: `${formatDate(date)}`, cls: "text-muted-foreground bg-white/5 border-white/10" };
}

// ── Main client ───────────────────────────────────────────────────────────────

export function LeadsClient({ gymId, leads, plans, staff, activities }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"pipeline" | "insights">("pipeline");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<LeadStatus>("new");
  const [detailLead, setDetailLead] = useState<Lead | null>(null);

  const trainers = useMemo(() => staff.filter((s) => s.role === "trainer"), [staff]);
  const today = formatDateInput(new Date());

  const stats = useMemo(() => {
    const active = leads.filter((l) => PIPELINE.some((s) => s.status === l.status));
    const overdue = active.filter((l) => l.next_followup_at && l.next_followup_at < today);
    const dueToday = active.filter((l) => l.next_followup_at === today);
    const won = leads.filter((l) => l.status === "won").length;
    const lost = leads.filter((l) => l.status === "lost").length;
    const closedTotal = won + lost;
    return {
      open: active.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      won,
      lost,
      conversionRate: closedTotal > 0 ? Math.round((won / closedTotal) * 100) : 0,
    };
  }, [leads, today]);

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter((l) =>
      l.full_name.toLowerCase().includes(q) ||
      (l.phone ?? "").includes(q) ||
      (l.email ?? "").toLowerCase().includes(q)
    );
  }, [leads, search]);

  function refresh() { router.refresh(); }

  function openCreate(status: LeadStatus = "new") {
    setCreateStatus(status);
    setCreateOpen(true);
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in min-h-0">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight flex items-center gap-3">
            <Target className="w-7 h-7 text-primary" /> Leads
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track every prospect from first contact to member.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Tab switcher */}
          <div className="flex items-center rounded-xl border border-sidebar-border bg-card p-1 gap-1">
            <button
              type="button"
              onClick={() => setTab("pipeline")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === "pipeline"
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Kanban className="w-3.5 h-3.5" /> Pipeline
            </button>
            <button
              type="button"
              onClick={() => setTab("insights")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === "insights"
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Insights
            </button>
          </div>
          {tab === "pipeline" && (
            <Button onClick={() => openCreate()} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" /> Add Lead
            </Button>
          )}
        </div>
      </div>

      {/* Insights tab */}
      {tab === "insights" && (
        <InsightsView leads={leads} activities={activities} />
      )}

      {tab === "pipeline" && <>

      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 rounded-2xl border border-sidebar-border bg-card">
        <StatPill label="Active" value={stats.open} />
        <div className="w-px h-4 bg-white/10" />
        <StatPill label="Due today" value={stats.dueToday} accent={stats.dueToday > 0 ? "amber" : undefined} />
        <StatPill label="Overdue" value={stats.overdue} accent={stats.overdue > 0 ? "rose" : undefined} />
        <div className="w-px h-4 bg-white/10" />
        <StatPill label="Won" value={stats.won} accent="emerald" />
        <StatPill label="Lost" value={stats.lost} />
        <StatPill label="Conversion" value={`${stats.conversionRate}%`} accent={stats.conversionRate >= 50 ? "emerald" : undefined} />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Kanban board */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
        {PIPELINE.map((stage, i) => {
          const stageLeads = filtered.filter((l) => l.status === stage.status);
          return (
            <KanbanColumn
              key={stage.status}
              stage={stage}
              leads={stageLeads}
              isLast={i === PIPELINE.length - 1}
              onCardClick={setDetailLead}
              onAddClick={() => openCreate(stage.status)}
            />
          );
        })}
      </div>

      {/* Won / Lost summary */}
      {(stats.won > 0 || stats.lost > 0) && (
        <ClosedSummary
          won={filtered.filter((l) => l.status === "won")}
          lost={filtered.filter((l) => l.status === "lost")}
          onCardClick={setDetailLead}
        />
      )}

      </> /* end pipeline tab */}

      {/* Dialogs — outside tab conditional so they don't unmount mid-action */}
      {createOpen && (
        <CreateLeadDialog
          plans={plans}
          staff={staff}
          defaultStatus={createStatus}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); refresh(); }}
        />
      )}
      {detailLead && gymId && (
        <LeadDetailDialog
          lead={detailLead}
          plans={plans}
          trainers={trainers}
          activities={activities.filter((a) => a.lead_id === detailLead.id)}
          onClose={() => setDetailLead(null)}
          onChanged={() => { refresh(); setDetailLead(null); }}
        />
      )}
    </div>
  );
}

// ── Insights view ─────────────────────────────────────────────────────────────

function InsightsView({ leads, activities }: { leads: Lead[]; activities: ActivityRow[] }) {
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  // Parse concerns from activity content: "Concern: Label — optional note"
  const concernRows = useMemo(() => {
    const rows: { concernValue: string; concernLabel: string; lead: Lead }[] = [];
    for (const a of activities) {
      if (!a.content?.startsWith("Concern:")) continue;
      const raw = a.content.split(" — ")[0].replace("Concern: ", "").trim();
      const matched = CONCERNS.find((c) => c.label === raw);
      if (!matched) continue;
      const lead = leadById.get(a.lead_id);
      if (!lead) continue;
      rows.push({ concernValue: matched.value, concernLabel: matched.label, lead });
    }
    return rows;
  }, [activities, leadById]);

  // Concern frequency — deduped per lead (one lead can have same concern multiple times)
  const concernStats = useMemo(() => {
    const seen = new Map<string, { label: string; total: number; active: number; lost: number; sources: Map<LeadSource, number> }>();
    const seenPairs = new Set<string>();
    for (const { concernValue, concernLabel, lead } of concernRows) {
      const pairKey = `${lead.id}::${concernValue}`;
      const isActive = PIPELINE.some((s) => s.status === lead.status);
      const isLost = lead.status === "lost";
      if (!seen.has(concernValue)) {
        seen.set(concernValue, { label: concernLabel, total: 0, active: 0, lost: 0, sources: new Map() });
      }
      const s = seen.get(concernValue)!;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        s.total += 1;
        if (isActive) s.active += 1;
        if (isLost) s.lost += 1;
      }
      s.sources.set(lead.source, (s.sources.get(lead.source) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .map(([value, v]) => ({ value, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [concernRows]);

  // Source breakdown — which source generates which concerns most
  const sourceStats = useMemo(() => {
    const map = new Map<LeadSource, { total: number; concerns: Map<string, number> }>();
    const seenPairs = new Set<string>();
    for (const { concernValue, lead } of concernRows) {
      const pairKey = `${lead.id}::${concernValue}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      if (!map.has(lead.source)) map.set(lead.source, { total: 0, concerns: new Map() });
      const s = map.get(lead.source)!;
      s.total += 1;
      s.concerns.set(concernValue, (s.concerns.get(concernValue) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([source, v]) => ({
        source,
        total: v.total,
        topConcern: Array.from(v.concerns.entries()).sort((a, b) => b[1] - a[1])[0],
      }))
      .sort((a, b) => b.total - a.total);
  }, [concernRows]);

  const maxCount = concernStats[0]?.total ?? 1;
  const totalConcerns = concernStats.reduce((s, c) => s + c.total, 0);

  if (totalConcerns === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <BarChart2 className="w-10 h-10 opacity-20" />
        <p className="text-sm">No concern data yet.</p>
        <p className="text-xs text-center max-w-xs">
          When staff log a call or visit and select a client concern, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Summary strip */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 rounded-2xl border border-sidebar-border bg-card">
        <StatPill label="Total concerns logged" value={totalConcerns} />
        <div className="w-px h-4 bg-white/10 self-center" />
        <StatPill label="Unique issues" value={concernStats.length} />
        <StatPill
          label="Top issue"
          value={concernStats[0]?.label ?? "—"}
        />
      </div>

      {/* Top concerns bar chart */}
      <div className="rounded-2xl border border-sidebar-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-1">Why leads don&apos;t convert</p>
        <p className="text-xs text-muted-foreground mb-5">Each bar = unique leads with that concern. One lead counted once per concern.</p>
        <div className="space-y-3">
          {concernStats.map((c) => {
            const pct = Math.round((c.total / maxCount) * 100);
            const group = CONCERN_GROUPS.find((g) => g.items.some((i) => i.value === c.value));
            return (
              <div key={c.value} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-muted-foreground shrink-0 w-24 truncate">{group?.group.split(" ").slice(1).join(" ")}</span>
                    <span className="text-sm text-foreground truncate">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    {c.active > 0 && <span className="text-amber-400">{c.active} active</span>}
                    {c.lost > 0 && <span className="text-rose-400">{c.lost} lost</span>}
                    <span className="font-bold text-foreground w-4 text-right">{c.total}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active vs Lost breakdown */}
      <div className="rounded-2xl border border-sidebar-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-1">Recovery potential</p>
        <p className="text-xs text-muted-foreground mb-5">Active leads with this concern can still be won with the right offer.</p>
        <div className="space-y-2">
          {concernStats.filter((c) => c.active > 0 || c.lost > 0).map((c) => {
            const recoverPct = c.total > 0 ? Math.round((c.active / c.total) * 100) : 0;
            return (
              <div key={c.value} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-sidebar-border/60 bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{c.label}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  {c.active > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      {c.active} still active
                    </span>
                  )}
                  {c.lost > 0 && (
                    <span className="flex items-center gap-1 text-rose-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                      {c.lost} lost
                    </span>
                  )}
                  <span className={`font-semibold ${recoverPct >= 50 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {recoverPct}% recoverable
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source breakdown */}
      {sourceStats.length > 0 && (
        <div className="rounded-2xl border border-sidebar-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-1">Concerns by source</p>
          <p className="text-xs text-muted-foreground mb-5">Which channels bring leads with the most objections.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sourceStats.map((s) => {
              const topConcernLabel = s.topConcern ? CONCERNS.find((c) => c.value === s.topConcern[0])?.label : null;
              return (
                <div key={s.source} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-sidebar-border/60 bg-white/[0.02]">
                  <div>
                    <p className="text-sm font-medium text-foreground">{SOURCE_LABELS[s.source]}</p>
                    {topConcernLabel && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">Top: {topConcernLabel}</p>
                    )}
                  </div>
                  <span className="text-lg font-bold text-foreground shrink-0">{s.total}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action suggestions */}
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5">
        <p className="text-sm font-semibold text-foreground mb-3">Suggested actions</p>
        <div className="space-y-2">
          {concernStats.slice(0, 3).map((c) => {
            const suggestion = ACTION_SUGGESTIONS[c.value] ?? `Review your ${c.label.toLowerCase()} — ${c.total} leads raised this.`;
            return (
              <div key={c.value} className="flex items-start gap-2.5 text-sm">
                <ArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-muted-foreground">{suggestion}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ACTION_SUGGESTIONS: Record<string, string> = {
  admission_fee:       "Offer a waived or discounted admission fee for walk-ins — it removes the first barrier.",
  monthly_fee:         "Introduce an installment option or a starter plan at a lower price point.",
  installment:         "Add a split-payment option (e.g. weekly or fortnightly) to your plans.",
  family_discount:     "Create a couple or family bundle — two memberships at a combined discount.",
  student_discount:    "Introduce a student rate with CNIC/ID verification.",
  machines:            "Prioritise equipment maintenance and share your upgrade roadmap with leads.",
  hygiene:             "Schedule a deep clean and take photos — share them proactively in follow-ups.",
  parking:             "Share a map of nearby parking spots in your follow-up WhatsApp message.",
  female_area:         "Consider designating female-only hours — even 2–3 hours/day can unlock this segment.",
  lockers:             "Audit locker availability — overcrowding in changing rooms kills conversions.",
  pool_sauna:          "Highlight your unique strengths; or research whether adding a sauna is viable.",
  timing:              "Survey active members — if demand exists, add a new time slot.",
  trainer:             "Introduce leads to multiple trainers so the choice feels personalised.",
  trainer_avail:       "Check if preferred trainer can add a session on the lead's day.",
  class_schedule:      "Poll your leads — if 5+ want the same class, it's worth adding.",
  no_equipment:        "Note specific equipment requests — a few targeted purchases can convert multiple leads.",
  no_nutrition:        "Partner with a nutritionist for even one session/week — it's a strong differentiator.",
  distance:            "Offer a free trial to get them in the door — once they experience it, distance matters less.",
  needs_reviews:       "Ask satisfied members for a Google review — social proof closes fence-sitters.",
  staff_issue:         "Investigate the specific incident privately and follow up with the lead personally.",
  friend_uninterested: "Follow up with the lead independently — they may still join solo.",
  health_issue:        "Offer a doctor-friendly intro session and connect them with your trainer.",
  existing_membership: "Set a 30-day reminder — their contract will expire soon.",
  family_approval:     "Send a family-friendly tour invitation — let them bring a family member to see the gym.",
  not_ready:           "Send a light follow-up in 2 weeks with a limited-time offer to create urgency.",
  competitor_price:    "Ask what price they were offered — you may be able to match or add more value.",
  competitor_location: "Highlight your facility quality vs the competitor — closer isn't always better.",
  competitor_trial:    "Offer your own trial in parallel — let the lead compare directly.",
};

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, accent }: { label: string; value: number | string; accent?: "emerald" | "rose" | "amber" }) {
  const valCls = accent === "emerald" ? "text-emerald-400"
               : accent === "rose"    ? "text-rose-400"
               : accent === "amber"   ? "text-amber-400"
               : "text-foreground";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${valCls}`}>{value}</span>
    </div>
  );
}

// ── Kanban column ─────────────────────────────────────────────────────────────

function KanbanColumn({ stage, leads, isLast, onCardClick, onAddClick }: {
  stage: StageConfig;
  leads: Lead[];
  isLast: boolean;
  onCardClick: (l: Lead) => void;
  onAddClick: () => void;
}) {
  return (
    <div className="flex flex-col min-w-[256px] w-64 shrink-0 rounded-2xl border border-sidebar-border bg-card/50 overflow-hidden">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${stage.headerBg} border-b border-sidebar-border/50`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
          <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">{leads.length}</span>
          <button
            type="button"
            onClick={onAddClick}
            className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[60vh]">
        {leads.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-1 text-center">
            <span className="text-xl opacity-20">{isLast ? "🤝" : "📭"}</span>
            <p className="text-[11px] text-muted-foreground">No leads here</p>
          </div>
        ) : (
          leads.map((l) => (
            <LeadCard key={l.id} lead={l} stage={stage} onClick={() => onCardClick(l)} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Lead card ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, stage, onClick }: { lead: Lead; stage: StageConfig; onClick: () => void }) {
  const fb = followupStatus(lead.next_followup_at, lead.status);
  const since = daysSince(lead.last_activity_at ?? lead.updated_at);
  const isStale = since != null && since > 5;

  function openWhatsApp(e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead.phone) { toast({ title: "No phone number", variant: "destructive" }); return; }
    const url = whatsappUrl(lead.phone, `Hi ${lead.full_name.split(" ")[0]}! `);
    if (url) window.open(url, "_blank");
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="w-full text-left rounded-xl border border-sidebar-border/60 bg-card hover:border-sidebar-border hover:bg-white/[0.03] transition-all p-3 group cursor-pointer"
    >
      {/* Name row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full ${stage.bg} ${stage.border} border flex items-center justify-center text-xs font-bold ${stage.color} shrink-0`}>
            {lead.full_name[0]?.toUpperCase()}
          </div>
          <p className="text-sm font-semibold text-foreground truncate">{lead.full_name}</p>
        </div>
        {lead.phone && (
          <button
            type="button"
            onClick={openWhatsApp}
            title="Open WhatsApp"
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {lead.phone && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <Phone className="w-2.5 h-2.5" />{lead.phone}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">{SOURCE_LABELS[lead.source]}</span>
        {lead.plan?.name && <span className="text-[11px] text-muted-foreground">· {lead.plan.name}</span>}
      </div>

      {/* Badges row */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {fb && (
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${fb.cls}`}>
            <Clock className="w-2.5 h-2.5" />{fb.text}
          </span>
        )}
        {isStale && !fb && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-white/10 bg-white/5 text-muted-foreground">
            {since}d idle
          </span>
        )}
      </div>
    </div>
  );
}

// ── Won / Lost summary ────────────────────────────────────────────────────────

function ClosedSummary({ won, lost, onCardClick }: {
  won: Lead[];
  lost: Lead[];
  onCardClick: (l: Lead) => void;
}) {
  const [showWon, setShowWon] = useState(false);
  const [showLost, setShowLost] = useState(false);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Won */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWon((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-500/[0.05] transition-colors"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">Won</span>
            <span className="text-xs text-muted-foreground">{won.length} leads</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showWon ? "rotate-90" : ""}`} />
        </button>
        {showWon && won.length > 0 && (
          <div className="px-3 pb-3 space-y-1.5 border-t border-emerald-500/10 pt-2">
            {won.map((l) => <ClosedCard key={l.id} lead={l} onClick={() => onCardClick(l)} />)}
          </div>
        )}
      </div>

      {/* Lost */}
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLost((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-rose-500/[0.05] transition-colors"
        >
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400" />
            <span className="text-sm font-semibold text-rose-400">Lost</span>
            <span className="text-xs text-muted-foreground">{lost.length} leads</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showLost ? "rotate-90" : ""}`} />
        </button>
        {showLost && lost.length > 0 && (
          <div className="px-3 pb-3 space-y-1.5 border-t border-rose-500/10 pt-2">
            {lost.map((l) => <ClosedCard key={l.id} lead={l} onClick={() => onCardClick(l)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ClosedCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-lg border border-sidebar-border/50 bg-card/50 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{lead.full_name}</p>
        {lead.phone && <span className="text-[11px] text-muted-foreground">{lead.phone}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {SOURCE_LABELS[lead.source]}
        {lead.status === "lost" && lead.lost_reason && ` · ${LOST_REASONS.find((r) => r.value === lead.lost_reason)?.label}`}
        {lead.plan?.name && ` · ${lead.plan.name}`}
      </p>
    </button>
  );
}

// ── Lead detail dialog ────────────────────────────────────────────────────────

function LeadDetailDialog({ lead, plans, trainers, activities: initialActivities, onClose, onChanged }: {
  lead: Lead;
  plans: PlanLite[];
  trainers: StaffLite[];
  activities: ActivityRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [activityNote, setActivityNote] = useState("");
  const [activityType, setActivityType] = useState<LeadActivityType>("note");
  const [concern, setConcern] = useState("");
  const [followupDate, setFollowupDate] = useState(lead.next_followup_at ?? "");
  // Local copy of activities so new logs appear immediately without closing dialog
  const [history, setHistory] = useState<ActivityRow[]>(() => initialActivities);

  const showConcern = activityType === "call" || activityType === "message" || activityType === "visit";
  const [showOffers, setShowOffers] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [showConvert, setShowConvert] = useState(false);

  const currentStageIdx = PIPELINE.findIndex((s) => s.status === lead.status);
  const nextStage = currentStageIdx >= 0 && currentStageIdx < PIPELINE.length - 1
    ? PIPELINE[currentStageIdx + 1] : null;
  const isActive = currentStageIdx >= 0;

  async function moveToStage(status: LeadStatus) {
    setBusy(true);
    const res = await setLeadStatus(lead.id, status);
    setBusy(false);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: `Moved to ${STATUS_LABELS[status]}` }); onChanged(); }
  }

  async function saveFollowup() {
    setBusy(true);
    const res = await updateLead(lead.id, { next_followup_at: followupDate || null });
    setBusy(false);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else toast({ title: "Follow-up saved" });
  }

  async function logActivity() {
    if (!activityNote.trim() && !concern) return;
    const concernLabel = concern ? CONCERNS.find((c) => c.value === concern)?.label : null;
    const parts = [concernLabel ? `Concern: ${concernLabel}` : null, activityNote.trim() || null].filter(Boolean);
    const content = parts.join(" — ");
    setBusy(true);
    const res = await logLeadActivity(lead.id, activityType, content);
    setBusy(false);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: "Logged" });
      // Optimistically add to local history so receptionist sees it immediately
      setHistory((prev) => [{
        lead_id: lead.id,
        type: activityType,
        content,
        created_at: new Date().toISOString(),
      }, ...prev]);
      setActivityNote("");
      setConcern("");
    }
  }

  async function remove() {
    if (!confirm(`Delete "${lead.full_name}"? This is permanent.`)) return;
    setBusy(true);
    const res = await deleteLead(lead.id);
    setBusy(false);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Lead deleted" }); onChanged(); }
  }

  function sendWhatsApp(t: typeof OFFER_TEMPLATES[number]) {
    if (!lead.phone) { toast({ title: "No phone number", variant: "destructive" }); return; }
    const msg = t.text.replace("{name}", lead.full_name.split(" ")[0]);
    const url = whatsappUrl(lead.phone, msg);
    if (!url) { toast({ title: "Invalid phone number", variant: "destructive" }); return; }
    window.open(url, "_blank");
    const content = `Sent: ${t.label}`;
    logLeadActivity(lead.id, "offer", content);
    setHistory((prev) => [{
      lead_id: lead.id,
      type: "offer",
      content,
      created_at: new Date().toISOString(),
    }, ...prev]);
    setShowOffers(false);
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden flex flex-col max-h-[90dvh]">

          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-sidebar-border shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-base font-bold text-primary shrink-0">
                {lead.full_name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg leading-tight">{lead.full_name}</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      <Phone className="w-3 h-3" />{lead.phone}
                    </a>
                  )}
                  <span>{SOURCE_LABELS[lead.source]}{lead.source_detail ? ` · ${lead.source_detail}` : ""}</span>
                  {lead.plan?.name && <span>· {lead.plan.name}</span>}
                  {lead.assignee?.full_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{lead.assignee.full_name}</span>}
                </div>
              </div>
            </div>

            {/* Pipeline stepper */}
            <div className="flex items-center gap-0 mt-4 overflow-x-auto">
              {PIPELINE.map((stage, i) => {
                const isCurrent = lead.status === stage.status;
                const isPast = currentStageIdx >= 0 && i < currentStageIdx;
                return (
                  <div key={stage.status} className="flex items-center">
                    <button
                      type="button"
                      disabled={busy || isCurrent || !isActive}
                      onClick={() => moveToStage(stage.status)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                        isCurrent
                          ? `${stage.bg} ${stage.border} ${stage.color}`
                          : isPast
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                      } disabled:cursor-default`}
                    >
                      {isPast && <CheckCircle2 className="w-3 h-3" />}
                      {isCurrent && <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />}
                      {stage.label}
                    </button>
                    {i < PIPELINE.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-white/15 shrink-0 mx-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-5">

            {/* Fitness goal / notes */}
            {(lead.fitness_goals || lead.notes) && (
              <div className="space-y-2">
                {lead.fitness_goals && (
                  <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
                    <p className="text-[10px] text-primary uppercase tracking-wider font-semibold mb-0.5">Goal</p>
                    <p className="text-sm text-foreground">{lead.fitness_goals}</p>
                  </div>
                )}
                {lead.notes && (
                  <div className="rounded-xl border border-sidebar-border bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Notes</p>
                    <p className="text-sm text-foreground">{lead.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Lost info */}
            {lead.status === "lost" && lead.lost_reason && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-3 py-2.5">
                <p className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold mb-0.5">Lost reason</p>
                <p className="text-sm text-foreground">
                  {LOST_REASONS.find((r) => r.value === lead.lost_reason)?.label ?? lead.lost_reason}
                  {lead.lost_note && <span className="text-muted-foreground"> — {lead.lost_note}</span>}
                </p>
              </div>
            )}

            {/* Next follow-up */}
            {isActive && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow-up</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <DatePicker value={followupDate} onChange={setFollowupDate} />
                  </div>
                  <Button size="sm" onClick={saveFollowup} disabled={busy}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowOffers(true)} disabled={!lead.phone} className="gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Offer
                  </Button>
                </div>
              </div>
            )}

            {/* Log activity */}
            {isActive && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Log activity</p>
                <div className="flex gap-2">
                  <Select value={activityType} onValueChange={(v) => { setActivityType(v as LeadActivityType); setConcern(""); }}>
                    <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">📝 Note</SelectItem>
                      <SelectItem value="call">📞 Call</SelectItem>
                      <SelectItem value="message">💬 Message</SelectItem>
                      <SelectItem value="visit">🚪 Visit</SelectItem>
                      <SelectItem value="trial">🏋️ Trial</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="What happened? (optional)"
                    value={activityNote}
                    onChange={(e) => setActivityNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && logActivity()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={logActivity} disabled={busy || (!activityNote.trim() && !concern)}>Log</Button>
                </div>
                {showConcern && (
                  <Select value={concern || "__none__"} onValueChange={(v) => setConcern(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="w-full text-xs h-8">
                      <SelectValue placeholder="Client concern (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No concern noted —</SelectItem>
                      {CONCERN_GROUPS.map((g) => (
                        <SelectGroup key={g.group}>
                          <SelectLabel className="text-[10px] uppercase tracking-wider">{g.group}</SelectLabel>
                          {g.items.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Activity history — shows previous logs so next caller has context */}
            {history.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    History <span className="text-muted-foreground/60">({history.length})</span>
                  </p>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {history.slice(0, 20).map((a, i) => (
                    <div
                      key={`${a.created_at}-${i}`}
                      className="flex gap-2.5 items-start rounded-lg border border-sidebar-border/60 bg-card/40 px-3 py-2"
                    >
                      <span className="text-base leading-none mt-0.5 shrink-0">
                        {activityIcon(a.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground/90 break-words leading-snug">
                          {a.content || <span className="text-muted-foreground italic">No note</span>}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[10px] font-medium text-primary/80 capitalize">
                            {a.type.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground/40">•</span>
                          <span className="text-[10px] text-muted-foreground" title={formatRelativeTime(a.created_at)}>
                            {formatActivityDate(a.created_at)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">
                            ({formatRelativeTime(a.created_at)})
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {history.length > 20 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      Showing latest 20 of {history.length}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Primary actions */}
            {isActive && (
              <div className="space-y-2">
                {nextStage && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => moveToStage(nextStage.status)}
                    disabled={busy}
                  >
                    Move to {nextStage.label} <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                    onClick={() => setShowConvert(true)}
                    disabled={busy || lead.status === "won"}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Convert
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
                    onClick={() => setShowLost(true)}
                    disabled={busy}
                  >
                    <XCircle className="w-4 h-4" /> Mark Lost
                  </Button>
                </div>
              </div>
            )}

            {/* Won convert again */}
            {lead.status === "won" && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5 text-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <p className="text-sm font-semibold text-emerald-400">Converted to member</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-sidebar-border shrink-0 flex items-center justify-between">
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-xs text-muted-foreground hover:text-rose-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Delete lead
            </button>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp offers */}
      {showOffers && (
        <Dialog open onOpenChange={(o) => !o && setShowOffers(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Send via WhatsApp</DialogTitle>
              <p className="text-xs text-muted-foreground">Opens WhatsApp with a pre-filled message.</p>
            </DialogHeader>
            <div className="space-y-2 py-1">
              {OFFER_TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => sendWhatsApp(t)}
                  className="w-full text-left p-3 rounded-xl border border-sidebar-border bg-card hover:border-primary/30 hover:bg-primary/[0.04] transition-colors">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> {t.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {t.text.replace("{name}", lead.full_name.split(" ")[0])}
                  </p>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showLost && (
        <LostReasonDialog
          onConfirm={async (reason, note) => {
            setBusy(true);
            const res = await markLeadLost(lead.id, reason, note);
            setBusy(false);
            if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
            else { toast({ title: "Marked lost" }); setShowLost(false); onChanged(); }
          }}
          onClose={() => setShowLost(false)}
        />
      )}

      {showConvert && (
        <ConvertDialog
          lead={lead}
          plans={plans}
          trainers={trainers}
          onClose={() => setShowConvert(false)}
          onSaved={() => { setShowConvert(false); onChanged(); }}
        />
      )}
    </>
  );
}

// ── Create lead dialog ────────────────────────────────────────────────────────

function CreateLeadDialog({ plans, staff, defaultStatus, onClose, onSaved }: {
  plans: PlanLite[];
  staff: StaffLite[];
  defaultStatus: LeadStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const trainers = staff.filter((s) => s.role === "trainer");
  const NO_TRAINER = "__none__";
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    source: "walk_in" as LeadSource,
    source_detail: "",
    interested_plan_id: "",
    fitness_goals: "",
    next_followup_at: "",
    assigned_to: NO_TRAINER,
    notes: "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.full_name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    const res = await createLead({
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      source: form.source,
      source_detail: form.source_detail || null,
      interested_plan_id: form.interested_plan_id || null,
      fitness_goals: form.fitness_goals || null,
      next_followup_at: form.next_followup_at || null,
      assigned_to: form.assigned_to === NO_TRAINER ? null : form.assigned_to,
      notes: form.notes || null,
    });
    setSaving(false);
    if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
    toast({ title: "Lead added" });
    onSaved();
  }

  const stage = PIPELINE.find((s) => s.status === defaultStatus);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md flex flex-col gap-0 p-0 max-h-[90dvh]">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-sidebar-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Lead
            {stage && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stage.bg} ${stage.border} ${stage.color}`}>
                {stage.label}
              </span>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Capture the basics — you can add more details later.</p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-3">
          {/* Essentials */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Full Name <span className="text-rose-400">*</span></Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="e.g. Ahmad Raza"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                placeholder="03001234567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as LeadSource })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(SOURCE_LABELS) as [LeadSource, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Next follow-up</Label>
            <DatePicker value={form.next_followup_at} onChange={(v) => setForm({ ...form, next_followup_at: v })} minDate={new Date()} />
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
            {showAdvanced ? "Less details" : "More details"}
          </button>

          {showAdvanced && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Source detail</Label>
                  <Input placeholder="e.g. Saud's friend" value={form.source_detail}
                    onChange={(e) => setForm({ ...form, source_detail: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Interested plan</Label>
                  <Select value={form.interested_plan_id || "__none__"}
                    onValueChange={(v) => setForm({ ...form, interested_plan_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatCurrency(p.price)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Assigned to</Label>
                  <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TRAINER}>— Unassigned —</SelectItem>
                      {trainers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Fitness goals</Label>
                <Input placeholder="e.g. Lose 5kg, build muscle" value={form.fitness_goals}
                  onChange={(e) => setForm({ ...form, fitness_goals: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input placeholder="Anything relevant" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-4 border-t border-sidebar-border shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.full_name.trim()}>
            {saving ? "Adding…" : "Add Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lost reason dialog ────────────────────────────────────────────────────────

function LostReasonDialog({ onConfirm, onClose }: {
  onConfirm: (reason: LeadLostReason, note?: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<LeadLostReason>("price");
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Why was this lost?</DialogTitle></DialogHeader>
        <div className="space-y-1.5 py-2">
          {LOST_REASONS.map((r) => (
            <button key={r.value} type="button" onClick={() => setReason(r.value)}
              className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition-colors ${
                reason === r.value
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}>{r.label}</button>
          ))}
          <div className="space-y-1.5 pt-2">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Will reconsider next month" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason, note || undefined)}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Convert dialog ────────────────────────────────────────────────────────────

function ConvertDialog({ lead, plans, trainers, onClose, onSaved }: {
  lead: Lead; plans: PlanLite[]; trainers: StaffLite[]; onClose: () => void; onSaved: () => void;
}) {
  const NO_TRAINER = "__none__";
  const today = formatDateInput(new Date());
  const targetDate = new Date(); targetDate.setMonth(targetDate.getMonth() + 1);
  const [form, setForm] = useState({
    plan_id: lead.interested_plan_id ?? "",
    monthly_fee: "",
    admission_fee: "0",
    admission_paid: true,
    discount: "0",
    join_date: today,
    plan_expiry_date: formatDateInput(targetDate),
    assigned_trainer_id: lead.assigned_to ?? NO_TRAINER,
  });
  const [saving, setSaving] = useState(false);

  function pickPlan(planId: string) {
    const p = plans.find((pp) => pp.id === planId);
    setForm((f) => ({ ...f, plan_id: planId, monthly_fee: p ? String(p.price) : f.monthly_fee }));
  }

  async function save() {
    setSaving(true);
    const admissionFee = parseFloat(form.admission_fee) || 0;
    const rawDiscount = parseFloat(form.discount) || 0;
    // Discount honored whether admission paid now or later.
    const signupDiscount = admissionFee > 0
      ? Math.min(Math.max(0, rawDiscount), admissionFee)
      : 0;
    const res = await convertLeadToMember(lead.id, {
      plan_id: form.plan_id || null,
      monthly_fee: parseFloat(form.monthly_fee) || 0,
      admission_fee: admissionFee,
      admission_paid: form.admission_paid,
      discount: signupDiscount,
      join_date: form.join_date,
      plan_expiry_date: form.plan_expiry_date,
      assigned_trainer_id: form.assigned_trainer_id === NO_TRAINER ? null : form.assigned_trainer_id,
    });
    setSaving(false);
    if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
    toast({ title: `${lead.full_name} is now a member!` });
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Convert to Member
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Creates a member profile from this lead.</p>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">{lead.full_name}</p>
            <p className="text-xs text-muted-foreground">{lead.phone ?? "no phone"}{lead.email ? ` · ${lead.email}` : ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={form.plan_id || "__none__"} onValueChange={(v) => pickPlan(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatCurrency(p.price)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trainer</Label>
              <Select value={form.assigned_trainer_id} onValueChange={(v) => setForm({ ...form, assigned_trainer_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TRAINER}>SELF</SelectItem>
                  {trainers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monthly Fee</Label>
              <Input type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Admission Fee</Label>
              <Input type="number" value={form.admission_fee} onChange={(e) => setForm({ ...form, admission_fee: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Join Date</Label>
              <DatePicker value={form.join_date} onChange={(v) => setForm({ ...form, join_date: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Plan Expiry</Label>
              <DatePicker value={form.plan_expiry_date} onChange={(v) => setForm({ ...form, plan_expiry_date: v })} />
            </div>
          </div>
          {parseFloat(form.admission_fee) > 0 && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, admission_paid: true })}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  form.admission_paid
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground"
                }`}>Admission Paid</button>
              <button type="button" onClick={() => setForm({ ...form, admission_paid: false })}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  !form.admission_paid
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground"
                }`}>Admission Pending</button>
            </div>
          )}
          {parseFloat(form.admission_fee) > 0 && (
            <div className="space-y-1.5">
              <Label>Discount (PKR)</Label>
              <Input
                type="number"
                min={0}
                max={parseFloat(form.admission_fee) || 0}
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
              {(() => {
                const d = parseFloat(form.discount) || 0;
                const fee = parseFloat(form.admission_fee) || 0;
                if (d > fee) {
                  return <p className="text-xs text-rose-400">Discount cannot exceed admission fee. It will be clamped to {formatCurrency(fee)}.</p>;
                }
                if (d < 0) {
                  return <p className="text-xs text-rose-400">Discount cannot be negative. It will be clamped to 0.</p>;
                }
                return <p className="text-xs text-muted-foreground">One-time discount on admission fee. {form.admission_paid ? "Applied to the admission payment." : "Reduces the outstanding balance."}</p>;
              })()}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            <CheckCircle2 className="w-4 h-4" />{saving ? "Converting…" : "Convert to Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
