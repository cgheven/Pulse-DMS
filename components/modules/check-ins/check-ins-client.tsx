"use client";
import { useState, useMemo } from "react";
import { LogIn, Search, X, CheckCircle2, Users, RefreshCw, Cpu, UserPlus, ChevronRight, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn, formatDateInput } from "@/lib/utils";
import { linkDeviceUser } from "@/app/actions/members";
import { recordCheckIn } from "@/app/actions/check-ins";
import { revalidateDashboard } from "@/app/actions/revalidate";
import type { CheckIn, Member } from "@/types";

type MemberLite = Pick<Member, "id" | "full_name" | "member_number" | "photo_url" | "status" | "plan_expiry_date"> & {
  assigned_trainer_id?: string | null;
  trainer?: { full_name: string } | null;
};

type CheckInRow = CheckIn & {
  member?: (NonNullable<CheckIn["member"]> & {
    assigned_trainer_id?: string | null;
    plan_expiry_date?: string | null;
    outstanding_balance?: number | null;
    trainer?: { full_name: string } | null;
  }) | null;
};

function paymentDue(member: CheckInRow["member"]): { due: boolean; reason: string } {
  if (!member) return { due: false, reason: "" };
  if (member.status === "defaulter") return { due: true, reason: "Defaulter" };
  if ((member.outstanding_balance ?? 0) > 0) return { due: true, reason: `Rs. ${member.outstanding_balance} due` };
  if (member.plan_expiry_date && new Date(member.plan_expiry_date) < new Date()) return { due: true, reason: "Plan expired" };
  return { due: false, reason: "" };
}

type UnlinkedPunch = { id: string; device_user_id: string; device_serial: string; punched_at: string };

