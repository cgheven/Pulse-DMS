"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Zap,
  ArrowRight,
  Package,
  ShoppingCart,
  Bike,
  Users,
  LineChart,
  GitBranch,
  CheckCircle2,
  ShieldCheck,
  Gauge,
  Smartphone,
  CreditCard,
  Clock,
} from "lucide-react";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { submitDemoRequest } from "@/app/actions/demo-request";

// ── Content data ──────────────────────────────────────────────────────────────

const AUDIENCE = [
  {
    icon: Package,
    title: "Retail Shop Owners",
    description: "Run one shop with full visibility into stock, sales, and daily profit — no more manual registers.",
  },
  {
    icon: GitBranch,
    title: "Multi-Branch Dealers",
    description: "Manage several branches from a single dashboard, switch between them instantly, keep every branch's numbers separate and accurate.",
  },
  {
    icon: Bike,
    title: "Distributors with Riders",
    description: "Equip delivery riders with their own portal to take orders, capture GPS location, and collect cash or cheques on the spot.",
  },
  {
    icon: Users,
    title: "Sales & Field Teams",
    description: "Give sales reps a CRM to track leads, follow-ups, and earnings — without another spreadsheet.",
  },
] as const;

const MODULES = [
  {
    id: "inventory",
    icon: Package,
    name: "Inventory & Stock",
    tagline: "Always know what's on the shelf.",
    points: [
      "Real-time stock levels per branch",
      "Low-stock alerts before you run out",
      "Batch & cost tracking (FIFO)",
    ],
  },
  {
    id: "sales",
    icon: ShoppingCart,
    name: "Sales & Billing",
    tagline: "Bill faster, track every rupee.",
    points: [
      "Fast point-of-sale invoicing",
      "Cash & credit payment tracking",
      "Full sale edit history for accountability",
    ],
  },
  {
    id: "riders",
    icon: Bike,
    name: "Rider Management",
    tagline: "Your delivery fleet, organized.",
    points: [
      "Standalone order-taking app for riders",
      "GPS location capture on every order",
      "Cash & cheque collection tracking",
    ],
  },
  {
    id: "sales-team",
    icon: Users,
    name: "Sales Rep CRM",
    tagline: "Turn leads into customers.",
    points: [
      "Lead pipeline with follow-up reminders",
      "Daily call & WhatsApp activity tracking",
      "Rep goals, earnings, and performance",
    ],
  },
  {
    id: "reports",
    icon: LineChart,
    name: "P&L & Reports",
    tagline: "Know your numbers, instantly.",
    points: [
      "Live Profit & Loss reports",
      "Supplier ledger & outstanding payables",
      "Expense tracking by category",
    ],
  },
] as const;

const BENEFITS = [
  {
    icon: Gauge,
    title: "Built for speed",
    description: "Pages load with your real data from the first paint — no waiting around while a shop full of customers watches.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    description: "Every shop's data is fully isolated — your branches, your data, never mixed with anyone else's.",
  },
  {
    icon: Smartphone,
    title: "Works everywhere",
    description: "A clean, mobile-friendly experience for owners at the desk and riders or reps out in the field.",
  },
] as const;

// ── Demo request form (reused pattern from /pricing) ──────────────────────────

const INPUT_CLS =
  "w-full h-11 rounded-lg border border-sidebar-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:ring-2 focus:ring-primary/30 focus:border-primary";

function DemoForm() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ contact_name: "", shop_name: "", city: "", phone: "" });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitDemoRequest(form);
      if (result.error) setError(result.error);
      else setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-sidebar-border bg-card p-8 text-center space-y-3">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-primary" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-foreground">Request received!</h3>
        <p className="text-sm text-muted-foreground">We&apos;ll reach out within a few hours to get your shop set up.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-sidebar-border bg-card p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Your Name <span className="text-red-500">*</span></label>
          <input required type="text" placeholder="e.g. Ali Raza" value={form.contact_name} onChange={set("contact_name")} className={INPUT_CLS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Shop Name <span className="text-red-500">*</span></label>
          <input required type="text" placeholder="e.g. Raza Electronics" value={form.shop_name} onChange={set("shop_name")} className={INPUT_CLS} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">City</label>
          <input type="text" placeholder="e.g. Lahore, Karachi" value={form.city} onChange={set("city")} className={INPUT_CLS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Phone <span className="text-red-500">*</span></label>
          <input required type="tel" placeholder="e.g. 0300-1234567" value={form.phone} onChange={set("phone")} className={INPUT_CLS} />
        </div>
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Sending…" : "Request a Demo →"}
      </button>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      <SiteNav />

      {/* Hero */}
      <section className="relative z-10 px-6 pt-14 pb-20 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-sidebar-border bg-card">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">Inventory Management Simplified</span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-[1.05] mt-6">
              <span className="text-foreground">Stock. Sell. </span>
              <span className="text-primary">Grow.</span>
            </h1>

            <p className="text-lg text-muted-foreground mt-5 max-w-lg leading-relaxed">
              Pulse is inventory and sales management software for retail shops and
              distributors. Track stock across every branch, record sales and payments,
              manage delivery riders, and see real-time profit and loss — all from one
              dashboard, whether you run one branch or twenty.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-8">
              <Link
                href="/register"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#demo"
                className="px-6 py-3 rounded-xl border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground font-semibold text-sm transition-all"
              >
                View Demo
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-7">
              {[
                { icon: CreditCard, label: "No Credit Card" },
                { icon: Clock, label: "Setup in Minutes" },
                { icon: ShieldCheck, label: "Cancel Anytime" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="w-3.5 h-3.5 text-primary/70" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: product preview */}
          <DashboardPreview />
        </div>
      </section>

      {/* Who it's for */}
      <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-2">Who it's for</p>
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
            Built for the way local businesses actually work.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {AUDIENCE.map((a) => (
            <div key={a.title} className="rounded-2xl border border-sidebar-border bg-card p-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <a.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1.5">{a.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{a.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-2">Everything included</p>
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
            One system, every part of your business.
          </h2>
        </div>
        <div className="space-y-4">
          {MODULES.map((m, i) => (
            <div
              key={m.id}
              id={m.id}
              className="scroll-mt-24 rounded-2xl border border-sidebar-border bg-card p-6 sm:p-8 flex flex-col sm:flex-row items-start gap-6"
            >
              <div className="flex items-center gap-4 sm:w-64 shrink-0">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <m.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <span className="font-mono text-[10px] font-semibold text-primary/60 tracking-wider">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-base font-bold text-foreground leading-tight">{m.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.tagline}</p>
                </div>
              </div>
              <ul className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {m.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary/60 shrink-0 mt-0.5" />
                    <span className="leading-snug">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-2">Why Pulse</p>
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
            Software that keeps up with your business.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {BENEFITS.map((b) => (
            <div key={b.title} className="text-center px-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <b.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1.5">{b.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA / Demo request */}
      <section id="demo" className="relative z-10 px-6 pb-16 max-w-3xl mx-auto scroll-mt-24">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black text-foreground tracking-tight">Ready to see it in action?</h2>
          <p className="text-sm text-muted-foreground mt-1.5">Tell us a bit about your shop and we&apos;ll get you set up.</p>
        </div>
        <DemoForm />
      </section>

      <SiteFooter />
    </div>
  );
}
