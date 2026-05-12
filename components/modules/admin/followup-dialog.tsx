"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MessageCircle, Phone, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { recordProspectFollowup } from "@/app/actions/admin-prospects";
import {
  PROSPECT_TEMPLATES,
  fillTemplate,
  buildWhatsappUrl,
  getTemplate,
} from "@/lib/prospect-templates";
import type { Prospect } from "@/types";

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

/** "Never contacted" | "5 minutes ago" | "2 days ago" | "3 weeks ago" */
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never contacted";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never contacted";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk} week${wk === 1 ? "" : "s"} ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const yr = Math.round(day / 365);
  return `${yr} year${yr === 1 ? "" : "s"} ago`;
}

function deriveSenderFromEmail(email: string | null | undefined): string {
  if (!email) return "Pulse GMS";
  const local = email.split("@")[0] ?? "";
  if (!local) return "Pulse GMS";
  // "musab.khan" -> "Musab"
  const first = local.split(/[.\-_+]/)[0] ?? local;
  const capitalized = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return `${capitalized} / Pulse GMS`;
}

export default function FollowupDialog({ prospect, open, onOpenChange, onSent }: Props) {
  const initialKey = useMemo(() => {
    const last = prospect?.last_followup_template;
    if (last && getTemplate(last)) return last;
    return "intro_cold";
  }, [prospect?.id, prospect?.last_followup_template]);

  const [selectedKey, setSelectedKey] = useState<string>(initialKey);
  const [message, setMessage] = useState<string>("");
  const [sender, setSender] = useState<string>("Pulse GMS");
  const [isPending, startTransition] = useTransition();

  // Reset selection + sender when dialog opens for a new prospect
  useEffect(() => {
    if (!open || !prospect) return;
    setSelectedKey(initialKey);
  }, [open, prospect?.id, initialKey]);

  // Load current user's email to derive sender name (when dialog opens)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        setSender(deriveSenderFromEmail(data.user?.email));
      } catch {
        if (!cancelled) setSender("Pulse GMS");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Recompute filled message whenever template, sender, or prospect changes
  useEffect(() => {
    if (!prospect) return;
    const tpl = getTemplate(selectedKey);
    if (!tpl) return;
    const filled = fillTemplate(tpl.body, {
      ownerName: prospect.owner_name,
      gym: prospect.name,
      city: prospect.city,
      sender,
    });
    setMessage(filled);
  }, [selectedKey, sender, prospect?.id, prospect?.owner_name, prospect?.name, prospect?.city]);

  if (!prospect) return null;

  const hasPhone = Boolean(prospect.phone && prospect.phone.trim().length > 0);
  const trimmedMessage = message.trim();
  const canSend = hasPhone && trimmedMessage.length > 0 && !isPending;
  const followupCount = prospect.followup_count ?? 0;
  const lastContacted = formatRelativeTime(prospect.last_followup_at);

  function handleSend() {
    if (!prospect || !canSend) return;
    const url = buildWhatsappUrl(prospect.phone, message);
    if (!url) {
      toast({ title: "Invalid phone number", variant: "destructive" });
      return;
    }
    // Open WhatsApp synchronously on the user gesture to avoid popup blockers.
    // Record follow-up after — the wa.me tab opens regardless of audit success.
    window.open(url, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const res = await recordProspectFollowup(prospect.id, selectedKey, message);
      if (res?.error) {
        toast({ title: "Opened WhatsApp — but audit failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Follow-up sent" });
      onOpenChange(false);
      onSent?.();
    });
  }

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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-500 shrink-0" />
                <span className="truncate">Follow up with {prospect.name}</span>
              </DialogTitle>
              <DialogDescription className="mt-1">
                Pick a template, tweak the message, send on WhatsApp.
              </DialogDescription>
            </div>
            <div className="text-right shrink-0">
              {hasPhone ? (
                <p className="text-xs font-mono text-blue-400 inline-flex items-center gap-1.5">
                  <Phone className="w-3 h-3" /> {prospect.phone}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Phone className="w-3 h-3" /> No phone
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" />
                {followupCount > 0 ? (
                  <>
                    {followupCount} follow-up{followupCount === 1 ? "" : "s"} · Last: {lastContacted}
                  </>
                ) : (
                  <>Never contacted</>
                )}
              </p>
            </div>
          </div>
        </DialogHeader>

        {!hasPhone && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>No phone number — add a phone to enable WhatsApp follow-up.</span>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Template
          </p>
          <div className="grid gap-2 max-h-[40vh] overflow-y-auto pr-1">
            {PROSPECT_TEMPLATES.map((t) => {
              const active = selectedKey === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedKey(t.key)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    active
                      ? "border-green-500/50 bg-green-500/10"
                      : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3.5 h-3.5 rounded-full border shrink-0 ${
                        active ? "border-green-500 bg-green-500" : "border-muted-foreground/40"
                      }`}
                    />
                    <p className="text-sm font-semibold">{t.label}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground ml-5.5 pl-[14px] mt-0.5">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Message preview (editable)
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={9}
            className="font-mono text-xs leading-relaxed"
            placeholder="Type or pick a template above..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-green-600 hover:bg-green-500 text-white"
          >
            <MessageCircle className="w-4 h-4 mr-1.5" />
            {isPending ? "Sending..." : "Send via WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
