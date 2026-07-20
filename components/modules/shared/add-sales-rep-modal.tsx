"use client";

import { useState, useTransition } from "react";
import { Loader2, Eye, EyeOff, RefreshCw, Check, Copy } from "lucide-react";
import { shareSalesRepCredentialsViaWhatsApp } from "@/lib/whatsapp-templates";

const PASSWORD_CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateClientPassword(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join("");
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 10;
}

export type AddSalesRepResult = { userId?: string; phone?: string; error?: string };

// Shared by the platform-admin sales-teams page (createSalesRep) and the
// sales-manager team-roster page (createTeamRep) — only the server action and
// whether "Manager" is offered as a role differ between the two callers.
export function AddSalesRepModal({
  teamName,
  allowManagerRole = true,
  action,
  onClose,
  onAdded,
}: {
  teamName: string;
  allowManagerRole?: boolean;
  action: (data: { email: string; password: string; full_name: string; phone: string; role: string }) => Promise<AddSalesRepResult>;
  onClose: () => void;
  onAdded: (result: { userId: string; phone: string; email: string; full_name: string; role: string }) => void;
}) {
  const [form, setForm] = useState({ email: "", password: generateClientPassword(), full_name: "", phone: "", role: "member" });
  const [showPwd, setShowPwd] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ phone: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function regeneratePassword() {
    setForm(f => ({ ...f, password: generateClientPassword() }));
  }

  function handleCopyPassword() {
    navigator.clipboard.writeText(form.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await action(form);
      if (res.error) { setError(res.error); return; }
      onAdded({ userId: res.userId!, phone: res.phone!, email: form.email, full_name: form.full_name, role: form.role });
      setCredentials({ phone: res.phone! });
    });
  }

  function handleDone() {
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">Add Sales Rep</h2>
        <p className="text-xs text-muted-foreground mb-4">Add to: <span className="font-semibold text-foreground">{teamName}</span></p>
        {error && <p className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>}

        {credentials ? (
          <>
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-green-400">Login credentials ready</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium text-foreground">{form.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium text-foreground">{credentials.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium text-foreground">{form.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Password</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium text-foreground">{form.password}</span>
                    <button
                      onClick={handleCopyPassword}
                      className="p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => shareSalesRepCredentialsViaWhatsApp({ fullName: form.full_name, phone: credentials.phone, email: form.email, password: form.password })}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                Send Credentials via WhatsApp
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={handleDone}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Full Name *</label>
                <input value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Ali Hassan"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Email *</label>
                <input value={form.email} onChange={e => set("email", e.target.value)} type="email" placeholder="ali@company.com"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone (WhatsApp) *</label>
                <input value={form.phone} onChange={e => set("phone", e.target.value)} type="tel" placeholder="0300-1234567"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Password *</label>
                <div className="relative">
                  <input value={form.password} onChange={e => set("password", e.target.value)} type={showPwd ? "text" : "password"} placeholder="Min 8 characters"
                    className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button type="button" onClick={regeneratePassword} className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Regenerate password">
                    <RefreshCw size={14} />
                  </button>
                  <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              {allowManagerRole && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Role</label>
                  <select value={form.role} onChange={e => set("role", e.target.value)}
                    className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={pending || !form.email.trim() || !form.full_name.trim() || !isValidPhone(form.phone) || form.password.length < 8}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                Add Rep
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
