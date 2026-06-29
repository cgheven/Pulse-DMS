"use client";

import { useState, useTransition } from "react";
import {
  Users2, Plus, UserPlus, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Trash2, Loader2, Eye, EyeOff,
  SlidersHorizontal,
} from "lucide-react";
import {
  createSalesTeam, createSalesRep, removeTeamMember, toggleTeamActive,
  type SalesTeam, type SalesTeamMember,
} from "@/app/actions/admin-sales-teams";
import { SetGoalsModal } from "@/components/modules/admin/set-goals-modal";

// ── helpers ──────────────────────────────────────────────────────────────────

function initials(name: string | null, email: string | null) {
  if (name) {
    const parts = name.trim().split(" ");
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

// ── Create Team Modal ─────────────────────────────────────────────────────────

function CreateTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: SalesTeam) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createSalesTeam(name, desc);
      if (res.error) { setError(res.error); return; }
      onCreated({ id: res.teamId!, name, description: desc || null, is_active: true, created_at: new Date().toISOString(), members: [] });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-4">Create Sales Team</h2>
        {error && <p className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Team Name *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. North Region Team"
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
            <textarea
              value={desc} onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit} disabled={pending || !name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Create Team
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Member Modal ──────────────────────────────────────────────────────────

function AddMemberModal({ team, onClose, onAdded }: {
  team: SalesTeam;
  onClose: () => void;
  onAdded: (member: SalesTeamMember) => void;
}) {
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "member" });
  const [showPwd, setShowPwd] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createSalesRep({ ...form, team_id: team.id });
      if (res.error) { setError(res.error); return; }
      onAdded({
        id: res.userId! + "-member",
        team_id: team.id,
        user_id: res.userId!,
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        is_active: true,
        created_at: new Date().toISOString(),
        monthly_commission_pct: 0,
        annual_commission_pct: 0,
        monthly_deal_target: 0,
        monthly_revenue_target: 0,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">Add Sales Rep</h2>
        <p className="text-xs text-muted-foreground mb-4">Add to: <span className="font-semibold text-foreground">{team.name}</span></p>
        {error && <p className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Full Name *</label>
            <input value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Ali Hassan"
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Email *</label>
            <input value={form.email} onChange={e => set("email", e.target.value)} type="email" placeholder="ali@company.com"
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Password *</label>
            <div className="relative">
              <input value={form.password} onChange={e => set("password", e.target.value)} type={showPwd ? "text" : "password"} placeholder="Min 8 characters"
                className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Role</label>
            <select value={form.role} onChange={e => set("role", e.target.value)}
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending || !form.email.trim() || !form.full_name.trim() || form.password.length < 8}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Add Rep
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Team Card ─────────────────────────────────────────────────────────────────

function TeamCard({ team: initialTeam }: { team: SalesTeam }) {
  const [team, setTeam] = useState(initialTeam);
  const [expanded, setExpanded] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [goalsTarget, setGoalsTarget] = useState<SalesTeamMember | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggleActive() {
    startTransition(async () => {
      await toggleTeamActive(team.id, !team.is_active);
      setTeam(t => ({ ...t, is_active: !t.is_active }));
    });
  }

  function handleRemoveMember(memberId: string) {
    startTransition(async () => {
      await removeTeamMember(memberId);
      setTeam(t => ({ ...t, members: t.members.filter(m => m.id !== memberId) }));
    });
  }

  return (
    <>
      <div className={`rounded-xl border ${team.is_active ? "border-sidebar-border" : "border-sidebar-border/50"} bg-card overflow-hidden`}>
        {/* Header */}
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${team.is_active ? "bg-primary/15 border border-primary/25" : "bg-sidebar border border-sidebar-border"}`}>
                <Users2 size={18} className={team.is_active ? "text-primary" : "text-muted-foreground"} />
              </div>
              <div className="min-w-0">
                <p className={`font-bold text-base leading-tight truncate ${team.is_active ? "text-foreground" : "text-muted-foreground"}`}>
                  {team.name}
                </p>
                {team.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{team.description}</p>
                )}
              </div>
            </div>
            <button onClick={handleToggleActive} disabled={pending} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              {team.is_active ? <ToggleRight size={22} className="text-primary" /> : <ToggleLeft size={22} />}
            </button>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{team.members.length}</span> member{team.members.length !== 1 ? "s" : ""}
            </span>
            {!team.is_active && (
              <span className="text-xs bg-zinc-500/15 text-zinc-400 border border-zinc-500/25 px-2 py-0.5 rounded-full font-semibold">Inactive</span>
            )}
          </div>
        </div>

        {/* Member avatars */}
        {team.members.length > 0 && (
          <div className="px-5 pb-3 flex items-center gap-1.5">
            {team.members.slice(0, 5).map(m => (
              <div key={m.id} title={m.full_name ?? m.email ?? "?"}
                className="w-7 h-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[10px] font-bold text-primary"
              >
                {initials(m.full_name, m.email)}
              </div>
            ))}
            {team.members.length > 5 && (
              <span className="text-xs text-muted-foreground ml-1">+{team.members.length - 5} more</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex border-t border-sidebar-border divide-x divide-sidebar-border">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "Hide" : "Members"}
          </button>
          <button
            onClick={() => setShowAddMember(true)}
            disabled={!team.is_active}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <UserPlus size={13} />
            Add Rep
          </button>
        </div>

        {/* Member list */}
        {expanded && (
          <div className="border-t border-sidebar-border divide-y divide-sidebar-border/50">
            {team.members.length === 0 ? (
              <p className="px-5 py-4 text-xs text-muted-foreground text-center">No members yet.</p>
            ) : (
              team.members.map(m => (
                <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                    {initials(m.full_name, m.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{m.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email ?? "—"}</p>
                    {(m.monthly_commission_pct > 0 || m.annual_commission_pct > 0) && (
                      <p className="text-[10px] text-primary/70 mt-0.5 font-medium">
                        {m.monthly_commission_pct > 0 && `M:${m.monthly_commission_pct}%`}
                        {m.monthly_commission_pct > 0 && m.annual_commission_pct > 0 && " · "}
                        {m.annual_commission_pct > 0 && `A:${m.annual_commission_pct}%`}
                        {m.monthly_deal_target > 0 && ` · ${m.monthly_deal_target} deals/mo`}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${m.role === "manager" ? "bg-amber-500/15 text-amber-400 border border-amber-500/25" : "bg-sidebar border border-sidebar-border text-muted-foreground"}`}>
                    {m.role}
                  </span>
                  <button
                    onClick={() => setGoalsTarget(m)}
                    className="text-muted-foreground hover:text-primary transition-colors p-1"
                    title="Set goals & commission"
                  >
                    <SlidersHorizontal size={13} />
                  </button>
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={pending}
                    className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                    title="Remove from team"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showAddMember && (
        <AddMemberModal
          team={team}
          onClose={() => setShowAddMember(false)}
          onAdded={(member) => setTeam(t => ({ ...t, members: [...t.members, member] }))}
        />
      )}
      {goalsTarget && (
        <SetGoalsModal
          member={goalsTarget}
          onClose={() => setGoalsTarget(null)}
          onSaved={(goals) => setTeam(t => ({
            ...t,
            members: t.members.map(m => m.id === goalsTarget.id ? { ...m, ...goals } : m)
          }))}
        />
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SalesTeamsClient({ teams: initialTeams }: { teams: SalesTeam[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sales Teams</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage teams and sales representatives</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          New Team
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-dashed border-sidebar-border">
          <Users2 size={36} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No sales teams yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">Create your first team to get started</p>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus size={14} />
            Create Team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(t => <TeamCard key={t.id} team={t} />)}
        </div>
      )}

      {showCreate && (
        <CreateTeamModal
          onClose={() => setShowCreate(false)}
          onCreated={(t) => setTeams(prev => [t, ...prev])}
        />
      )}
    </div>
  );
}
