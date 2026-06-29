"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  MessageCircle,
  X,
  Calendar,
} from "lucide-react";
import { createLeadTrialAccount, type TrialCredentials } from "@/app/actions/trial-accounts";
import type { Lead } from "@/app/actions/sales-rep";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function trialEndDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

function sanitizeWhatsapp(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[^0-9+]/g, "").replace(/^0/, "92");
}

// ── Credential Card ───────────────────────────────────────────────────────────

function CredentialCard({
  label,
  value,
  tint,
  secret,
}: {
  label: string;
  value: string;
  tint: "blue" | "amber";
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const tintClasses =
    tint === "blue"
      ? "bg-blue-500/10 border-blue-500/25 text-blue-400"
      : "bg-amber-500/10 border-amber-500/25 text-amber-400";

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const displayValue = secret && !revealed ? "••••••••••••" : value;

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${tintClasses}`}>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm font-mono font-semibold text-foreground truncate">{displayValue}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {secret && (
          <button
            onClick={() => setRevealed((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground"
            aria-label={revealed ? "Hide password" : "Reveal password"}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button
          onClick={copy}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <CheckCircle2 size={14} className="text-green-400" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type TrialResult = TrialCredentials;

type ModalState = "form" | "credentials";

export function CreateTrialModal({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const [state, setState] = useState<ModalState>("form");
  const [shopName, setShopName] = useState(lead.business_name ?? "");
  const [contactName, setContactName] = useState(lead.contact_name ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrialResult | null>(null);
  const [waSent, setWaSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const trialEnd = trialEndDate();
  const trialEndFormatted = formatDate(trialEnd);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createLeadTrialAccount(lead.id, {
        shop_name: shopName.trim(),
        contact_name: contactName.trim(),
        email: email.trim() || undefined,
        whatsapp_number: lead.whatsapp_number ?? undefined,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      setResult(res.credentials ?? null);
      setState("credentials");
    });
  }

  function buildWhatsappUrl(): string {
    const cleanPhone = sanitizeWhatsapp(lead.whatsapp_number);
    const trialExpiryFormatted = result?.trial_ends_at
      ? formatDate(new Date(result.trial_ends_at))
      : trialEndFormatted;

    const message = `Assalam-o-Alaikum ${result?.email ? contactName || lead.contact_name : lead.contact_name}! 🎉

Aapka *Pulse DMS* ka *7-din FREE trial* account tayaar ho gaya hai!

📧 *Email:* ${result?.email ?? ""}
🔑 *Password:* ${result?.password ?? ""}
🔗 *Login:* ${result?.login_url ?? ""}

📅 *Trial khatam:* ${trialExpiryFormatted}

Login karein aur apna business manage karein! Koi bhi madad chahiye to humse rabta karein. 🙌`;

    const encoded = encodeURIComponent(message);

    if (cleanPhone) {
      return `https://wa.me/${cleanPhone}?text=${encoded}`;
    }
    return `https://wa.me/?text=${encoded}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-sidebar-border rounded-2xl w-full max-w-md shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-sidebar-border">
          <div className="flex-1 min-w-0 pr-3">
            {state === "form" ? (
              <>
                <h2 className="text-base font-black text-foreground leading-tight">
                  🚀 Create 7-Day Trial Account
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Client will get full access for 7 days — no card required.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-0.5">
                  <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                  <h2 className="text-base font-black text-foreground leading-tight">
                    Account Created!
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share the credentials with the client via WhatsApp.
                </p>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-4 space-y-3">

          {/* ─── STATE: FORM ─── */}
          {state === "form" && (
            <>
              {/* Trial end chip */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 w-fit">
                <Calendar size={12} className="text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-amber-400">
                  7-day trial — expires {trialEndFormatted}
                </span>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Shop Name */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Shop Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Ahmed General Store"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Contact Name */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Contact Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Ahmed Khan"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                  className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* WhatsApp (read-only display) */}
              {lead.whatsapp_number && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    WhatsApp
                    <span className="ml-1.5 font-normal opacity-60">(used for auto email gen)</span>
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar/50 text-sm text-muted-foreground">
                    <MessageCircle size={13} className="text-[#25D366] shrink-0" />
                    <span>{lead.whatsapp_number}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── STATE: CREDENTIALS ─── */}
          {state === "credentials" && result && (
            <>
              <CredentialCard label="Email" value={result.email} tint="blue" />
              {/* Password hidden after WA send — password is ephemeral, never stored */}
              {!waSent
                ? <CredentialCard label="Password" value={result.password} tint="amber" secret />
                : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/25">
                    <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                    <p className="text-xs text-green-400 font-semibold">Credentials sent via WhatsApp</p>
                  </div>
                )
              }

              {/* Trial expiry chip */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sidebar border border-sidebar-border w-fit">
                <Calendar size={12} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground font-medium">
                  Expires:{" "}
                  <span className="text-foreground font-semibold">
                    {result.trial_ends_at
                      ? formatDate(new Date(result.trial_ends_at))
                      : trialEndFormatted}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 pb-5 flex flex-col gap-2">
          {state === "form" ? (
            <>
              <button
                onClick={handleSubmit}
                disabled={pending || !shopName.trim() || !contactName.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pending && <Loader2 size={15} className="animate-spin" />}
                {pending ? "Creating…" : "Create Trial Account"}
              </button>
              <button
                onClick={onClose}
                className="w-full py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {!waSent ? (
                <a
                  href={buildWhatsappUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWaSent(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-bold transition-colors"
                >
                  <MessageCircle size={16} />
                  Send on WhatsApp
                </a>
              ) : (
                <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/10 border border-green-500/25 text-green-400 text-sm font-bold">
                  <CheckCircle2 size={16} />
                  Sent on WhatsApp
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
