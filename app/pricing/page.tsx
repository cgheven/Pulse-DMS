"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Zap, GitBranch } from "lucide-react";

// ── Pricing data ──────────────────────────────────────────────────────────────

type BillingPeriod = "monthly" | "sixMonth" | "annual";

const PLANS = [
  {
    key: "single",
    name: "Single Branch",
    branches: 1,
    tagline: "One shop, fully managed.",
    monthly: 4500,
    sixMonth: 22500,
    annual: 40000,
    highlight: false,
    cta: "Start Free Trial",
  },
  {
    key: "double",
    name: "Double Branch",
    branches: 2,
    tagline: "Two branches, one dashboard.",
    monthly: 7500,
    sixMonth: 37500,
    annual: 67000,
    highlight: true,
    badge: "Most Popular",
    cta: "Start Free Trial",
  },
  {
    key: "triple",
    name: "Triple Branch",
    branches: 3,
    tagline: "Scale across three locations.",
    monthly: 9500,
    sixMonth: 47500,
    annual: 85000,
    highlight: false,
    cta: "Start Free Trial",
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
  if (period === "monthly") return plan.monthly;
  if (period === "sixMonth") return plan.sixMonth;
  return plan.annual;
}

function getSavings(plan: (typeof PLANS)[number], period: BillingPeriod): number {
  if (period === "sixMonth") return plan.monthly * 6 - plan.sixMonth;
  if (period === "annual") return plan.monthly * 12 - plan.annual;
  return 0;
}

function getPerBranchMonthly(plan: (typeof PLANS)[number], period: BillingPeriod) {
  const months = period === "monthly" ? 1 : period === "sixMonth" ? 6 : 12;
  return Math.round(getPrice(plan, period) / (plan.branches * months));
}

function fmt(n: number) {
  return n.toLocaleString("en-PK");
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  period,
}: {
  plan: (typeof PLANS)[number];
  period: BillingPeriod;
}) {
  const price = getPrice(plan, period);
  const savings = getSavings(plan, period);
  const perBranchMonthly = getPerBranchMonthly(plan, period);
  const months = period === "monthly" ? 1 : period === "sixMonth" ? 6 : 12;

  return (
    <div
      className={`relative h-full rounded-2xl border p-7 flex flex-col gap-6 transition-all ${
        plan.highlight
          ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_60px_-10px] shadow-primary/20"
          : "border-sidebar-border bg-card"
      }`}
    >
      {"badge" in plan && plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider shadow-lg">
            {plan.badge}
          </span>
        </div>
      )}

      {/* Plan header */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {plan.name}
          </p>
        </div>
        <div className="flex items-center gap-1.5 mb-3">
          {Array.from({ length: plan.branches }).map((_, i) => (
            <GitBranch key={i} className="w-3 h-3 text-primary/60" />
          ))}
          <span className="text-[11px] font-medium text-primary">
            {plan.branches} {plan.branches === 1 ? "branch" : "branches"}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-end gap-1 mb-1">
          <span className="text-sm text-muted-foreground">PKR</span>
          <span className="text-4xl font-bold text-foreground tabular-nums">
            {fmt(price)}
          </span>
          <span className="text-sm text-muted-foreground pb-1">
            {period === "monthly" ? "/mo" : period === "sixMonth" ? "/6 mo" : "/yr"}
          </span>
        </div>

        {savings > 0 && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 mb-2">
            <span className="text-xs font-bold text-primary">
              Save PKR {fmt(savings)}
            </span>
          </div>
        )}

        <p className="text-sm text-muted-foreground leading-relaxed">{plan.tagline}</p>
      </div>

      {/* Per branch breakdown */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar/60 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Per branch / month</span>
          <span className="font-bold tabular-nums text-foreground">
            PKR {fmt(perBranchMonthly)}
          </span>
        </div>
        {period !== "monthly" && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Billed every</span>
            <span className="font-semibold text-foreground">{months} months</span>
          </div>
        )}
        {plan.branches > 1 && (
          <div className="flex items-center justify-between text-xs border-t border-sidebar-border pt-2 mt-1">
            <span className="text-muted-foreground">vs single branch</span>
            <span className="font-semibold text-primary text-[11px]">
              PKR {fmt(Math.round(4500 - perBranchMonthly))} cheaper/branch
            </span>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="mt-auto">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Hi! I'm interested in Pulse DMS — ${plan.name} plan.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
            plan.highlight
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
          }`}
        >
          Get Started
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const BILLING_OPTIONS: { key: BillingPeriod; label: string; badge?: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "sixMonth", label: "6 Months", badge: "Save more" },
  { key: "annual", label: "Annual", badge: "Best value" },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

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
        <div className="flex items-center gap-4">
          {/* Billing toggle inline in nav area */}
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-sidebar-border bg-card">
            {BILLING_OPTIONS.map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setBilling(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  billing === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                {badge && billing !== key && (
                  <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-primary/10 text-primary hidden sm:inline">
                    {key === "annual" ? "Best" : "More"}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Compact heading */}
      <div className="relative z-10 px-6 pt-8 pb-5 max-w-6xl mx-auto flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-1">Pricing</p>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            One price per branch.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every feature included in every plan — no card required.
          </p>
        </div>
      </div>

      {/* Pricing cards */}
      <section className="relative z-10 px-6 pb-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {PLANS.map((plan) => (
            <PlanCard key={plan.key} plan={plan} period={billing} />
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="relative z-10 px-6 pb-10 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border bg-sidebar/60">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40" />
                  {PLANS.map((p) => (
                    <th key={p.key} className="px-6 py-3 text-center text-xs font-semibold text-foreground uppercase tracking-wider">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border">
                {[
                  { label: "Monthly", getValue: (p: typeof PLANS[number]) => `PKR ${fmt(p.monthly)}` },
                  { label: "6 Months", getValue: (p: typeof PLANS[number]) => `PKR ${fmt(p.sixMonth)}` },
                  { label: "Yearly", getValue: (p: typeof PLANS[number]) => `PKR ${fmt(p.annual)}` },
                  { label: "Yearly saving", getValue: (p: typeof PLANS[number]) => `PKR ${fmt(p.monthly * 12 - p.annual)}` },
                  { label: "Per branch / mo", getValue: (p: typeof PLANS[number]) => `PKR ${fmt(Math.round(p.monthly / p.branches))}` },
                ].map(({ label, getValue }) => (
                  <tr key={label} className="hover:bg-sidebar/30 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-foreground text-sm">{label}</td>
                    {PLANS.map((p) => (
                      <td key={p.key} className={`px-6 py-3.5 text-center tabular-nums ${label === "Yearly saving" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
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

      {/* Feature manifest */}
      <section className="relative z-10 px-6 pb-10 max-w-5xl mx-auto">
        <div className="relative rounded-2xl border border-primary/20 bg-card overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="flex items-center justify-between px-6 sm:px-8 py-3 border-b border-sidebar-border/80">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              {FEATURES.length} features — every plan
            </p>
            <span className="text-xs text-muted-foreground">All tiers identical</span>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-px bg-sidebar-border/60">
            {FEATURES.map((f, i) => (
              <li
                key={f}
                className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 bg-card px-6 sm:px-8 py-4 transition-colors hover:bg-primary/[0.03]"
              >
                <span className="font-mono text-[11px] font-semibold text-primary/70 group-hover:text-primary tabular-nums tracking-wider transition-colors">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-foreground text-[14px] leading-snug">{f}</span>
                <Check className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
              </li>
            ))}
            {FEATURES.length % 2 === 1 && (
              <li aria-hidden className="hidden md:block bg-card" />
            )}
          </ul>

          <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>
      </section>

      {/* CTA */}
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
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
