"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, Zap, Users, Bell, BarChart3, TrendingUp,
  CalendarDays, MessageSquare, FileText, ArrowRight, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BASE_PRICES = { starter: 10000, growth: 15000, pro: 20000 };
const ANNUAL_DISCOUNT = 0.20;

const branchTiers = [
  {
    name: "Double Branch",
    branches: 2,
    price: 35000,
    perBranch: 17500,
    savings: 5000,
    badge: null,
    highlight: false,
    tagline: "Two locations, one system.",
  },
  {
    name: "Branch Group",
    branches: 5,
    price: 75000,
    perBranch: 15000,
    savings: 25000,
    badge: "Most Popular",
    highlight: true,
    tagline: "The sweet spot for growing chains.",
  },
  {
    name: "Branch Chain",
    branches: 7,
    price: 95000,
    perBranch: 13572,
    savings: 45000,
    badge: "Best Value",
    highlight: false,
    tagline: "Maximum scale. Lowest cost per branch.",
  },
];

const tiers = [
  {
    key: "starter" as const,
    name: "Starter",
    tagline: "For gyms ready to ditch the spreadsheet.",
    highlight: false,
    cta: "Get Started",
    href: "/login",
    bullets: [
      "Up to 200 active members",
      "Live revenue snapshot, always on your dashboard",
      "WhatsApp dues reminders in one tap",
      "Expense tracking — know what's left after the bills",
      "Expired members flagged instantly",
      "Full payment history per member",
    ],
  },
  {
    key: "growth" as const,
    name: "Growth",
    tagline: "Full control over your gym, your team, and your pipeline.",
    badge: "Most Popular",
    highlight: true,
    cta: "Get Started",
    href: "/login",
    bullets: [
      "Up to 1000 active members",
      "Everything in Starter",
      "Lead pipeline — every walk-in tracked, followed up, and converted",
      "Class scheduling with capacity limits and attendance tracking",
      "PDF & CSV export of compliance-scoped reports",
      "Priority support",
    ],
  },
  {
    key: "pro" as const,
    name: "Pro",
    tagline: "The difference between a gym and a business.",
    highlight: false,
    cta: "Talk to Sales",
    href: `https://wa.me/923193454321?text=${encodeURIComponent("Hi, I'm interested in the Pro plan for Pulse GMS. How do I get started?")}`,
    bullets: [
      "Everything in Growth",
      "Up to 2000 active members",
      "Make more money with Profit Insights",
      "Track marketing ROI with Social Media Manager",
      "Grow memberships with Referral Engine",
      "Transfer clients between trainers in one click",
      "Advanced Reports — revenue trends, trainer performance, member retention",
    ],
  },
];

const painPoints = [
  {
    icon: Bell,
    heading: "You find out a member expired when they're already at the front desk.",
    fix: "Pulse flags every expiry the moment it happens. You always know who owes.",
  },
  {
    icon: MessageSquare,
    heading: "Collecting dues means manually messaging 30 people on WhatsApp.",
    fix: "One click sends a personalized WhatsApp reminder to every overdue member.",
  },
  {
    icon: Users,
    heading: "Your trainers can see every member's details — including clients that aren't theirs.",
    fix: "Role-based access. Trainers see their clients only. Staff sees what you allow.",
  },
];

const features = [
  {
    icon: Bell,
    title: "Dues that collect themselves",
    body: "Overdue members get a personalized WhatsApp message in one click. No manual copy-paste. No forgetting. No awkward conversations.",
  },
  {
    icon: Users,
    title: "Access that fits your team",
    body: "Trainers see their clients only. Front desk sees check-ins. Staff sees what you decide. Nobody accesses what they have no business seeing.",
  },
  {
    icon: TrendingUp,
    title: "Your numbers, at a glance",
    body: "Revenue, active members, expiring plans, top earners — your dashboard gives you the full picture the moment you log in.",
  },
  {
    icon: CalendarDays,
    title: "Classes that fill up, not get lost",
    body: "Schedule classes, set capacity, track attendance. Know which sessions are popular and which to drop before you waste more floor time.",
  },
  {
    icon: FileText,
    title: "Leads that don't fall through the cracks",
    body: "Every walk-in is a lead. Log them, assign follow-up, track conversion. Most gyms lose 40% of their pipeline by not having a system.",
  },
  {
    icon: BarChart3,
    title: "Reports built for your business",
    body: "Compliance reports, revenue summaries, member breakdowns — export to PDF or CSV whenever you need them.",
  },
];

