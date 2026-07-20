export type MemberGoalsInput = {
  monthly_commission_pct: number;
  annual_commission_pct: number;
  monthly_deal_target: number;
  monthly_revenue_target: number;
};

// Pure validation, shared by the admin-only setMemberGoals() and the
// manager-scoped setTeamMemberGoals() — throws on invalid input. Lives outside
// any "use server" file since Server Action modules may only export async
// functions.
export function validateGoals(goals: MemberGoalsInput): MemberGoalsInput {
  const pct = (v: number) => {
    if (typeof v !== "number" || isNaN(v) || v < 0 || v > 100) throw new Error("Commission % must be between 0 and 100");
    return Math.round(v * 100) / 100;
  };
  const posInt = (v: number, name: string) => {
    if (typeof v !== "number" || isNaN(v) || v < 0 || !Number.isFinite(v)) throw new Error(`${name} must be a non-negative number`);
    if (v > 10_000) throw new Error(`${name} cannot exceed 10,000`);
    return Math.round(v);
  };
  const posNum = (v: number, name: string) => {
    if (typeof v !== "number" || isNaN(v) || v < 0 || !Number.isFinite(v)) throw new Error(`${name} must be a non-negative number`);
    if (v > 100_000_000) throw new Error(`${name} cannot exceed 100,000,000`);
    return Math.round(v * 100) / 100;
  };

  return {
    monthly_commission_pct: pct(goals.monthly_commission_pct),
    annual_commission_pct: pct(goals.annual_commission_pct),
    monthly_deal_target: posInt(goals.monthly_deal_target, "Monthly deal target"),
    monthly_revenue_target: posNum(goals.monthly_revenue_target, "Monthly revenue target"),
  };
}