interface Props {
  gymId: string | null;
  checkIns: CheckInRow[];
  members: MemberLite[];
  unlinked: UnlinkedPunch[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function CheckInsClient({ gymId, checkIns: initial, members, unlinked: initialUnlinked }: Props) {
  const [checkIns, setCheckIns] = useState<CheckInRow[]>(initial);
  const [unlinked, setUnlinked] = useState<UnlinkedPunch[]>(initialUnlinked);
  const [search, setSearch] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkingInProgress, setLinkingInProgress] = useState<string | null>(null);
  const checkedInIds = useMemo(() => new Set(checkIns.map((c) => c.member_id)), [checkIns]);

  const matches = useMemo(() => {
    if (!search.trim()) return [] as MemberLite[];
    const q = search.toLowerCase();
    return members
      .filter((m) => m.full_name.toLowerCase().includes(q) || (m.member_number ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, members]);

  const linkMatches = useMemo(() => {
    if (!linkSearch.trim()) return [] as MemberLite[];
    const q = linkSearch.toLowerCase();
    return members
      .filter((m) => m.full_name.toLowerCase().includes(q) || (m.member_number ?? "").toLowerCase().includes(q))
      .slice(0, 5);
  }, [linkSearch, members]);

  async function handleLink(member: MemberLite, unlinkedPunch: UnlinkedPunch) {
    setLinkingInProgress(unlinkedPunch.id);
    const result = await linkDeviceUser(member.id, unlinkedPunch.device_user_id, unlinkedPunch.id);
    setLinkingInProgress(null);
    if (result.error) {
      toast({ title: "Error linking member", description: result.error, variant: "destructive" });
      return;
    }
    setUnlinked((prev) => prev.filter((u) => u.id !== unlinkedPunch.id));
    setLinkingId(null);
    setLinkSearch("");
    toast({ title: `${member.full_name} linked`, description: `Device User #${unlinkedPunch.device_user_id} → ${member.full_name}` });
  }

  async function markCheckIn(member: MemberLite) {
    if (!gymId || checkedInIds.has(member.id)) return;
    setMarking(member.id);

    const optimistic: CheckInRow = {
      id: `tmp-${member.id}`,
      gym_id: gymId,
      member_id: member.id,
      checked_in_at: new Date().toISOString(),
      checked_out_at: null,
      check_in_method: "manual",
      notes: null,
      created_at: new Date().toISOString(),
      member: {
        full_name: member.full_name,
        photo_url: member.photo_url,
        member_number: member.member_number,
        status: member.status,
        assigned_trainer_id: member.assigned_trainer_id ?? null,
        trainer: member.trainer ?? null,
      },
    };
    setCheckIns((prev) => [optimistic, ...prev]);
    setSearch("");

    const result = await recordCheckIn(member.id);

    setMarking(null);
    if (result.error || !result.checkIn) {
      setCheckIns((prev) => prev.filter((c) => c.id !== optimistic.id));
      toast({ title: "Error", description: result.error ?? "Failed to record check-in", variant: "destructive" });
      return;
    }
    setCheckIns((prev) => [result.checkIn as CheckInRow, ...prev.filter((c) => c.id !== optimistic.id)]);
    toast({ title: `${member.full_name} checked in` });
    revalidateDashboard().catch(() => {});
  }

  const today = formatDateInput(new Date());

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight">Check-ins</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date(today).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            <span className="ml-2 text-xs text-muted-foreground/60">· All members</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="shrink-0 gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Unlinked punches — inline link flow */}
      {unlinked.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-500/20 flex items-center gap-2.5">
            <UserPlus className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-sm font-semibold text-amber-400">
              {unlinked.length} unlinked device punch{unlinked.length !== 1 ? "es" : ""} — link to a member
            </p>
          </div>
          <div className="divide-y divide-amber-500/10">
            {unlinked.map((u) => (
              <div key={u.id} className="px-5 py-3 space-y-3">
                {/* Row info + button */}
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Device User #{u.device_user_id}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Scanned at {new Date(u.punched_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      {" · "}{u.device_serial}
                    </p>
                  </div>
                  {linkingId === u.id ? (
                    <Button
                      size="sm"
                      className="shrink-0 gap-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300"
                      variant="outline"
                      onClick={() => { setLinkingId(null); setLinkSearch(""); }}
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="shrink-0 gap-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300"
                      variant="outline"
                      disabled={linkingInProgress === u.id}
                      onClick={() => { setLinkingId(u.id); setLinkSearch(""); }}
                    >
                      <Link className="w-3.5 h-3.5" /> Link to Member
                    </Button>
                  )}
                </div>

                {/* Inline search (expanded when this row is active) */}
                {linkingId === u.id && (
                  <div className="ml-13 pl-[52px] space-y-2">
                    <div className="relative max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400/60" />
                      <Input
                        autoFocus
                        placeholder="Search member by name or ID…"
                        value={linkSearch}
                        onChange={(e) => setLinkSearch(e.target.value)}
                        className="pl-8 pr-8 h-8 text-sm bg-amber-500/[0.06] border-amber-500/25 placeholder:text-amber-400/40 focus-visible:ring-amber-500/40"
                      />
                      {linkSearch && (
                        <button
                          type="button"
                          onClick={() => setLinkSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-400/60 hover:text-amber-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {linkSearch.trim() && linkMatches.length === 0 && (
                      <p className="text-xs text-amber-400/60 pl-0.5">No members found</p>
                    )}
                    {linkMatches.length > 0 && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] divide-y divide-amber-500/10 max-w-sm">
                        {linkMatches.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            disabled={linkingInProgress === u.id}
                            onClick={() => handleLink(m, u)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                          >
                            <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0 overflow-hidden">
                              {m.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
                              ) : m.full_name[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                              <p className="text-xs text-muted-foreground">{m.member_number ? `#${m.member_number}` : "—"}</p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
              <LogIn className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="text-2xl font-bold text-foreground">{checkIns.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-sidebar-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active members</p>
              <p className="text-2xl font-bold text-foreground">{members.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-sidebar-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Attendance rate</p>
              <p className="text-2xl font-bold text-foreground">
                {members.length ? Math.round((checkIns.length / members.length) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Walk-in marker */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-sidebar-border">
          <p className="text-sm font-semibold text-foreground">Mark walk-in</p>
          <p className="text-xs text-muted-foreground mt-0.5">Search a member by name or ID, then tap to check in.</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search member…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-9" />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {matches.length > 0 && (
            <div className="rounded-lg border border-sidebar-border divide-y divide-sidebar-border/50 max-w-md">
              {matches.map((m) => {
                const already = checkedInIds.has(m.id);
                const hasDue = m.status === "defaulter" ||
                  (m.plan_expiry_date != null && new Date(m.plan_expiry_date) < new Date());
                return (
                  <div key={m.id} className={cn("flex items-center gap-3 px-3 py-2.5", hasDue && "bg-rose-500/[0.04]")}>
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden", hasDue ? "bg-rose-500/15 text-rose-400" : "bg-primary/15 text-primary")}>
                      {m.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : m.full_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.member_number ? `#${m.member_number} · ` : ""}
                        {m.trainer?.full_name ?? "—"}
                      </p>
                      {hasDue && <p className="text-[10px] font-semibold text-rose-400">⚠ Payment due</p>}
                    </div>
                    {already ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> In
                      </span>
                    ) : (
                      <Button size="sm" disabled={marking === m.id} onClick={() => markCheckIn(m)} className="h-7 text-xs gap-1">
                        <LogIn className="w-3 h-3" /> Check In
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Today's check-ins list */}
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-sidebar-border">
          <p className="text-sm font-semibold text-foreground">Today's check-ins</p>
        </div>
        {checkIns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <LogIn className="w-10 h-10 opacity-20" />
            <p className="text-sm">No check-ins yet today</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trainer</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/50">
                {checkIns.map((c) => {
                  const name = c.member?.full_name ?? "—";
                  const trainerName = c.member?.trainer?.full_name;
                  const { due, reason } = paymentDue(c.member);
                  return (
                    <tr key={c.id} className={cn("transition-colors", due ? "bg-rose-500/[0.04] hover:bg-rose-500/[0.07]" : "hover:bg-white/[0.02]")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden", due ? "bg-rose-500/15 text-rose-400" : "bg-primary/15 text-primary")}>
                            {c.member?.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.member.photo_url} alt="" className="w-full h-full object-cover" />
                            ) : (name[0]?.toUpperCase() ?? "?")}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{name}</p>
                            {due && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400">
                                ⚠ {reason}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground">{c.member?.member_number ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          {trainerName ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-foreground">{formatTime(c.checked_in_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {c.check_in_method === "device" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                            <Cpu className="w-3 h-3" /> Device
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground capitalize">{c.check_in_method}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
