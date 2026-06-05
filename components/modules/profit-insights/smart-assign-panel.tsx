"use client";
import { TrendingUp, Check } from "lucide-react";
import { cn, formatCurrency, formatTime12h } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Staff, TrainerShift } from "@/types";

type TrainerOption = Pick<Staff, "id" | "full_name" | "commission_percentage" | "commission_floor" | "default_shift_name">;

interface SmartAssignPanelProps {
  trainers: TrainerOption[];
  shifts: Record<string, TrainerShift[]>;
  selectedTrainerId: string;
  selectedShiftId: string;
  memberFee: number;
  onSelectTrainer: (trainerId: string) => void;
  onSelectShift: (shiftId: string) => void;
}

function calcGymKeeps(fee: number, floor: number, pct: number): number {
  if (fee <= 0) return 0;
  const netFee = Math.max(0, fee - floor);
  const trainerGets = pct > 0 ? Math.round(netFee * pct / 100) : 0;
  return Math.max(0, fee - trainerGets);
}

function calcTrainerGets(fee: number, floor: number, pct: number): number {
  if (fee <= 0 || pct <= 0) return 0;
  const netFee = Math.max(0, fee - floor);
  return Math.round(netFee * pct / 100);
}

export function SmartAssignPanel({
  trainers,
  shifts,
  selectedTrainerId,
  selectedShiftId,
  memberFee,
  onSelectTrainer,
  onSelectShift,
}: SmartAssignPanelProps) {
  const hasFee = memberFee > 0;

  // Sort trainers by gym keeps descending when fee is known
  const sortedTrainers = hasFee
    ? [...trainers].sort((a, b) =>
        calcGymKeeps(memberFee, Number(b.commission_floor ?? 0), Number(b.commission_percentage ?? 0)) -
        calcGymKeeps(memberFee, Number(a.commission_floor ?? 0), Number(a.commission_percentage ?? 0))
      )
    : trainers;

  // Find best value trainer (highest gym keeps per member)
  let bestTrainerId: string | null = null;
  if (hasFee && trainers.length > 1) {
    const maxKeeps = calcGymKeeps(memberFee, Number(sortedTrainers[0].commission_floor ?? 0), Number(sortedTrainers[0].commission_percentage ?? 0));
    const allSame = sortedTrainers.every((t) =>
      calcGymKeeps(memberFee, Number(t.commission_floor ?? 0), Number(t.commission_percentage ?? 0)) === maxKeeps
    );
    if (!allSame) bestTrainerId = sortedTrainers[0].id;
  }

  if (trainers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sidebar-border p-4 text-center text-sm text-muted-foreground">
        No trainers added yet.
      </div>
    );
  }

  const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);
  const trainerShifts = selectedTrainerId ? (shifts[selectedTrainerId] ?? []) : [];

  return (
    <div className="space-y-3 sm:col-span-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
        <Label className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
          Assign Trainer
        </Label>
        {!hasFee && (
          <span className="text-[10px] text-muted-foreground ml-1">— set monthly fee to see profit breakdown</span>
        )}
      </div>

      {/* Trainer cards — horizontal scroll on mobile */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {sortedTrainers.map((t) => {
          const floor = Number(t.commission_floor ?? 0);
          const pct = Number(t.commission_percentage ?? 0);
          const gymKeeps = hasFee ? calcGymKeeps(memberFee, floor, pct) : null;
          const trainerGets = hasFee ? calcTrainerGets(memberFee, floor, pct) : null;
          const isBest = bestTrainerId === t.id;
          const isSelected = selectedTrainerId === t.id;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTrainer(t.id)}
              className={cn(
                "flex-shrink-0 w-[160px] rounded-xl border text-left transition-all duration-150 cursor-pointer overflow-hidden",
                isSelected
                  ? "border-primary/50 bg-primary/8 ring-1 ring-primary/30"
                  : isBest
                  ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
                  : "border-sidebar-border bg-card hover:border-primary/30 hover:bg-white/[0.03]"
              )}
            >
              {/* Badge row — always rendered so all cards align */}
              {isBest ? (
                <div className="bg-amber-500/15 border-b border-amber-500/25 px-3 py-1">
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide">Best Value</span>
                </div>
              ) : (
                <div className="px-3 py-1 invisible select-none text-[9px]">&nbsp;</div>
              )}

              <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {t.full_name.charAt(0).toUpperCase()}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>

              <p className="text-xs font-semibold leading-tight text-foreground truncate">{t.full_name}</p>
              <p className="text-[10px] text-amber-400 mt-0.5">{pct}% commission</p>
              {floor > 0 && <p className="text-[9px] text-muted-foreground">after {formatCurrency(floor)} floor</p>}

              {hasFee && gymKeeps !== null && trainerGets !== null ? (
                <div className="mt-2 pt-2 border-t border-sidebar-border/60 space-y-0.5">
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">You Keep</p>
                    <p className="text-base font-bold text-emerald-400 tabular-nums leading-tight">{formatCurrency(gymKeeps)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground">Trainer gets</p>
                    <p className="text-[11px] font-semibold text-amber-400/80 tabular-nums">{formatCurrency(trainerGets)}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-2 pt-2 border-t border-sidebar-border/60">
                  <p className="text-[10px] text-muted-foreground">Set fee to compare</p>
                </div>
              )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Remove trainer link */}
      {selectedTrainerId && (
        <button
          type="button"
          onClick={() => onSelectTrainer("")}
          className="text-xs text-muted-foreground hover:text-rose-400 transition-colors text-left"
        >
          Remove trainer
        </button>
      )}

      {/* Shift selector — only when trainer has at least one shift defined. */}
      {selectedTrainer && trainerShifts.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            Shift{" "}
            <span className="text-muted-foreground font-normal">(optional — overrides default commission)</span>
          </Label>
          <Select
            value={selectedShiftId || "none"}
            onValueChange={(v) => onSelectShift(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No shift (use trainer default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{selectedTrainer.default_shift_name} (default — {selectedTrainer.commission_percentage ?? 0}%)</SelectItem>
              {trainerShifts.map((sh) => (
                <SelectItem key={sh.id} value={sh.id}>
                  {sh.name} · {formatTime12h(sh.start_time)}–{formatTime12h(sh.end_time)} ·{" "}
                  {sh.commission_type === "flat" ? `PKR ${sh.commission_value} flat` : `${sh.commission_value}%`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

    </div>
  );
}
