"use client";
import { useState, useMemo } from "react";
import { TrendingUp, Award, AlertTriangle, Users, Clock, ChevronRight, Sparkles, CalendarClock } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Trainer {
  id: string;
  full_name: string;
  commission_percentage: number | null;
  commission_floor: number | null;
  member_capacity: number;
  default_shift_name: string;
}
interface Member {
  id: string;
  full_name: string;
  member_number: string | null;
  assigned_trainer_id: string | null;
  assigned_shift_id: string | null;
  plan_id: string | null;
  monthly_fee: number;
  join_date: string;
  plan_expiry_date: string | null;
  status: string;
  updated_at: string;
}
interface Plan { id: string; name: string; price: number; }
interface Shift {
  id: string;
  staff_id: string;
  commission_type: string;
  commission_value: number;
  commission_floor: number;
}
interface Props {
  gymId: string | null;
  trainers: Trainer[];
  members: Member[];
  plans: Plan[];
  shifts: Shift[];
  defaultTrainerCapacity: number;
}

// ── Commission formula ────────────────────────────────────────────────────────
// Generic (no shift): keeps = fee minus (fee-floor) * pct.
function keeps(fee: number, floor: number, pct: number): number {
  if (fee <= 0) return 0;
  return Math.max(0, fee - (pct > 0 ? Math.round(Math.max(0, fee - floor) * pct / 100) : 0));
}
function trainerGets(fee: number, floor: number, pct: number): number {
  if (fee <= 0 || pct <= 0) return 0;
  return Math.round(Math.max(0, fee - floor) * pct / 100);
}

// Shift-aware variant — mirrors lib/data.ts + actions/trainer.ts.
// Shift = standalone rule: when assigned, shift.commission_floor is the only
// floor that applies (trainer floor is ignored). No shift → trainer floor + pct.
function trainerGetsForMember(
  fee: number,
  trainerFloor: number,
  trainerPct: number,
  shift: Shift | null,
): number {
  if (fee <= 0) return 0;
  const effectiveFloor = shift ? Number(shift.commission_floor) : trainerFloor;
  const netFee = Math.max(0, fee - effectiveFloor);
  if (shift) {
    return shift.commission_type === "flat"
      ? Number(shift.commission_value)
      : Math.round(netFee * Number(shift.commission_value) / 100);
  }
  if (trainerPct <= 0) return 0;
  return Math.round(netFee * trainerPct / 100);
}
function keepsForMember(
  fee: number,
  trainerFloor: number,
  trainerPct: number,
  shift: Shift | null,
): number {
  return Math.max(0, fee - trainerGetsForMember(fee, trainerFloor, trainerPct, shift));
}

// ── Retention helpers ─────────────────────────────────────────────────────────
const CHURNED = new Set(["expired", "cancelled", "defaulter"]);
function durationMonths(m: Member): number {
  const start = new Date(m.join_date).getTime();
  if (isNaN(start)) return 1;
  const end = CHURNED.has(m.status)
    ? (m.plan_expiry_date ? new Date(m.plan_expiry_date).getTime() : new Date(m.updated_at).getTime())
    : Date.now();
  const computed = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.44));
  return Math.max(1, isNaN(computed) ? 1 : computed);
}
function avgRetention(members: Member[]): number | null {
  if (!members.length) return null;
  return Math.round(members.reduce((s, m) => s + durationMonths(m), 0) / members.length * 10) / 10;
}

// ── Opportunity helpers ───────────────────────────────────────────────────────
type MoveCategory = "easy" | "mid";

interface MemberOpportunity {
  member: Member;
  currentTrainer: Trainer;
  bestTrainer: Trainer;
  monthlyGain: number;       // raw gain, not weighted
  weightedGain: number;      // monthlyGain × riskWeight
  riskWeight: number;
  category: MoveCategory;
  daysRemaining: number | null;
  planProgress: number;      // 0–1
}

function getPlanProgress(m: Member): number {
  if (!m.plan_expiry_date) return 0;
  const joinTime   = new Date(m.join_date).getTime();
  const expiryTime = new Date(m.plan_expiry_date).getTime();
  const duration   = Math.max(1, expiryTime - joinTime);
  const remaining  = Math.max(0, expiryTime - Date.now());
  return Math.min(1, Math.max(0, 1 - remaining / duration));
}

