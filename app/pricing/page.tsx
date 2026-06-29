"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Zap, GitBranch, CheckCircle2 } from "lucide-react";
import { submitDemoRequest } from "@/app/actions/demo-request";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Pricing data ──────────────────────────────────────────────────────────────

type BillingPeriod = "monthly" | "annual";

const PLANS = [
  {
    key: "single",
    name: "Single Branch",
    branches: 1,
    tagline: "One shop, fully managed.",
    monthly: 4500,
    annual: 40000,
    highlight: false,
  },
  {
    key: "double",
    name: "Double Branch",
    branches: 2,
    tagline: "Two branches, one dashboard.",
    monthly: 7500,
    annual: 67000,
    highlight: true,
    badge: "Most Popular",
  },
  {
    key: "triple",
    name: "Triple Branch",
    branches: 3,
    tagline: "Scale across three locations.",
    monthly: 9500,
    annual: 85000,
    highlight: false,
  },
] as const;

const FEATURES = [
  "Sales invoicing & billing",
  "Stock & inventory management",
  "Supplier ledger & credit tracking",
  "Purchase & batch management",
  "Profit & Loss reporting",
  "Expense tracking",
  "Product catalogue with categories",
  "Real-time stock alerts",
  "Multi-branch management",
  "Multi-user access & roles",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPrice(plan: (typeof PLANS)[number], period: BillingPeriod) {
  return period === "monthly" ? plan.monthly : plan.annual;
}

function annualSavingsPct(plan: (typeof PLANS)[number]) {
  const fullYear = plan.monthly * 12;
  return Math.round(((fullYear - plan.annual) / fullYear) * 100);
}

function fmt(n: number) {
  return n.toLocaleString("en-PK");
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  period,
  onGetStarted,
}: {
  plan: (typeof PLANS)[number];
  period: BillingPeriod;
  onGetStarted: () => void;
}) {
  const price = getPrice(plan, period);
  const annualSaved = plan.monthly * 12 - plan.annual;
  const monthlyEquivalent = Math.round(plan.annual / 12);
  const perBranchMonthly = period === "monthly"
    ? Math.round(plan.monthly / plan.branches)
    : Math.round(plan.annual / (plan.branches * 12));

  return (
    <div className={`relative h-full rounded-2xl border p-7 flex flex-col gap-5 transition-all ${
      plan.highlight
        ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_60px_-10px] shadow-primary/20"
        : "border-sidebar-border bg-card"
    }`}>
      {"badge" in plan && plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider shadow-lg">
            {plan.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
          {plan.name}
        </p>
        <div className="flex items-center gap-1.5 mb-4">
          {Array.from({ length: plan.branches }).map((_, i) => (
            <GitBranch key={i} className="w-3 h-3 text-primary/60" />
          ))}
          <span className="text-[11px] font-medium text-primary">
            {plan.branches} {plan.branches === 1 ? "branch" : "branches"}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-end gap-1.5 mb-1">
          <span className="text-sm text-muted-foreground mb-1">PKR</span>
          <span className="text-5xl font-black text-foreground tabular-nums leading-none">
            {fmt(price)}
          </span>
          <span className="text-sm text-muted-foreground mb-1">
            {period === "monthly" ? "/mo" : "/yr"}
          </span>
        </div>

        {period === "annual" ? (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">
              PKR {fmt(monthlyEquivalent)}/mo
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-[11px] font-bold text-primary">
              Save PKR {fmt(annualSaved)}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1.5">{plan.tagline}</p>
        )}
      </div>

      {/* Breakdown */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar/50 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Per branch / month</span>
          <span className="font-bold tabular-nums text-foreground">PKR {fmt(perBranchMonthly)}</span>
        </div>
        {plan.branches > 1 && (
          <div className="flex items-center justify-between text-xs border-t border-sidebar-border pt-2">
            <span className="text-muted-foreground">vs single branch</span>
            <span className="font-semibold text-primary text-[11px]">
              PKR {fmt(Math.round(4500 - perBranchMonthly))} cheaper/branch
            </span>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="mt-auto">
        <button
          onClick={onGetStarted}
          className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
            plan.highlight
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
          }`}
        >
          Get Started
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Demo Request Form ─────────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full h-11 rounded-lg border border-sidebar-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:ring-2 focus:ring-primary/30 focus:border-primary";

function DemoForm({ initialPlan = "" }: { initialPlan?: string }) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    contact_name: "",
    shop_name: "",
    city: "",
    phone: "",
    whatsapp: "",
    plan_interest: initialPlan,
    num_branches: "",
    message: "",
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitDemoRequest({
        ...form,
        num_branches: form.num_branches ? parseInt(form.num_branches, 10) : undefined,
      });
      if (result.error) setError(result.error);
      else setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-sidebar-border bg-card p-8 sm:p-10 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground mb-1">Request received!</h3>
          <p className="text-sm text-muted-foreground">
            We&apos;ll reach out within a few hours to get your shop set up.
          </p>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-background p-5 text-left space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">What happens next</p>
          {[
            "We review your details and prepare your account.",
            "Our team calls or WhatsApps you to confirm.",
            "Your shop goes live — we walk you through setup together.",
          ].map((text, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="shrink-0 font-mono text-xs font-bold text-primary/60 mt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-sm text-foreground leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-sidebar-border bg-card p-6 sm:p-8 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">
            Your Name <span className="text-red-500">*</span>
          </label>
          <input required type="text" placeholder="e.g. Ali Raza" value={form.contact_name} onChange={set("contact_name")} className={INPUT_CLS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">
            Shop Name <span className="text-red-500">*</span>
          </label>
          <input required type="text" placeholder="e.g. Raza Electronics" value={form.shop_name} onChange={set("shop_name")} className={INPUT_CLS} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">City</label>
          <input type="text" placeholder="e.g. Lahore, Karachi" value={form.city} onChange={set("city")} className={INPUT_CLS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">No. of Branches</label>
          <input type="number" min={1} max={99} placeholder="e.g. 2" value={form.num_branches} onChange={set("num_branches")} className={INPUT_CLS} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">Plan Interest</label>
        <Select value={form.plan_interest} onValueChange={(v) => setForm((f) => ({ ...f, plan_interest: v }))}>
          <SelectTrigger className="w-full h-11">
            <SelectValue placeholder="Select a plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single Branch — PKR 4,500 / mo</SelectItem>
            <SelectItem value="double">Double Branch — PKR 7,500 / mo</SelectItem>
            <SelectItem value="triple">Triple Branch — PKR 9,500 / mo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">
            Phone <span className="text-red-500">*</span>
          </label>
          <input required type="tel" placeholder="e.g. 0300-1234567" value={form.phone} onChange={set("phone")} className={INPUT_CLS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">WhatsApp</label>
          <input type="tel" placeholder="Leave blank if same as above" value={form.whatsapp} onChange={set("whatsapp")} className={INPUT_CLS} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">Message</label>
        <textarea
          rows={3}
          placeholder="Anything you'd like us to know?"
          value={form.message}
          onChange={set("message")}
          className="w-full rounded-lg border border-sidebar-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Sending…" : "Send Request →"}
      </button>

      <p className="text-center text-xs text-muted-foreground/60">
        We typically respond within a few hours during business days.
      </p>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  const [dialogPlan, setDialogPlan] = useState<string | null>(null);

  const avgSavingsPct = Math.round(
    PLANS.reduce((sum, p) => sum + annualSavingsPct(p), 0) / PLANS.length
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link href="/login" className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-bold text-base text-foreground tracking-tight">Pulse</span>
          </div>
          <span className="text-[10px] text-primary/60 uppercase tracking-[0.2em] font-semibold ml-9 -mt-0.5">
            Pulse of your business
          </span>
        </Link>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Sign in
        </Link>
      </nav>

      {/* Heading + billing toggle */}
      <div className="relative z-10 px-6 pt-10 pb-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-2">Pricing</p>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              One price per branch.
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Every feature included in every plan — no card required.
            </p>
          </div>

          {/* Billing toggle */}
          <div className="flex flex-col items-start sm:items-end gap-1.5">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-sidebar-border bg-card shadow-sm">
              <button
                onClick={() => setBilling("monthly")}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  billing === "monthly"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("annual")}
                className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  billing === "annual"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Annual
                {billing !== "annual" && (
                  <span className="absolute -top-2.5 -right-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none">
                    -{avgSavingsPct}%
                  </span>
                )}
              </button>
            </div>
            {billing === "annual" && (
              <p className="text-xs text-primary font-semibold">
                🎉 You&apos;re saving ~{avgSavingsPct}% compared to monthly
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pricing cards */}
      <section className="relative z-10 px-6 pb-10 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              period={billing}
              onGetStarted={() => setDialogPlan(plan.key)}
            />
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="relative z-10 px-6 pb-10 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
          <div className="px-6 py-3.5 border-b border-sidebar-border bg-sidebar/40">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Price Comparison</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground w-36" />
                  {PLANS.map((p) => (
                    <th key={p.key} className={`px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider ${p.highlight ? "text-primary" : "text-foreground"}`}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border">
                {[
                  {
                    label: "Monthly",
                    getValue: (p: (typeof PLANS)[number]) => `PKR ${fmt(p.monthly)}/mo`,
                    highlight: false,
                  },
                  {
                    label: "Annual",
                    getValue: (p: (typeof PLANS)[number]) => `PKR ${fmt(p.annual)}/yr`,
                    highlight: false,
                  },
                  {
                    label: "You save",
                    getValue: (p: (typeof PLANS)[number]) => `PKR ${fmt(p.monthly * 12 - p.annual)}`,
                    highlight: true,
                  },
                  {
                    label: "Per branch/mo",
                    getValue: (p: (typeof PLANS)[number]) => `PKR ${fmt(Math.round(p.monthly / p.branches))}`,
                    highlight: false,
                  },
                ].map(({ label, getValue, highlight }) => (
                  <tr key={label} className="hover:bg-sidebar/30 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-foreground text-sm">{label}</td>
                    {PLANS.map((p) => (
                      <td key={p.key} className={`px-6 py-3.5 text-center tabular-nums text-sm ${highlight ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {getValue(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Feature list */}
      <section className="relative z-10 px-6 pb-10 max-w-5xl mx-auto">
        <div className="relative rounded-2xl border border-primary/20 bg-card overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="flex items-center justify-between px-6 sm:px-8 py-3.5 border-b border-sidebar-border/80">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              {FEATURES.length} features — every plan
            </p>
            <span className="text-xs text-muted-foreground">All tiers identical</span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-px bg-sidebar-border/60">
            {FEATURES.map((f, i) => (
              <li key={f} className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 bg-card px-6 sm:px-8 py-4 transition-colors hover:bg-primary/[0.03]">
                <span className="font-mono text-[11px] font-semibold text-primary/60 group-hover:text-primary tabular-nums tracking-wider transition-colors">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-foreground text-[14px] leading-snug">{f}</span>
                <Check className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
              </li>
            ))}
            {FEATURES.length % 2 === 1 && <li aria-hidden className="hidden md:block bg-card" />}
          </ul>
          <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>
      </section>

      {/* Dialog */}
      <Dialog open={dialogPlan !== null} onOpenChange={(v) => !v && setDialogPlan(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Get Started</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Fill in your details — we&apos;ll set up your shop in under 24 hours.
            </p>
          </DialogHeader>
          {dialogPlan !== null && <DemoForm key={dialogPlan} initialPlan={dialogPlan} />}
        </DialogContent>
      </Dialog>

      {/* CTA banner */}
      <section className="relative z-10 px-6 py-8 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-sidebar-border bg-card px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-foreground text-sm">Ready to try Pulse DMS?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Free trial · No card · Live in minutes</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`https://wa.me/?text=${encodeURIComponent("Hi! I'd like to learn more about Pulse DMS.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg border border-sidebar-border hover:border-primary/30 hover:bg-primary/5 text-foreground font-semibold text-sm transition-all"
            >
              Chat on WhatsApp
            </a>
            <Link
              href="/login"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
            >
              Start free trial
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-sidebar-border px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/login" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary" />
            </div>
            <span className="font-bold text-base text-foreground">Pulse DMS</span>
          </Link>
          <p className="text-xs text-muted-foreground/60">
            © 2026 Pulse. Built for dealers who mean business.
          </p>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
