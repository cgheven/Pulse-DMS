"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { saveReminderSettings } from "@/app/actions/reminders";
import { DEFAULT_REMINDER_TEMPLATE, formatAccounts, buildReminderMessage } from "@/lib/whatsapp-reminder";
import type { Gym, PaymentMethodAccount } from "@/types";

function uid() { return Math.random().toString(36).slice(2, 10); }

export function PaymentRecoverySection({ gym }: { gym: Gym | null }) {
  const router = useRouter();
  const [template, setTemplate] = useState(gym?.reminder_template ?? DEFAULT_REMINDER_TEMPLATE);
  const [methods, setMethods] = useState<PaymentMethodAccount[]>(
    () => (gym?.payment_methods ?? []).map((m) => ({ ...m, id: m.id || uid() }))
  );
  const [graceDays, setGraceDays] = useState(gym?.payment_overdue_grace_days ?? 2);
  const [saving, setSaving] = useState(false);

  function addMethod() {
    setMethods((prev) => [...prev, { id: uid(), label: "", account_number: "" }]);
  }
  function updateMethod(id: string, patch: Partial<PaymentMethodAccount>) {
    setMethods((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
  }
  function removeMethod(id: string) {
    setMethods((prev) => prev.filter((m) => m.id !== id));
  }

  async function save() {
    setSaving(true);
    const res = await saveReminderSettings({
      template,
      payment_methods: methods.filter((m) => m.label.trim()),
      payment_overdue_grace_days: graceDays,
    });
    setSaving(false);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else { toast({ title: "Reminder settings saved" }); router.refresh(); }
  }

  // Live preview using mock data
  const previewMessage = buildReminderMessage({
    template,
    memberName: "Saud",
    amount: 6000,
    month: "April 2026",
    gymName: gym?.name ?? "Your Gym",
    accounts: methods,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">Payment Recovery</CardTitle>
        </div>
        <CardDescription>WhatsApp reminder template + payment methods sent to members with unpaid fees.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Overdue grace period */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Overdue Grace Period</Label>
          <p className="text-xs text-muted-foreground">Number of days into the month before unpaid members are marked overdue.</p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={28}
              step={1}
              value={graceDays}
              onChange={(e) => setGraceDays(Math.min(28, Math.max(0, parseInt(e.target.value) || 0)))}
              className="w-24 h-9"
            />
            <span className="text-sm text-muted-foreground">
              {graceDays === 0 ? "Overdue from day 1" : `Overdue from day ${graceDays + 1}`}
            </span>
          </div>
        </div>

        {/* Payment methods */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Payment Methods</Label>
            <Button size="sm" variant="outline" onClick={addMethod} className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" /> Add Method
            </Button>
          </div>
          {methods.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No methods added — click "Add Method" to add bank, JazzCash, EasyPaisa, etc.</p>
          ) : (
            <div className="space-y-2">
              {methods.map((m) => (
                <div key={m.id} className="rounded-lg border border-sidebar-border bg-card/50 p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                  <Input placeholder="Label (e.g. HBL, JazzCash)" value={m.label}
                    onChange={(e) => updateMethod(m.id, { label: e.target.value })}
                    className="md:col-span-3 h-9" />
                  <Input placeholder="Account title" value={m.account_title ?? ""}
                    onChange={(e) => updateMethod(m.id, { account_title: e.target.value })}
                    className="md:col-span-3 h-9" />
                  <Input placeholder="Account number / phone" value={m.account_number ?? ""}
                    onChange={(e) => updateMethod(m.id, { account_number: e.target.value })}
                    className="md:col-span-3 h-9" />
                  <Input placeholder="IBAN (optional)" value={m.iban ?? ""}
                    onChange={(e) => updateMethod(m.id, { iban: e.target.value })}
                    className="md:col-span-2 h-9" />
                  <Button variant="ghost" size="icon" onClick={() => removeMethod(m.id)}
                    className="h-9 w-9 text-muted-foreground hover:text-rose-400 md:col-span-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Message Template</Label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={9}
            className="w-full rounded-lg border border-sidebar-border bg-card p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 resize-y"
          />
          <p className="text-[11px] text-muted-foreground">
            Placeholders: <code className="text-foreground">{"{name}"}</code> · <code className="text-foreground">{"{amount}"}</code> · <code className="text-foreground">{"{month}"}</code> · <code className="text-foreground">{"{gym}"}</code> · <code className="text-foreground">{"{accounts}"}</code>
          </p>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Live Preview</Label>
          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] p-3 max-w-md">
            <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <MessageCircle className="w-3 h-3 text-emerald-400" /> WhatsApp message preview
            </p>
            <pre className="whitespace-pre-wrap text-sm font-sans text-foreground leading-relaxed">{previewMessage}</pre>
          </div>
          {methods.length === 0 && template.includes("{accounts}") && (
            <p className="text-[11px] text-amber-400">⚠ Template includes <code>{"{accounts}"}</code> but no methods added — section will be blank.</p>
          )}
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Recovery Settings
        </Button>

        {/* Help */}
        <div className="rounded-lg border border-sidebar-border bg-card/30 p-3 text-xs space-y-1">
          <p className="font-semibold text-foreground">How it works</p>
          <p className="text-muted-foreground">On the Transactions page, each unpaid member shows a <span className="font-medium text-foreground">"Send Reminder"</span> button. Click → opens WhatsApp Web/app with this message pre-filled. You hit send.</p>
          <p className="text-muted-foreground">Members unpaid after the grace period are highlighted in red so you know who to chase first.</p>
        </div>

        {/* Helper preview of how accounts will render */}
        {methods.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">How {"{accounts}"} renders</summary>
            <pre className="mt-2 p-2 rounded bg-white/[0.03] border border-white/5 whitespace-pre-wrap font-mono">{formatAccounts(methods)}</pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
