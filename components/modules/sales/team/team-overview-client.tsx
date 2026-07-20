"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users2, UserPlus, ChevronDown, ChevronRight, SlidersHorizontal, Trophy,
} from "lucide-react";
import { createTeamRep, setTeamMemberGoals } from "@/app/actions/sales-manager";
import type { TeamMemberEarnings } from "@/lib/sales-manager-types";
import type { SalesTeamMember } from "@/app/actions/admin-sales-teams";
import { AddSalesRepModal } from "@/components/modules/shared/add-sales-rep-modal";
import { SetGoalsModal } from "@/components/modules/shared/set-goals-modal";

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function MiniBar({ label, value, target, unit }: {
  label: string; value: number; target: number; unit?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const tone =
    target === 0 ? "bg-white/10" :
    pct >= 100   ? "bg-emerald-500" :
    pct >= 50    ? "bg-amber-500" :
    "bg-rose-500";

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">
          {unit === "PKR" ? value.toLocaleString() : value}
          <span className="text-muted-foreground font-normal">
            {" / "}{target > 0 ? (unit === "PKR" ? target.toLocaleString() : target) : "—"}
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RepCard({ member, isTop, onSetGoals }: {
  member: TeamMemberEarnings;
  isTop: boolean;
  onSetGoals: (m: TeamMemberEarnings) => void;
}) {
  return (
    <div className="rounded-xl border border-sidebar-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/sales/team/${member.user_id}`} className="flex items-center gap-3 min-w-0 group">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            {initials(member.full_name)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
              {member.full_name ?? "—"}
              {isTop && <Trophy size={13} className="text-amber-400 shrink-0" />}
            </p>
            <p className="text-xs text-muted-foreground">
              {member.leads_assigned} assigned · {member.deals_closed} converted
            </p>
          </div>
        </Link>
        <button
          onClick={() => onSetGoals(member)}
          title="Set goals & commission"
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sidebar-border text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
        >
          <SlidersHorizontal size={12} />
          Goals
        </button>
      </div>

      <div className="space-y-2.5">
        <MiniBar label="Deals this month" value={member.deals_closed} target={member.goals.monthly_deal_target} />
        <MiniBar label="Revenue this month" value={member.revenue_this_month} target={member.goals.monthly_revenue_target} unit="PKR" />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-sidebar-border/60">
        <span className="text-xs text-muted-foreground">Commission earned</span>
        <span className="text-sm font-bold text-emerald-400">PKR {member.commission_earned.toLocaleString()}</span>
      </div>

      <Link href={`/sales/team/${member.user_id}`}
        className="flex items-center justify-center gap-1 w-full py-2 rounded-lg border border-sidebar-border text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
        View leads <ChevronRight size={12} />
      </Link>
    </div>
  );
}

export default function TeamOverviewClient({
  teams,
  activeTeamId,
  activeTeamName,
  members: initialMembers,
  totals,
  error,
}: {
  teams: { id: string; name: string }[];
  activeTeamId: string;
  activeTeamName: string;
  members: TeamMemberEarnings[];
  totals: { deals_closed: number; revenue_this_month: number; commission_earned: number };
  error?: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [goalsTarget, setGoalsTarget] = useState<TeamMemberEarnings | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Leaderboard: whoever is furthest along their deal target leads the list.
  const ranked = [...members].sort((a, b) => {
    const pa = a.goals.monthly_deal_target > 0 ? a.deals_closed / a.goals.monthly_deal_target : a.deals_closed ? 1 : 0;
    const pb = b.goals.monthly_deal_target > 0 ? b.deals_closed / b.goals.monthly_deal_target : b.deals_closed ? 1 : 0;
    return pb - pa;
  });

  const repCount = members.length;
  const leadsAssigned = members.reduce((sum, m) => sum + m.leads_assigned, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-foreground">Team Management</h1>
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
              Manager
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeTeamName} · {repCount} rep{repCount !== 1 ? "s" : ""} — oversee performance and assign goals
          </p>
        </div>
        <div className="flex items-center gap-2">
          {teams.length > 1 && (
            <div className="relative">
              <select
                value={activeTeamId}
                onChange={e => router.push(`/sales/team?team=${e.target.value}`)}
                className="appearance-none rounded-xl border border-sidebar-border bg-sidebar pl-3 pr-8 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <UserPlus size={15} />Add Rep
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Team totals — an oversight snapshot, not a personal scorecard */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-sidebar-border bg-sidebar p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reps</p>
          <p className="text-3xl font-black text-foreground mt-1">{repCount}</p>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-sidebar p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leads Assigned</p>
          <p className="text-3xl font-black text-foreground mt-1">{leadsAssigned}</p>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-sidebar p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deals Closed</p>
          <p className="text-3xl font-black text-foreground mt-1">{totals.deals_closed}</p>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-sidebar p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue</p>
          <p className="text-3xl font-black text-foreground mt-1">{totals.revenue_this_month.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold text-emerald-400/70 uppercase tracking-wide">Commission</p>
          <p className="text-3xl font-black text-emerald-400 mt-1">{totals.commission_earned.toLocaleString()}</p>
        </div>
      </div>

      {/* Rep performance cards */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center py-20 rounded-xl border border-dashed border-sidebar-border">
          <Users2 size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No reps on your team yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4 max-w-xs text-center">
            Add sales reps to assign them goals and track their performance from here.
          </p>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <UserPlus size={14} />Add Your First Rep
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Rep Performance</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ranked.map((m, i) => (
              <RepCard key={m.member_id} member={m} isTop={i === 0 && m.deals_closed > 0} onSetGoals={setGoalsTarget} />
            ))}
          </div>
        </div>
      )}

      {goalsTarget && (
        <SetGoalsModal
          member={{
            id: goalsTarget.member_id,
            full_name: goalsTarget.full_name,
            email: null,
            ...goalsTarget.goals,
          }}
          action={setTeamMemberGoals}
          onClose={() => setGoalsTarget(null)}
          onSaved={(goals) => setMembers(prev => prev.map(m =>
            m.member_id === goalsTarget.member_id ? { ...m, goals } : m
          ))}
        />
      )}

      {showAdd && (
        <AddSalesRepModal
          teamName={activeTeamName}
          allowManagerRole={false}
          action={(data) => createTeamRep({ ...data, role: "member", team_id: activeTeamId })}
          onClose={() => setShowAdd(false)}
          onAdded={() => router.refresh()}
        />
      )}
    </div>
  );
}
