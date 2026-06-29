"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setMemberGoals, type SalesTeamMember } from "@/app/actions/admin-sales-teams";

type Goals = {
  monthly_commission_pct: number;
  annual_commission_pct: number;
  monthly_deal_target: number;
  monthly_revenue_target: number;
};

export function SetGoalsModal({
  member,
  onClose,
  onSaved,
}: {
  member: SalesTeamMember;
  onClose: () => void;
  onSaved: (goals: Goals) => void;
}) {
  const [form, setForm] = useState({
    monthly_commission_pct: member.monthly_commission_pct > 0 ? String(member.monthly_commission_pct) : "",
    annual_commission_pct: member.annual_commission_pct > 0 ? String(member.annual_commission_pct) : "",
    monthly_deal_target: member.monthly_deal_target > 0 ? String(member.monthly_deal_target) : "",
    monthly_revenue_target: member.monthly_revenue_target > 0 ? String(member.monthly_revenue_target) : "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function submit() {
    const parseNum = (val: string): number => {
      if (val === "") return 0;
      const n = Number(val);
      return isNaN(n) || !isFinite(n) ? NaN : n;
    };

    const mcp = parseNum(form.monthly_commission_pct);
    const acp = parseNum(form.annual_commission_pct);
    const mdt = parseNum(form.monthly_deal_target);
    const mrt = parseNum(form.monthly_revenue_target);

    if ([mcp, acp, mdt, mrt].some(isNaN)) {
      setError("Please enter valid numbers for all fields");
      return;
    }

    setError(null);
    startTransition(async () => {
      const goals: Goals = {
        monthly_commission_pct: mcp,
        annual_commission_pct: acp,
        monthly_deal_target: mdt,
        monthly_revenue_target: mrt,
      };
      const res = await setMemberGoals(member.id, goals);
      if (res.error) { setError(res.error); return; }
      onSaved(goals);
      onClose();
    });
  }

  const inputCls = "w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-0.5">Goals & Commission</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Set targets and commission rates for{" "}
          <span className="font-semibold text-foreground">{member.full_name ?? member.email}</span>
        </p>

        {error && (
          <p className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="space-y-4">
          {/* Commission rates */}
          <div className="rounded-xl border border-sidebar-border bg-sidebar/40 p-4 space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Commission Rates</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Monthly Plan %</label>
                <div className="relative">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={form.monthly_commission_pct}
                    onChange={e => set("monthly_commission_pct", e.target.value)}
                    placeholder="e.g. 5"
                    className={inputCls + " pr-7"}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Annual Plan %</label>
                <div className="relative">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={form.annual_commission_pct}
                    onChange={e => set("annual_commission_pct", e.target.value)}
                    placeholder="e.g. 10"
                    className={inputCls + " pr-7"}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly targets */}
          <div className="rounded-xl border border-sidebar-border bg-sidebar/40 p-4 space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Monthly Targets</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Deal Count Target</label>
                <input
                  type="number" min="0" step="1"
                  value={form.monthly_deal_target}
                  onChange={e => set("monthly_deal_target", e.target.value)}
                  placeholder="e.g. 10"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Revenue Target (PKR)</label>
                <input
                  type="number" min="0" step="1000"
                  value={form.monthly_revenue_target}
                  onChange={e => set("monthly_revenue_target", e.target.value)}
                  placeholder="e.g. 100000"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Save Goals
          </button>
        </div>
      </div>
    </div>
  );
}