const faqs = [
  {
    q: "Can I import my existing member data?",
    a: "Pro tier includes dedicated data migration. On Starter and Growth you can bulk-import members via CSV.",
  },
  {
    q: "What happens if I go over the member limit on my plan?",
    a: "We'll notify you and give you a grace period before prompting an upgrade. No sudden lockouts.",
  },
  {
    q: "Can I change plans later?",
    a: "Upgrade or downgrade any time. Changes take effect on your next billing cycle.",
  },
  {
    q: "Is my data safe?",
    a: "All data is encrypted at rest and in transit. Role-based access controls and a full audit log are built in.",
  },
  {
    q: "Do you support multiple locations?",
    a: "Multi-location support is on the roadmap. Reach out to sales if this is a requirement — we can discuss options.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [branchAnnual, setBranchAnnual] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const router = useRouter();

  async function handleDemoLogin() {
    setDemoLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: "demo@musabkhan.me",
      password: "PulseDemo2024!",
    });
    if (error) {
      setDemoLoading(false);
      return;
    }
    router.push("/dashboard");
  }

  function displayPrice(base: number) {
    const amount = annual ? Math.round(base * (1 - ANNUAL_DISCOUNT)) : base;
    return amount.toLocaleString("en-PK");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <Link href="/" className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-serif text-xl text-foreground tracking-tight">Pulse</span>
          </div>
          <span className="text-[10px] text-primary/60 uppercase tracking-[0.2em] font-semibold ml-10 -mt-0.5">Pulse of your gym</span>
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDemoLogin}
            disabled={demoLoading}
            className="flex items-center gap-1.5 px-3 py-2 sm:px-4 rounded-xl border border-primary/30 bg-primary/5 text-sm font-semibold text-primary hover:bg-primary/10 transition-all disabled:opacity-60"
          >
            {demoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Zap className="w-3.5 h-3.5 shrink-0" />}
            <span className="hidden sm:inline">Try </span>Demo
          </button>
          <Link href="/login" className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign in
          </Link>
        </div>
      </nav>

      {/* Compact hero */}
      <section className="relative z-10 flex flex-col items-center gap-6 text-center px-6 pt-10 pb-8 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">Rolling out in Pakistan</span>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-sidebar-border bg-card">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              !annual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              annual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${annual ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"}`}>
              Save 20%
            </span>
          </button>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-7 flex flex-col gap-6 ${
                tier.highlight
                  ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_60px_-10px] shadow-primary/20"
                  : "border-sidebar-border bg-card"
              }`}
            >
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider shadow-lg">
                    {tier.badge}
                  </span>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {tier.name}
                </p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-sm text-muted-foreground">PKR</span>
                  <span className="text-4xl font-bold text-foreground tabular-nums">
                    {displayPrice(BASE_PRICES[tier.key])}
                  </span>
                  <span className="text-sm text-muted-foreground pb-1">/mo</span>
                </div>
                {annual && (
                  <p className="text-xs text-primary mb-2">
                    Billed as PKR {(Math.round(BASE_PRICES[tier.key] * (1 - ANNUAL_DISCOUNT)) * 12).toLocaleString("en-PK")}/year
                  </p>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{tier.tagline}</p>
              </div>

              <Link
                href={tier.href}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  tier.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                    : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
                }`}
              >
                {tier.cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <ul className="space-y-3">
                {tier.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm">
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${tier.highlight ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-muted-foreground leading-relaxed">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          Prices in PKR.
        </p>
      </section>

      {/* Multi-branch pricing */}
      <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-4">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">Running multiple locations?</span>
          </div>
          <h2 className="text-3xl font-serif font-normal tracking-tight mb-2">Multi-Branch Plans</h2>
          <p className="text-muted-foreground text-sm">All Pro features included. The more branches, the less you pay per location.</p>
          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-sidebar-border bg-card mt-4">
            <button
              onClick={() => setBranchAnnual(false)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${!branchAnnual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBranchAnnual(true)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${branchAnnual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Annual
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${branchAnnual ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                Save 20%
              </span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {branchTiers.map((tier) => {
            const monthly = branchAnnual ? Math.round(tier.price * (1 - ANNUAL_DISCOUNT)) : tier.price;
            const perBranch = branchAnnual ? Math.round(tier.perBranch * (1 - ANNUAL_DISCOUNT)) : tier.perBranch;
            return (
              <div
                key={tier.branches}
                className={`relative rounded-2xl border p-7 flex flex-col gap-6 ${
                  tier.highlight
                    ? "border-primary/40 bg-primary/[0.04] shadow-[0_0_60px_-10px] shadow-primary/20"
                    : "border-sidebar-border bg-card"
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider shadow-lg">
                      {tier.badge}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                    {tier.name}
                  </p>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-sm text-muted-foreground">PKR</span>
                    <span className="text-4xl font-bold text-foreground tabular-nums">
                      {monthly.toLocaleString("en-PK")}
                    </span>
                    <span className="text-sm text-muted-foreground pb-1">/mo</span>
                  </div>
                  <p className="text-xs text-primary font-medium mb-1">
                    PKR {perBranch.toLocaleString("en-PK")}/branch · Save PKR {tier.savings.toLocaleString("en-PK")} vs individual plans
                  </p>
                  {branchAnnual && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Billed as PKR {(monthly * 12).toLocaleString("en-PK")}/year
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">{tier.tagline}</p>
                </div>
                <a
                  href={`https://wa.me/923193454321?text=${encodeURIComponent(`Hi, I'm interested in the ${tier.name} plan for Pulse GMS. How do I get started?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    tier.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                      : "border border-sidebar-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
                  }`}
                >
                  Talk to Sales <ArrowRight className="w-3.5 h-3.5" />
                </a>
                <ul className="space-y-3">
                  {[
                    `${tier.branches} branches under one account`,
                    "Everything in Pro — all features included",
                    "Up to 2000 active members per branch",
                    "Centralised dashboard across all locations",
                    "Dedicated onboarding support",
                  ].map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5 text-sm">
                      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${tier.highlight ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-muted-foreground leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          Need more than 7 branches? <a href={`https://wa.me/923193454321?text=${encodeURIComponent("Hi, I need a custom multi-branch plan for Pulse GMS.")}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground transition-colors">Contact us for a custom plan.</a>
        </p>
      </section>

      {/* Pain points */}
      <section className="relative z-10 px-6 py-12 max-w-6xl mx-auto">
        <p className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-8">
          Sound familiar?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {painPoints.map(({ icon: Icon, heading, fix }) => (
            <div key={heading} className="rounded-2xl border border-sidebar-border bg-card p-5 flex flex-col gap-4">
              <div className="w-9 h-9 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{heading}</p>
              <div className="mt-auto pt-3 border-t border-sidebar-border">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground leading-relaxed">{fix}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature highlights */}
      <section className="relative z-10 px-6 py-12 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-serif font-normal tracking-tight mb-3">
            Everything your gym needs. Nothing it doesn&apos;t.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Built around how gyms actually operate — not how a startup imagines they do.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-sidebar-border bg-card p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 px-6 py-12 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-serif font-normal tracking-tight mb-2">Common questions</h2>
          <p className="text-muted-foreground">Anything else — reach out directly.</p>
        </div>
        <div className="space-y-3">
          {faqs.map(({ q, a }) => (
            <div key={q} className="rounded-2xl border border-sidebar-border bg-card px-6 py-5">
              <p className="font-semibold text-foreground mb-2">{q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 px-6 py-16 max-w-4xl mx-auto text-center">
        <div className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-12">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-4xl font-serif font-normal tracking-tight mb-4">
            Your gym is bleeding money<br />every month you wait.
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
            Expired members slipping through. Dues going uncollected. Walk-ins never followed up on.
            Most gyms fix this in their first week on Pulse.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/onboarding"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/20 text-sm"
            >
              Apply for Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={`https://wa.me/923193454321?text=${encodeURIComponent("Hi, I'm interested in Pulse GMS. Can you help me choose the right plan?")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-sidebar-border hover:border-primary/40 text-foreground font-semibold transition-colors text-sm"
            >
              Talk to sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-sidebar-border px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary" />
            </div>
            <span className="font-serif text-base text-foreground">Pulse</span>
          </Link>
          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} Pulse GMS. Built for gyms that mean business.
          </p>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