function getRiskWeight(progress: number): number {
  if (progress < 0.2) return 1.00; // new — no attachment
  if (progress < 0.5) return 0.85; // early-mid — some friction
  if (progress < 0.8) return 0.60; // mid-to-late — real churn risk
  return 1.00;                      // near expiry — natural window
}

function getMoveCategory(progress: number): MoveCategory {
  if (progress < 0.2 || progress >= 0.8) return "easy";
  return "mid";
}

function getDaysRemaining(m: Member): number | null {
  if (!m.plan_expiry_date) return null;
  return Math.max(0, Math.round((new Date(m.plan_expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function SmartEarnClient({ trainers, members, plans, shifts, defaultTrainerCapacity }: Props) {
  const [simFee, setSimFee]         = useState(6000);
  const [simInput, setSimInput]     = useState("6000");
  const [oppTab, setOppTab]         = useState<"easy" | "mid">("easy");

  const activeMembers = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  // shifts keyed by id for fast per-member lookup
  const shiftById = useMemo(() => {
    const map: Record<string, Shift> = {};
    for (const s of shifts) map[s.id] = s;
    return map;
  }, [shifts]);

  // Per-trainer profiles — monthlyKeeps now respects per-member shift override.
  const profiles = useMemo(() => trainers.map((t) => {
    const pct   = Number(t.commission_percentage ?? 0);
    const floor = Number(t.commission_floor ?? 0);
    const allMine     = members.filter((m) => m.assigned_trainer_id === t.id);
    const activeMine  = activeMembers.filter((m) => m.assigned_trainer_id === t.id);
    const churnedMine = allMine.filter((m) => CHURNED.has(m.status));
    const ret         = avgRetention(churnedMine.length > 0 ? churnedMine : allMine);
    const monthlyKeeps = activeMine.reduce((s, m) => {
      const shift = m.assigned_shift_id ? shiftById[m.assigned_shift_id] ?? null : null;
      return s + keepsForMember(Number(m.monthly_fee), floor, pct, shift);
    }, 0);
    return { ...t, pct, floor, allCount: allMine.length, activeCount: activeMine.length, monthlyKeeps, ret };
  }), [trainers, members, activeMembers, shiftById]);

  // Simulator ranking
  const simRanked = useMemo(() => [...profiles].sort((a, b) => {
    const scoreA = keeps(simFee, a.floor, a.pct) * (a.ret ?? 1);
    const scoreB = keeps(simFee, b.floor, b.pct) * (b.ret ?? 1);
    return scoreB - scoreA;
  }), [profiles, simFee]);

  const bestId = useMemo(() => {
    if (simRanked.length <= 1) return null;
    const s0 = keeps(simFee, simRanked[0].floor, simRanked[0].pct) * (simRanked[0].ret ?? 1);
    const s1 = keeps(simFee, simRanked[1].floor, simRanked[1].pct) * (simRanked[1].ret ?? 1);
    return s0 > s1 ? simRanked[0].id : null;
  }, [simRanked, simFee]);

  // ── Opportunity breakdown ─────────────────────────────────────────────────
  const { opportunityItems, opportunityGain } = useMemo(() => {
    if (!trainers.length) return { opportunityItems: [], opportunityGain: 0 };

    // Build per-member opportunity list
    const candidates: MemberOpportunity[] = [];

    for (const m of activeMembers) {
      if (!m.assigned_trainer_id) continue;
      const currentTrainer = trainers.find((t) => t.id === m.assigned_trainer_id);
      if (!currentTrainer) continue;

      const fee      = Number(m.monthly_fee);
      // Current "keeps" uses the member's actual shift (if any). Alternative
      // trainers compare against trainer-default rates only (no shift hypothesis).
      const currentShift = m.assigned_shift_id ? shiftById[m.assigned_shift_id] ?? null : null;
      const current = keepsForMember(
        fee,
        Number(currentTrainer.commission_floor ?? 0),
        Number(currentTrainer.commission_percentage ?? 0),
        currentShift,
      );

      // Find the best alternative trainer for this member's exact fee.
      let bestGain    = 0;
      let bestTrainer = currentTrainer;
      for (const tr of trainers) {
        if (tr.id === currentTrainer.id) continue;
        const altKeeps = keepsForMember(
          fee,
          Number(tr.commission_floor ?? 0),
          Number(tr.commission_percentage ?? 0),
          null, // hypothetical move — no shift assumed yet
        );
        const gain = altKeeps - current;
        if (gain > bestGain) { bestGain = gain; bestTrainer = tr; }
      }
      if (bestGain <= 0) continue;

      const progress    = getPlanProgress(m);
      const riskWeight  = getRiskWeight(progress);
      const category    = getMoveCategory(progress);
      const daysRemaining = getDaysRemaining(m);

      candidates.push({
        member: m,
        currentTrainer,
        bestTrainer,
        monthlyGain: bestGain,
        weightedGain: bestGain * riskWeight,
        riskWeight,
        category,
        daysRemaining,
        planProgress: progress,
      });
    }

    // Sort by weighted gain DESC — highest value moves first
    candidates.sort((a, b) => b.weightedGain - a.weightedGain);

    // Greedy capacity-aware selection: respect per-trainer current load + planned moves
    const currentLoad = new Map<string, number>();
    for (const t of trainers) {
      currentLoad.set(t.id, activeMembers.filter((m) => m.assigned_trainer_id === t.id).length);
    }
    const plannedMoves = new Map<string, number>(); // extra moves planned to this trainer

    const accepted: MemberOpportunity[] = [];
    for (const item of candidates) {
      const cap     = item.bestTrainer.member_capacity ?? defaultTrainerCapacity;
      const load    = currentLoad.get(item.bestTrainer.id) ?? 0;
      const planned = plannedMoves.get(item.bestTrainer.id) ?? 0;
      if (load + planned >= cap) continue; // trainer full
      plannedMoves.set(item.bestTrainer.id, planned + 1);
      accepted.push(item);
    }

    const totalGain = Math.round(accepted.reduce((s, x) => s + x.weightedGain, 0));
    return { opportunityItems: accepted, opportunityGain: totalGain };
  }, [trainers, activeMembers, defaultTrainerCapacity]);

  const easyItems = useMemo(() => opportunityItems.filter((x) => x.category === "easy"), [opportunityItems]);
  const midItems  = useMemo(() => opportunityItems.filter((x) => x.category === "mid"),  [opportunityItems]);
  const easyGain  = Math.round(easyItems.reduce((s, x) => s + x.weightedGain, 0));
  const midGain   = Math.round(midItems.reduce((s, x) => s + x.weightedGain, 0));

  const totalKeeps    = profiles.reduce((s, t) => s + t.monthlyKeeps, 0);
  const assignedCount = activeMembers.filter((m) => m.assigned_trainer_id).length;
  const hasCurrentData = assignedCount > 0;

  if (trainers.length === 0) {
    return (
      <div className="px-4 py-16 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <TrendingUp className="w-7 h-7 text-amber-400" />
        </div>
        <p className="text-lg font-bold">No trainers yet</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Add trainers with commission rates to start using Profit Insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <TrendingUp className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-bold">Profit Insights</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Before you assign a new member — see which trainer puts more money in your pocket.
        </p>
      </div>

      {/* ── Opportunity banner ── */}
      {opportunityGain > 0 && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <p className="text-sm text-rose-300">
            You can earn{" "}
            <span className="font-bold text-rose-400">+{formatCurrency(opportunityGain)}/month</span>{" "}
            extra just by reassigning some members to your best-value trainer.
          </p>
        </div>
      )}

      {/* ── Simulator ── */}
      <section className="space-y-3 sm:space-y-4">
        <div className="rounded-2xl border border-amber-500/25 bg-card p-4 sm:p-5 space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2 sm:mb-3">
              What will this member pay per month?
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-lg sm:text-2xl font-bold text-muted-foreground">Rs.</span>
              <input
                type="number"
                value={simInput}
                onChange={(e) => {
                  setSimInput(e.target.value);
                  const v = Number(e.target.value);
                  if (!isNaN(v) && v >= 0) setSimFee(v);
                }}
                className="flex-1 bg-transparent text-3xl sm:text-4xl font-bold text-foreground outline-none tabular-nums min-w-0"
                placeholder="0"
                min={0}
                step={500}
              />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
            {[3000, 4000, 5000, 6000, 8000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => { setSimFee(v); setSimInput(String(v)); }}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-all shrink-0",
                  simFee === v
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400 font-semibold"
                    : "border-sidebar-border text-muted-foreground hover:border-amber-500/30 hover:text-foreground"
                )}
              >{formatCurrency(v)}</button>
            ))}
          </div>
        </div>

        {/* Trainer ranking */}
        {simFee > 0 && (() => {
          const scores = simRanked.map((t) => {
            const k = keeps(simFee, t.floor, t.pct);
            return { t, k, ltv: t.ret !== null ? k * t.ret : null, score: t.ret !== null ? k * t.ret : k };
          });
          const maxScore  = scores[0]?.score || 1;
          const winner    = scores[0];
          const rest      = scores.slice(1);
          const hasLTV    = scores.some((s) => s.ltv !== null);
          const hasWinner = bestId !== null && winner;

          return (
            <div className="space-y-3">
              <p className="hidden sm:block text-xs text-muted-foreground px-1">
                {hasLTV ? "Ranked by total you earn over the member's expected stay" : "Ranked by monthly profit — add more members to unlock lifetime value ranking"}
              </p>

              {/* Winner hero */}
              {winner && (
                <div className={cn(
                  "relative rounded-2xl overflow-hidden",
                  hasWinner
                    ? "shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_8px_32px_rgba(251,191,36,0.12)]"
                    : "shadow-[0_0_0_1px_rgba(52,211,153,0.3),0_8px_24px_rgba(52,211,153,0.08)]"
                )}>
                  <div className={cn(
                    "absolute inset-0",
                    hasWinner
                      ? "bg-gradient-to-br from-amber-500/[0.14] via-amber-500/[0.06] to-transparent"
                      : "bg-gradient-to-br from-emerald-500/[0.12] via-emerald-500/[0.05] to-transparent"
                  )} />
                  <div className={cn(
                    "relative flex items-center gap-2.5 px-5 py-2.5 border-b",
                    hasWinner ? "bg-amber-500/20 border-amber-500/30" : "bg-emerald-500/15 border-emerald-500/25"
                  )}>
                    <Award className={cn("w-4 h-4 shrink-0", hasWinner ? "text-amber-300" : "text-emerald-300")} />
                    <span className={cn("text-xs font-black uppercase tracking-widest", hasWinner ? "text-amber-300" : "text-emerald-300")}>
                      Best Choice — Assign This Trainer
                    </span>
                    <div className={cn("ml-auto h-px flex-1 max-w-[60px] rounded-full opacity-40", hasWinner ? "bg-amber-400" : "bg-emerald-400")} />
                  </div>
                  <div className="relative px-5 sm:px-6 py-5 sm:py-6">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className={cn(
                        "w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black shrink-0",
                        hasWinner
                          ? "bg-gradient-to-br from-amber-400/25 to-amber-600/10 border-2 border-amber-400/50 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.2)]"
                          : "bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 border-2 border-emerald-400/40 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.15)]"
                      )}>
                        {winner.t.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xl sm:text-2xl text-foreground tracking-tight">{winner.t.full_name}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {winner.t.pct}% commission{winner.t.floor > 0 ? ` · ${formatCurrency(winner.t.floor)} floor` : ""}
                        </p>
                        {winner.t.ret !== null && (
                          <p className="text-xs text-blue-400 mt-2 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" /> Members stay ~{winner.t.ret} {winner.t.ret === 1 ? "month" : "months"} avg
                          </p>
                        )}
                        {/* Earn panel — mobile only, below trainer info */}
                        <div className={cn("sm:hidden mt-3 pt-3 border-t border-white/10 flex items-center justify-between")}>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {winner.ltv !== null ? `Over ${winner.t.ret} months` : "You keep/month"}
                          </p>
                          <div className="text-right">
                            <p className={cn("text-2xl font-black tabular-nums leading-none whitespace-nowrap", hasWinner ? "text-amber-300" : "text-emerald-300")}>
                              {formatCurrency(winner.ltv ?? winner.k)}
                            </p>
                            {winner.ltv !== null && (
                              <p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">{formatCurrency(winner.k)}/mo × {winner.t.ret}mo</p>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Earn panel — desktop only, right column */}
                      <div className="hidden sm:block text-right shrink-0 pl-4 border-l border-white/10">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                          {winner.ltv !== null ? `You earn over ${winner.t.ret} months` : "You keep/month"}
                        </p>
                        <p className={cn("text-5xl font-black tabular-nums leading-none", hasWinner ? "text-amber-300" : "text-emerald-300")}>
                          {formatCurrency(winner.ltv ?? winner.k)}
                        </p>
                        {winner.ltv !== null && (
                          <p className="text-sm text-muted-foreground mt-1.5">{formatCurrency(winner.k)}/mo × {winner.t.ret} months</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rest — card grid */}
              {rest.length > 0 && (
                <div className={cn(
                  "grid gap-3",
                  rest.length === 1 ? "grid-cols-1" :
                  rest.length === 2 ? "grid-cols-2" :
                  "grid-cols-2 lg:grid-cols-3"
                )}>
                  {rest.map(({ t, k, ltv, score }, i) => {
                    const barPct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
                    const gap    = (winner?.score ?? 0) - score;
                    return (
                      <div key={t.id} className="rounded-2xl border border-sidebar-border bg-card p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                            {t.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{t.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">#{i + 2} ranked</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums">{formatCurrency(ltv ?? k)}</p>
                          {ltv !== null && <p className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(k)}/mo</p>}
                        </div>
                        <div className="space-y-1.5">
                          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                            <div className="h-full rounded-full bg-white/20 transition-all duration-500" style={{ width: `${barPct}%` }} />
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-muted-foreground">
                              {t.pct}% comm{t.floor > 0 ? ` · ${formatCurrency(t.floor)} floor` : ""}
                              {t.ret !== null ? ` · ${t.ret} mo avg` : ""}
                            </p>
                            {gap > 0 && <span className="text-[10px] text-rose-400 font-semibold tabular-nums">−{formatCurrency(gap)}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* ── Opportunity Breakdown ── */}
      {opportunityItems.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Reassignment Opportunities</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Members who would earn you more under a different trainer — weighted by reassignment ease.
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOppTab("easy")}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all",
                oppTab === "easy"
                  ? "border-emerald-500/40 bg-emerald-500/[0.07]"
                  : "border-sidebar-border bg-card hover:border-emerald-500/20"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400">Easy Wins</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-400 whitespace-nowrap">+{formatCurrency(easyGain)}</p>
              <p className="text-xs text-muted-foreground mt-1">{easyItems.length} member{easyItems.length !== 1 ? "s" : ""} · act now</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">New joiners + expiring plans</p>
            </button>

            <button
              type="button"
              onClick={() => setOppTab("mid")}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all",
                oppTab === "mid"
                  ? "border-amber-500/40 bg-amber-500/[0.07]"
                  : "border-sidebar-border bg-card hover:border-amber-500/20"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">Worth Planning</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-amber-400 whitespace-nowrap">+{formatCurrency(midGain)}</p>
              <p className="text-xs text-muted-foreground mt-1">{midItems.length} member{midItems.length !== 1 ? "s" : ""} · at renewal</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Mid-plan, lower churn risk</p>
            </button>
          </div>

          {/* Member list */}
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            {/* Tab header */}
            <div className="flex border-b border-sidebar-border">
              <button
                type="button"
                onClick={() => setOppTab("easy")}
                className={cn(
                  "flex-1 px-4 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
                  oppTab === "easy" ? "text-emerald-400 border-b-2 border-emerald-400 -mb-px" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="w-3 h-3" /> Easy Wins ({easyItems.length})
              </button>
              <button
                type="button"
                onClick={() => setOppTab("mid")}
                className={cn(
                  "flex-1 px-4 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
                  oppTab === "mid" ? "text-amber-400 border-b-2 border-amber-400 -mb-px" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CalendarClock className="w-3 h-3" /> Worth Planning ({midItems.length})
              </button>
            </div>

            {/* Rows */}
            {(() => {
              const items = oppTab === "easy" ? easyItems : midItems;
              if (items.length === 0) {
                return (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    {oppTab === "easy" ? "No easy-win reassignments right now." : "No mid-plan reassignments right now."}
                  </div>
                );
              }
              return (
                <div className="divide-y divide-sidebar-border/50">
                  {items.map((item) => {
                    const isExpiring = item.daysRemaining !== null && item.daysRemaining <= 30 && item.planProgress >= 0.8;
                    const isNew      = item.planProgress < 0.2;
                    return (
                      <div key={item.member.id} className="px-5 py-3.5 flex items-center gap-4">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                          {item.member.full_name.charAt(0).toUpperCase()}
                        </div>

                        {/* Member info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">{item.member.full_name}</p>
                            {item.member.member_number && (
                              <span className="text-[10px] text-muted-foreground font-mono shrink-0">{item.member.member_number}</span>
                            )}
                            {/* Badge inline on mobile */}
                            <span className={cn(
                              "sm:hidden text-[10px] font-semibold rounded-full px-1.5 py-0.5",
                              isNew ? "text-emerald-400 bg-emerald-500/10" :
                              isExpiring ? "text-amber-400 bg-amber-500/10" :
                              "text-muted-foreground bg-white/5"
                            )}>
                              {isNew ? "New" : isExpiring ? `Exp ${item.daysRemaining}d` : "Active"}
                            </span>
                          </div>
                          {/* Trainer arrow */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted-foreground truncate">{item.currentTrainer.full_name}</span>
                            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className={cn("text-xs font-semibold truncate", oppTab === "easy" ? "text-emerald-400" : "text-amber-400")}>
                              {item.bestTrainer.full_name}
                            </span>
                          </div>
                        </div>

                        {/* Stage badge — hidden on mobile */}
                        <div className="hidden sm:block shrink-0 text-right">
                          {isNew && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                              New Member
                            </span>
                          )}
                          {isExpiring && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                              Expiring {item.daysRemaining}d
                            </span>
                          )}
                          {!isNew && !isExpiring && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                              Active Member
                            </span>
                          )}
                        </div>

                        {/* Gain */}
                        <div className="shrink-0 text-right pl-2">
                          <p className={cn("text-sm font-bold tabular-nums", oppTab === "easy" ? "text-emerald-400" : "text-amber-400")}>
                            +{formatCurrency(Math.round(item.weightedGain))}/mo
                          </p>
                          {item.riskWeight < 1 && (
                            <p className="text-[10px] text-muted-foreground">{Math.round(item.riskWeight * 100)}% confidence</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* ── Current Month Snapshot ── */}
      {hasCurrentData && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">This Month</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-sidebar-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">You Keep</p>
              <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatCurrency(totalKeeps)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">from trainers</p>
            </div>
            <div className="rounded-2xl border border-sidebar-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Members</p>
              <p className="text-lg font-bold tabular-nums">{assignedCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">with trainers</p>
            </div>
            <div className={cn("rounded-2xl border bg-card p-4 text-center", opportunityGain > 0 ? "border-rose-500/20" : "border-sidebar-border")}>
              <p className="text-xs text-muted-foreground mb-1">You Could Gain</p>
              <p className={cn("text-lg font-bold tabular-nums", opportunityGain > 0 ? "text-rose-400" : "text-muted-foreground")}>
                {opportunityGain > 0 ? `+${formatCurrency(opportunityGain)}` : "Optimal"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">per month extra</p>
            </div>
          </div>
          <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
            <div className="divide-y divide-sidebar-border/50">
              {[...profiles].sort((a, b) => b.monthlyKeeps - a.monthlyKeeps).map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {t.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.full_name}</p>
                    <p className="text-xs text-muted-foreground">{t.pct}% commission</p>
                    <p className="text-[10px] text-muted-foreground/70">Default: {t.default_shift_name}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    {t.ret !== null && <div className="hidden sm:block"><p className="text-xs text-blue-400">{t.ret} mo avg stay</p></div>}
                    <div><p className="text-xs text-muted-foreground"><span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.activeCount}</span></p></div>
                    <div>
                      <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatCurrency(t.monthlyKeeps)}</p>
                      <p className="text-[10px] text-muted-foreground">you keep/mo</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
