"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Users, Wallet, TrendingUp, Clock, Loader2 } from "lucide-react";
import { getTrainerCommissions } from "@/app/actions/trainer";
import { formatCurrency } from "@/lib/utils";

interface CommissionMember {
  memberId: string;
  memberName: string;
  plan: string;
  monthlyFee: number;
  rule: string;
  commission: number;
  paid: boolean;
}
interface TrainerCommission {
  trainerId: string;
  trainerName: string;
  defaultRule: string;
  baseSalary: number;
  totalMembers: number;
  feeGenerated: number;
  earned: number;
  pending: number;
  totalComp: number;
  members: CommissionMember[];
}

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

// Last 12 months as { key, label }, newest first.
function monthOptions() {
  const opts: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("default", { month: "long", year: "numeric" }),
    });
  }
  return opts;
}

export function TrainerCommissionsPanel() {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(currentMonthKey());
  const [rows, setRows] = useState<TrainerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getTrainerCommissions(month)
      .then((res) => {
        if (cancelled) return;
        if ("error" in res) { setError(true); setRows([]); }
        else setRows(res.rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setRows([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [month]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const totals = useMemo(() => ({
    earned: rows.reduce((s, r) => s + r.earned, 0),
    pending: rows.reduce((s, r) => s + r.pending, 0),
    members: rows.reduce((s, r) => s + r.totalMembers, 0),
  }), [rows]);

  return (
    <div className="space-y-4">
      {/* Header: month selector + totals */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-lg border border-sidebar-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {months.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{totals.members} members</span>
            <span className="text-emerald-400 font-medium">{formatCurrency(totals.earned)} earned</span>
            <span className="text-amber-400 font-medium">{formatCurrency(totals.pending)} pending</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading commissions…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <p className="text-sm">Couldn&apos;t load commissions. Please try again.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <Users className="w-10 h-10 opacity-20" />
          <p className="text-sm">No trainers found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => {
            const isOpen = expanded.has(t.trainerId);
            return (
              <div key={t.trainerId} className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
                {/* Trainer header row */}
                <button
                  type="button"
                  onClick={() => toggle(t.trainerId)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {t.trainerName[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">{t.trainerName}</p>
                    <p className="text-xs text-muted-foreground">{t.defaultRule} · {t.totalMembers} members</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-5 text-right shrink-0">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned</p>
                      <p className="text-sm font-bold text-emerald-400">{formatCurrency(t.earned)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</p>
                      <p className="text-sm font-bold text-amber-400">{formatCurrency(t.pending)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Comp</p>
                      <p className="text-sm font-bold text-foreground">{formatCurrency(t.totalComp)}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Mobile totals */}
                <div className="sm:hidden flex items-center justify-between px-4 pb-3 text-xs">
                  <span className="text-emerald-400 font-medium">{formatCurrency(t.earned)} earned</span>
                  <span className="text-amber-400 font-medium">{formatCurrency(t.pending)} pending</span>
                  <span className="text-foreground font-medium">{formatCurrency(t.totalComp)} total</span>
                </div>

                {/* Expanded member breakdown */}
                {isOpen && (
                  <div className="border-t border-sidebar-border">
                    {/* Summary strip */}
                    <div className="grid grid-cols-3 divide-x divide-sidebar-border bg-white/[0.02]">
                      <div className="px-4 py-2.5 flex items-center gap-2">
                        <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Base Salary</p>
                          <p className="text-sm font-medium text-foreground">{formatCurrency(t.baseSalary)}</p>
                        </div>
                      </div>
                      <div className="px-4 py-2.5 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fee Generated</p>
                          <p className="text-sm font-medium text-foreground">{formatCurrency(t.feeGenerated)}</p>
                        </div>
                      </div>
                      <div className="px-4 py-2.5 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Members</p>
                          <p className="text-sm font-medium text-foreground">{t.totalMembers}</p>
                        </div>
                      </div>
                    </div>

                    {/* Member table */}
                    {t.members.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted-foreground text-center">No assigned members</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-sidebar-border/60">
                              <th className="text-left px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                              <th className="text-left px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Plan</th>
                              <th className="text-right px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Fee</th>
                              <th className="text-left px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Rule</th>
                              <th className="text-right px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Commission</th>
                              <th className="text-center px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-sidebar-border/40">
                            {t.members.map((m) => (
                              <tr key={m.memberId} className="hover:bg-white/[0.02]">
                                <td className="px-4 py-2.5 font-medium text-foreground">{m.memberName}</td>
                                <td className="px-4 py-2.5 text-left text-muted-foreground hidden sm:table-cell">{m.plan}</td>
                                <td className="px-4 py-2.5 text-right text-muted-foreground">{formatCurrency(m.monthlyFee)}</td>
                                <td className="px-4 py-2.5 text-left text-xs text-muted-foreground hidden md:table-cell">{m.rule}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-foreground">{formatCurrency(m.commission)}</td>
                                <td className="px-4 py-2.5 text-center">
                                  {m.paid ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Earned</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
