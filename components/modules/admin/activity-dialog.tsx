"use client";

import { useEffect, useState, useTransition } from "react";
import {
  History, Phone, MapPin, MessageCircle, StickyNote, ArrowRightCircle,
  Loader2, Check, X, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  listProspectActivities,
  logProspectActivity,
  recordProspectOutcome,
} from "@/app/actions/admin-prospects";
import type {
  Prospect,
  ProspectActivity,
  ProspectActivityOutcome,
  ProspectActivityType,
} from "@/types";

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  /** Auto-show outcome quick-chips at the top (e.g. right after a WhatsApp send) */
  showQuickOutcome?: boolean;
}

const TYPE_OPTIONS: { value: Exclude<ProspectActivityType, "status_change">; label: string; icon: React.ElementType }[] = [
  { value: "call", label: "Call", icon: Phone },
  { value: "visit", label: "Visit", icon: MapPin },
  { value: "note", label: "Note", icon: StickyNote },
  { value: "whatsapp", label: "WhatsApp (manual)", icon: MessageCircle },
];

const OUTCOMES: { value: ProspectActivityOutcome; label: string; bg: string; text: string; border: string }[] = [
  { value: "answered",         label: "Answered",         bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/40" },
  { value: "interested",       label: "Interested",       bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/40" },
  { value: "scheduled_visit",  label: "Visit scheduled",  bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/40" },
  { value: "onboarded",        label: "Onboarded",        bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/50" },
  { value: "no_response",      label: "No response",      bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/40" },
  { value: "not_interested",   label: "Not interested",   bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/40" },
  { value: "rejected",         label: "Rejected",         bg: "bg-red-500/15",     text: "text-red-300",     border: "border-red-500/40" },
  { value: "other",            label: "Other",            bg: "bg-muted",          text: "text-muted-foreground", border: "border-border" },
];

const TYPE_META: Record<ProspectActivityType, { label: string; icon: React.ElementType; color: string }> = {
  whatsapp:      { label: "WhatsApp",      icon: MessageCircle,    color: "text-green-400" },
  call:          { label: "Call",          icon: Phone,            color: "text-blue-400" },
  visit:         { label: "Visit",         icon: MapPin,           color: "text-violet-400" },
  note:          { label: "Note",          icon: StickyNote,       color: "text-muted-foreground" },
  status_change: { label: "Status change", icon: ArrowRightCircle, color: "text-amber-400" },
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk} wk ago`;
  const mo = Math.round(day / 30);
  return `${mo} mo ago`;
}

export default function ActivityDialog({ prospect, open, onOpenChange, onChanged, showQuickOutcome }: Props) {
  const [activities, setActivities] = useState<ProspectActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<Exclude<ProspectActivityType, "status_change">>("call");
  const [formOutcome, setFormOutcome] = useState<ProspectActivityOutcome | "">("");
  const [formNote, setFormNote] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !prospect) return;
    setLoading(true);
    setShowForm(false);
    setFormType("call");
    setFormOutcome("");
    setFormNote("");
    listProspectActivities(prospect.id).then((res) => {
      if (res.error) {
        toast({ title: "Failed to load activities", description: res.error, variant: "destructive" });
      } else {
        setActivities(res.activities ?? []);
      }
      setLoading(false);
    });
  }, [open, prospect?.id]);

  if (!prospect) return null;

  function refresh() {
    if (!prospect) return;
    listProspectActivities(prospect.id).then((res) => {
      if (res.activities) setActivities(res.activities);
    });
  }

  function handleQuickOutcome(outcome: ProspectActivityOutcome) {
    if (!prospect) return;
    startTransition(async () => {
      const res = await recordProspectOutcome(prospect.id, outcome);
      if (res.error) {
        toast({ title: "Failed to record", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Response recorded" });
      refresh();
      onChanged?.();
    });
  }

  function handleSubmitForm() {
    if (!prospect) return;
    if (!formNote.trim() && !formOutcome) {
      toast({ title: "Add a note or outcome", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const res = await logProspectActivity({
        prospectId: prospect.id,
        type: formType,
        outcome: formOutcome || null,
        content: formNote || null,
      });
      if (res.error) {
        toast({ title: "Failed to log", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Activity logged" });
      setShowForm(false);
      setFormNote("");
      setFormOutcome("");
      refresh();
      onChanged?.();
    });
  }

  const hasActivities = activities.length > 0;
  const lastOutcome = prospect.last_outcome;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          sm:max-w-2xl
          max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto
          max-sm:translate-x-0 max-sm:translate-y-0 max-sm:left-0
          max-sm:max-w-full max-sm:rounded-t-2xl max-sm:rounded-b-none
          max-sm:max-h-[92vh] max-sm:overflow-y-auto
        "
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">Activity — {prospect.name}</span>
          </DialogTitle>
          <DialogDescription>
            Contact history + outcomes. Use quick chips to record a response.
          </DialogDescription>
        </DialogHeader>

        {/* Quick outcome chips */}
        {(showQuickOutcome || hasActivities) && (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {lastOutcome ? "Update response" : "Record response"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map((o) => {
                const active = lastOutcome === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQuickOutcome(o.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? `${o.bg} ${o.text} ${o.border}`
                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Log activity form (collapsible) */}
        <div className="rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>+ Log call / visit / note</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showForm ? "rotate-180" : ""}`} />
          </button>
          {showForm && (
            <div className="px-3 pb-3 space-y-2 border-t border-border/60 pt-3">
              <div className="flex flex-wrap gap-1.5">
                {TYPE_OPTIONS.map((t) => {
                  const Icon = t.icon;
                  const active = formType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormType(t.value)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <Textarea
                rows={3}
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="What happened? e.g. 'Spoke to owner, said call back Friday after Asr.'"
                className="text-xs"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
                  Outcome:
                </span>
                <button
                  type="button"
                  onClick={() => setFormOutcome("")}
                  className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                    formOutcome === ""
                      ? "border-foreground/40 bg-foreground/10 text-foreground"
                      : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                  }`}
                >
                  none
                </button>
                {OUTCOMES.map((o) => {
                  const active = formOutcome === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setFormOutcome(o.value)}
                      className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                        active
                          ? `${o.bg} ${o.text} ${o.border}`
                          : "border-border/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSubmitForm} disabled={isPending}>
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Timeline
          </p>
          <div className="max-h-[40vh] overflow-y-auto pr-1 -mr-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No activities yet. Send a WhatsApp follow-up or log a call to start the timeline.
              </p>
            ) : (
              <ol className="relative border-l border-border/60 ml-2 space-y-3 py-1">
                {activities.map((a) => {
                  const meta = TYPE_META[a.type];
                  const Icon = meta.icon;
                  const outcome = OUTCOMES.find((o) => o.value === a.outcome);
                  return (
                    <li key={a.id} className="pl-4 relative">
                      <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-background ${meta.color.replace("text-", "bg-")}`} />
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${meta.color}`}>
                              <Icon className="w-3 h-3" /> {meta.label}
                            </span>
                            {outcome && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${outcome.bg} ${outcome.text} ${outcome.border}`}>
                                {outcome.label}
                              </span>
                            )}
                          </div>
                          {a.content && (
                            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                              {a.content}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {a.created_by_email ?? "—"} · {formatRelativeTime(a.created_at)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="w-3 h-3 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
