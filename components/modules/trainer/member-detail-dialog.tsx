"use client";
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Target, Plus, Calendar, TrendingUp, TrendingDown,
  Trash2, Pause, Play, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatDateInput, memberPlanLabel } from "@/lib/utils";
import { createGoal, logGoalProgress, updateGoal, deleteGoal } from "@/app/actions/trainer";
import type { MemberGoal, GoalCategory, GoalDirection, BodyMetric, MetricSkip } from "@/types";
import { BodyMetricsSection } from "./body-metrics-section";

type MemberLite = {
  id: string;
  full_name: string;
  member_number: string | null;
  phone: string | null;
  plan?: { name: string } | null;
  plans?: { plan?: { id: string; name: string; color: string } | null }[] | null;
  monthly_fee: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  member: MemberLite | null;
  goals: MemberGoal[];
  bodyMetrics: BodyMetric[];
  metricSkips: MetricSkip[];
}

const CATEGORY_DEFAULTS: Record<GoalCategory, { unit: string; direction: GoalDirection; label: string; emoji: string; noun: string; hint?: string }> = {
  weight_loss: { unit: "kg",       direction: "down", label: "Weight Loss",  emoji: "📉",   noun: "Weight" },
  muscle_gain: { unit: "kg",       direction: "up",   label: "Muscle Gain",  emoji: "💪",   noun: "Weight" },
  strength:    { unit: "kg",       direction: "up",   label: "Strength",     emoji: "🏋️",  noun: "Lift" },
  endurance:   { unit: "min",      direction: "up",   label: "Endurance",    emoji: "🏃",   noun: "Time" },
  flexibility: { unit: "cm",       direction: "up",   label: "Flexibility",  emoji: "🤸",   noun: "Reach" },
  yoga:        { unit: "sessions", direction: "up",   label: "Yoga",         emoji: "🧘‍♀️", noun: "Sessions/Week", hint: "Track sessions per week or hold-time in min" },
  pilates:     { unit: "sessions", direction: "up",   label: "Pilates",      emoji: "🩰",   noun: "Sessions/Week", hint: "Track sessions per week or core reps" },
  postnatal:   { unit: "kg",       direction: "down", label: "Postnatal",    emoji: "🤱",   noun: "Weight",        hint: "Postpartum recovery — gentle progress" },
  toning:      { unit: "cm",       direction: "down", label: "Toning",       emoji: "✨",   noun: "Measurement",   hint: "Track waist/hip measurements" },
  custom:      { unit: "",         direction: "up",   label: "Custom",       emoji: "🎯",   noun: "Value" },
};

const DURATION_OPTIONS = [
  { value: "1",   label: "1 month" },
  { value: "3",   label: "3 months" },
  { value: "6",   label: "6 months" },
  { value: "12",  label: "1 year" },
  { value: "custom", label: "Custom date" },
];

const STATUS_STYLES: Record<MemberGoal["status"], string> = {
  active:    "bg-primary/10 text-primary border-primary/20",
  achieved:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused:    "bg-white/5 text-muted-foreground border-white/10",
  abandoned: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

function progressPercent(g: MemberGoal): number {
  if (g.start_value == null) return 0;
  const cur = g.current_value ?? g.start_value;
  const total = g.target_value - g.start_value;
  const moved = cur - g.start_value;
  if (total === 0) return 100;
  return Math.max(0, Math.min(100, Math.round((moved / total) * 100)));
}

function timeProgress(g: MemberGoal): number {
  const start = new Date(g.start_date).getTime();
  const end = new Date(g.target_date).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

function paceLabel(g: MemberGoal): { text: string; color: string } | null {
  if (g.status !== "active") return null;
  const p = progressPercent(g);
  const t = timeProgress(g);
  const diff = p - t;
  if (diff >= 10)  return { text: "Ahead",     color: "text-emerald-400" };
  if (diff <= -15) return { text: "Behind",    color: "text-rose-400" };
  return                  { text: "On track",  color: "text-primary" };
}

function Sparkline({ values, direction }: { values: number[]; direction: GoalDirection }) {
  if (values.length < 2) return <div className="h-8 flex items-center text-[10px] text-muted-foreground">Need 2+ entries to show trend</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const goingDown = last < first;
  const good = direction === "down" ? goingDown : !goingDown;
  const stroke = good ? "stroke-emerald-400" : "stroke-rose-400";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline fill="none" strokeWidth="1.5" className={stroke} points={points} />
    </svg>
  );
}

export function MemberDetailDialog({ open, onClose, member, goals: initialGoals, bodyMetrics, metricSkips }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [logTarget, setLogTarget] = useState<MemberGoal | null>(null);

  const memberGoals = useMemo(
    () => member ? initialGoals.filter((g) => g.member_id === member.id) : [],
    [initialGoals, member]
  );
  const memberMetrics = useMemo(
    () => member ? bodyMetrics.filter((m) => m.member_id === member.id) : [],
    [bodyMetrics, member]
  );
  const memberSkips = useMemo(
    () => member ? metricSkips.filter((s) => s.member_id === member.id) : [],
    [metricSkips, member]
  );
  const activeGoals = memberGoals.filter((g) => g.status === "active");
  const otherGoals  = memberGoals.filter((g) => g.status !== "active");

  function refresh() { startTransition(() => router.refresh()); }

  if (!member) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-sidebar-border">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                {member.full_name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl">{member.full_name}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {member.member_number && `#${member.member_number} · `}
                  {memberPlanLabel(member, "No plan")}
                  {member.phone && ` · ${member.phone}`}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-5">
            {/* Goals header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Goals</h3>
                <span className="text-xs text-muted-foreground">
                  {activeGoals.length} active{otherGoals.length > 0 && ` · ${otherGoals.length} other`}
                </span>
              </div>
              <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5 h-8">
                <Plus className="w-3.5 h-3.5" /> Add Goal
              </Button>
            </div>

            {/* Goal list */}
            {memberGoals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sidebar-border bg-card/50 py-10 flex flex-col items-center gap-2 text-muted-foreground">
                <Target className="w-8 h-8 opacity-30" />
                <p className="text-sm">No goals set yet</p>
                <p className="text-xs">Set the first goal to start tracking progress</p>
                <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="mt-2 gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Set First Goal
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {[...activeGoals, ...otherGoals].map((g) => (
                  <GoalCard key={g.id} goal={g} onLog={() => setLogTarget(g)} onChange={refresh} />
                ))}
              </div>
            )}

            {/* Body metrics — separated from goals visually */}
            <div className="pt-2 border-t border-sidebar-border" />
            <BodyMetricsSection memberId={member.id} metrics={memberMetrics} skips={memberSkips} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Add goal dialog */}
      {adding && (
        <AddGoalDialog
          memberId={member.id}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refresh(); }}
        />
      )}

      {/* Log progress dialog */}
      {logTarget && (
        <LogProgressDialog
          goal={logTarget}
          onClose={() => setLogTarget(null)}
          onSaved={() => { setLogTarget(null); refresh(); }}
        />
      )}
    </>
  );
}

