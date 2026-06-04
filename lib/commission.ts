// Canonical trainer-commission math. Mirrors the trainer portal exactly so the
// owner-facing view and the trainer's own page always agree.
//
// Rule: commission = max(0, fee − floor) × pct.  floor=0 ⇒ straight % of fee.
// A trainer SHIFT is a standalone override — when a member has an assigned
// shift, the shift's floor + type/value fully replace the trainer's defaults.

export interface CommissionShift {
  commission_type: "percentage" | "flat" | string;
  commission_value: number;
  commission_floor: number;
}

export function calcCommission(
  fee: number,
  trainerFloor: number,
  trainerPct: number,
  shift: CommissionShift | null,
): number {
  const effectiveFloor = shift ? Number(shift.commission_floor) : trainerFloor;
  const netFee = Math.max(0, fee - effectiveFloor);
  if (shift) {
    return shift.commission_type === "flat"
      ? Number(shift.commission_value)
      : netFee * (Number(shift.commission_value) / 100);
  }
  return netFee * (trainerPct / 100);
}

// Human-readable rule label, e.g. "30% after Rs. 2,500 floor" or "Rs. 500 flat".
export function commissionRuleLabel(
  trainerFloor: number,
  trainerPct: number,
  shift: CommissionShift | null,
): string {
  const money = (n: number) => `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;
  const floorN = Number(trainerFloor || 0);
  const pctN = Number(trainerPct || 0);
  if (shift) {
    if (shift.commission_type === "flat") return `${money(shift.commission_value)} flat`;
    const floor = Number(shift.commission_floor || 0);
    return `${Number(shift.commission_value || 0)}%${floor > 0 ? ` after ${money(floor)} floor` : ""}`;
  }
  return `${pctN}%${floorN > 0 ? ` after ${money(floorN)} floor` : ""}`;
}