// ─── Goal card ───────────────────────────────────────────────────────────────

function GoalCard({ goal, onLog, onChange }: { goal: MemberGoal; onLog: () => void; onChange: () => void }) {
  const cat = CATEGORY_DEFAULTS[goal.category];
  const pct = progressPercent(goal);
  const pace = paceLabel(goal);
  const cur = goal.current_value ?? goal.start_value;
  const recent = (goal.progress ?? []).slice(0, 8).reverse();

  async function setStatus(status: MemberGoal["status"]) {
    const res = await updateGoal(goal.id, { status });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: `Goal ${status}` }); onChange(); }
  }

  async function remove() {
    if (!confirm("Delete this goal and all its progress?")) return;
    const res = await deleteGoal(goal.id);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Goal deleted" }); onChange(); }
  }

  return (
    <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{goal.title}</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLES[goal.status]}`}>
              {goal.status}
            </span>
            {pace && <span className={`text-[10px] font-medium ${pace.color}`}>· {pace.text}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            {goal.direction === "down" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {goal.start_value ?? "?"} → {goal.target_value} {goal.unit}
            <span className="opacity-50">·</span>
            <Calendar className="w-3 h-3" />
            {formatDate(goal.start_date)} → {formatDate(goal.target_date)}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {goal.status === "active" && (
            <button onClick={() => setStatus("paused")} title="Pause" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5">
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
          {goal.status === "paused" && (
            <button onClick={() => setStatus("active")} title="Resume" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5">
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          {goal.status === "active" && (
            <button onClick={() => setStatus("achieved")} title="Mark achieved" className="p-1.5 rounded text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={remove} title="Delete" className="p-1.5 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Current: <span className="text-foreground font-semibold">{cur ?? "—"} {goal.unit}</span></span>
          <span className="text-foreground font-bold">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-400" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        {recent.length >= 2 && (
          <div className="pt-1">
            <Sparkline values={recent.map((p) => Number(p.value))} direction={goal.direction} />
          </div>
        )}
      </div>

      {goal.status === "active" && (
        <div className="px-4 py-2 border-t border-sidebar-border/60 flex items-center justify-between bg-white/[0.01]">
          <span className="text-[11px] text-muted-foreground">
            {(goal.progress?.length ?? 0)} entr{(goal.progress?.length ?? 0) === 1 ? "y" : "ies"}
            {goal.progress?.[0] && ` · last ${formatDate(goal.progress[0].recorded_at)}`}
          </span>
          <Button size="sm" variant="outline" onClick={onLog} className="h-7 text-xs gap-1.5">
            <Plus className="w-3 h-3" /> Log Progress
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Add goal dialog ─────────────────────────────────────────────────────────

function addMonths(date: string, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return formatDateInput(d);
}

// Set of known auto-fill labels — used to detect if title is still auto vs user-typed.
const AUTO_TITLES = new Set(Object.values(CATEGORY_DEFAULTS).map((d) => d.label));

function AddGoalDialog({ memberId, onClose, onSaved }: { memberId: string; onClose: () => void; onSaved: () => void }) {
  const today = formatDateInput(new Date());
  const initialCategory: GoalCategory = "weight_loss";
  const [form, setForm] = useState<{
    category: GoalCategory;
    title: string;
    unit: string;
    start_value: string;
    target_value: string;
    direction: GoalDirection;
    start_date: string;
    target_date: string;
    duration: string;
    notes: string;
  }>({
    category: initialCategory,
    title: CATEGORY_DEFAULTS[initialCategory].label,
    unit: CATEGORY_DEFAULTS[initialCategory].unit,
    start_value: "",
    target_value: "",
    direction: CATEGORY_DEFAULTS[initialCategory].direction,
    start_date: today,
    target_date: addMonths(today, 3),
    duration: "3",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  function pickCategory(c: GoalCategory) {
    const def = CATEGORY_DEFAULTS[c];
    setForm((f) => ({
      ...f,
      category: c,
      unit: def.unit || f.unit,
      direction: def.direction,
      // Overwrite title only if user hasn't typed a custom one (still matches an auto label or empty).
      title: !f.title || AUTO_TITLES.has(f.title) ? def.label : f.title,
    }));
  }

  function pickDuration(value: string) {
    setForm((f) => {
      if (value === "custom") return { ...f, duration: value };
      const months = parseInt(value, 10);
      return { ...f, duration: value, target_date: addMonths(f.start_date, months) };
    });
  }

  async function save() {
    if (!form.target_value) {
      toast({ title: "Target value is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await createGoal(memberId, {
      title: form.title || CATEGORY_DEFAULTS[form.category].label,
      category: form.category,
      unit: form.unit || "—",
      start_value: form.start_value ? parseFloat(form.start_value) : null,
      target_value: parseFloat(form.target_value),
      direction: form.direction,
      start_date: form.start_date,
      target_date: form.target_date,
      notes: form.notes || null,
    });
    setSaving(false);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: "Goal created" });
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>New Goal</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {(Object.entries(CATEGORY_DEFAULTS) as [GoalCategory, typeof CATEGORY_DEFAULTS[GoalCategory]][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => pickCategory(k)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    form.category === k
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                  }`}>
                  <span>{v.emoji}</span> {v.label}
                </button>
              ))}
            </div>
            {CATEGORY_DEFAULTS[form.category].hint && (
              <p className="text-[11px] text-muted-foreground/80 mt-1">💡 {CATEGORY_DEFAULTS[form.category].hint}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input placeholder="Auto-filled from category — edit if needed"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Current {CATEGORY_DEFAULTS[form.category].noun} {form.unit && <span className="text-muted-foreground/70 font-normal">({form.unit})</span>}</Label>
              <Input type="number" placeholder="Optional" value={form.start_value}
                onChange={(e) => setForm({ ...form, start_value: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Target {CATEGORY_DEFAULTS[form.category].noun} * {form.unit && <span className="text-muted-foreground/70 font-normal">({form.unit})</span>}</Label>
              <Input type="number" value={form.target_value}
                onChange={(e) => setForm({ ...form, target_value: e.target.value })} />
            </div>
          </div>
          {form.category === "custom" && (
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input placeholder="e.g. reps, sets, km" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              <p className="text-[11px] text-muted-foreground">Custom category — set your own unit.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Direction</Label>
            <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as GoalDirection })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="down">Lower is better (e.g. weight loss, time)</SelectItem>
                <SelectItem value="up">Higher is better (e.g. strength, reps)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Select value={form.duration} onValueChange={pickDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.duration === "custom" ? (
              <div className="mt-2">
                <DatePicker value={form.target_date}
                  onChange={(v) => setForm({ ...form, target_date: v })}
                  minDate={new Date()} />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Target date: {formatDate(form.target_date)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.target_value}>
            {saving ? "Saving…" : "Create Goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Log progress dialog ─────────────────────────────────────────────────────

function LogProgressDialog({ goal, onClose, onSaved }: { goal: MemberGoal; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(String(goal.current_value ?? goal.start_value ?? ""));
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value) {
      toast({ title: "Value is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await logGoalProgress(goal.id, parseFloat(value), date, notes || null);
    setSaving(false);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
      return;
    }
    toast({
      title: res.achieved ? "🎉 Goal achieved!" : "Progress logged",
      description: res.achieved ? `${goal.title} hit target` : undefined,
    });
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Progress</DialogTitle>
          <p className="text-xs text-muted-foreground">{goal.title}</p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 text-xs text-muted-foreground space-y-0.5">
            <p>Target: <span className="text-foreground font-semibold">{goal.target_value} {goal.unit}</span></p>
            {goal.current_value != null && (
              <p>Current: <span className="text-foreground font-semibold">{goal.current_value} {goal.unit}</span></p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Value ({goal.unit}) *</Label>
            <Input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <DatePicker value={date} onChange={setDate} maxDate={new Date()} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !value}>
            {saving ? "Saving…" : "Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
