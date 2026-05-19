"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap, ArrowRight, ArrowLeft, Check, Calendar,
  Building2, User, Phone, Mail, MapPin, Users, Loader2, AlertCircle,
} from "lucide-react";
import { submitOnboarding, type OnboardingPayload } from "@/app/actions/onboarding";

// ── Pricing source-of-truth (mirrors /pricing) ───────────────────────────────
const BASE_PRICES = { starter: 10000, growth: 15000, pro: 20000 } as const;
const ANNUAL_DISCOUNT = 0.20;

// Multi-branch all-Pro plans (mirrors /pricing branchTiers)
const BRANCH_TIERS: Record<number, { price: number; perBranch: number }> = {
  2: { price: 35000, perBranch: 17500 },
  3: { price: 50000, perBranch: 16667 },   // interpolated
  4: { price: 62000, perBranch: 15500 },   // interpolated
  5: { price: 75000, perBranch: 15000 },
  6: { price: 85000, perBranch: 14167 },   // interpolated
  7: { price: 95000, perBranch: 13572 },
};

const GYM_TYPES: { value: NonNullable<OnboardingPayload["gym_type"]>; label: string }[] = [
  { value: "general",       label: "General gym" },
  { value: "ladies_only",   label: "Ladies-only gym" },
  { value: "mens_only",     label: "Men's-only gym" },
  { value: "crossfit",      label: "CrossFit / functional" },
  { value: "martial_arts",  label: "Martial arts" },
  { value: "yoga",          label: "Yoga / pilates studio" },
  { value: "mixed",         label: "Mixed / multi-discipline" },
];

const HEARD_FROM: { value: NonNullable<OnboardingPayload["heard_from"]>; label: string }[] = [
  { value: "referral",  label: "Friend / referral" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp",  label: "WhatsApp" },
  { value: "google",    label: "Google search" },
  { value: "facebook",  label: "Facebook" },
  { value: "other",     label: "Other" },
];

type Step = 1 | 2 | 3;

const initialState = {
  // Step 1 — basic gym info + optional context
  owner_name: "",
  phone: "",
  email: "",
  gym_name: "",
  city: "",
  area: "",
  gym_type: "" as "" | NonNullable<OnboardingPayload["gym_type"]>,
  active_members_count: "" as string,
  preferred_start_date: "",
  heard_from: "" as "" | NonNullable<OnboardingPayload["heard_from"]>,
  // Step 2 — plan
  plan_choice: "growth" as OnboardingPayload["plan_choice"],
  billing_cycle: "monthly" as OnboardingPayload["billing_cycle"],
  branch_type: "single" as OnboardingPayload["branch_type"],
  branch_count: 1,
};

export default function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Derived: estimated monthly price ────────────────────────────────────────
  const estimate = useMemo(() => {
    let base: number = BASE_PRICES[form.plan_choice];

    // Multi-branch overrides — Pro features bundled
    if (form.branch_type === "multi" && form.branch_count >= 2) {
      const tier = BRANCH_TIERS[Math.min(form.branch_count, 7)];
      if (tier) base = tier.price;
    }

    const monthly = form.billing_cycle === "annual"
      ? Math.round(base * (1 - ANNUAL_DISCOUNT))
      : base;

    return {
      monthly,
      perBranch: form.branch_type === "multi" && form.branch_count >= 2
        ? Math.round(monthly / form.branch_count)
        : null,
      annualTotal: form.billing_cycle === "annual" ? monthly * 12 : null,
    };
  }, [form.plan_choice, form.billing_cycle, form.branch_type, form.branch_count]);

  // ── Step validation ─────────────────────────────────────────────────────────
  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (!form.owner_name.trim()) return "Your name is required";
      if (!form.phone.trim()) return "Phone is required";
      const ph = form.phone.replace(/[\s\-]/g, "");
      if (!/^(\+92|92|0)?3\d{9}$/.test(ph)) {
        return "Enter a valid Pakistani phone (e.g. 03001234567)";
      }
      if (!form.gym_name.trim()) return "Gym name is required";
      if (!form.city.trim()) return "City is required";
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        return "Enter a valid email or leave it blank";
      }
    }
    if (s === 2) {
      if (!["starter", "growth", "pro"].includes(form.plan_choice)) {
        return "Pick a plan";
      }
      if (form.branch_type === "multi") {
        if (form.branch_count < 2 || form.branch_count > 20) {
          return "Branches must be between 2 and 20";
        }
      }
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => (Math.min(3, s + 1) as Step));
  }
  function back() {
    setError(null);
    setStep((s) => (Math.max(1, s - 1) as Step));
  }

  function submit() {
    // Re-validate all steps before submit
    for (const s of [1, 2] as Step[]) {
      const err = validateStep(s);
      if (err) {
        setError(err);
        setStep(s);
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      const payload: OnboardingPayload = {
        owner_name: form.owner_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        gym_name: form.gym_name.trim(),
        city: form.city.trim(),
        area: form.area.trim() || null,
        gym_type: form.gym_type || null,
        active_members_count: form.active_members_count
          ? Number(form.active_members_count)
          : null,
        preferred_start_date: form.preferred_start_date || null,
        heard_from: form.heard_from || null,
        plan_choice: form.plan_choice,
        billing_cycle: form.billing_cycle,
        branch_type: form.branch_type,
        branch_count: form.branch_type === "single" ? 1 : form.branch_count,
      };

      const result = await submitOnboarding(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const phoneClean = form.phone.replace(/[\s\-]/g, "");
      const qs = new URLSearchParams({
        phone: phoneClean,
        name: form.owner_name.trim().slice(0, 60),
        gym: form.gym_name.trim().slice(0, 80),
      });
      router.push(`/onboarding/thank-you?${qs.toString()}`);
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Ambient glow — match /pricing */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-sidebar-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-serif text-xl tracking-tight">Pulse</span>
          </Link>
          <p className="text-xs sm:text-sm text-muted-foreground tabular-nums">
            Step <span className="text-foreground font-semibold">{step}</span> of 3
          </p>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-sidebar-border/40">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-32 sm:pb-10">
        <h1 className="text-2xl sm:text-3xl font-serif tracking-tight mb-2">
          {step === 1 && "Tell us about your gym"}
          {step === 2 && "Pick your plan"}
          {step === 3 && "Confirm your details"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
          {step === 1 && "Your dashboard will be provisioned with these details."}
          {step === 2 && "Pick what fits today. You can change later."}
          {step === 3 && "Make sure everything looks right before submitting."}
        </p>

        {step === 1 && <Step1 form={form} setForm={setForm} />}
        {step === 2 && <Step2 form={form} setForm={setForm} estimate={estimate} />}
        {step === 3 && <Step3 form={form} estimate={estimate} />}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </main>

      {/* Sticky footer nav (mobile-first) */}
      <footer className="fixed sm:sticky bottom-0 left-0 right-0 z-20 border-t border-sidebar-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 1 || isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={next}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  Submit application
                  <Check className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

// ── Reusable field bits ──────────────────────────────────────────────────────
function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-foreground/90">
        {label} {required && <span className="text-primary">*</span>}
        {hint && <span className="font-normal text-muted-foreground/80 ml-1">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
  const { icon, className, ...rest } = props;
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
      )}
      <input
        {...rest}
        className={[
          "w-full rounded-xl border border-sidebar-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60",
          "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-colors",
          icon ? "pl-9" : "",
          className ?? "",
        ].join(" ")}
      />
    </div>
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return (
    <select
      {...rest}
      className={[
        "w-full rounded-xl border border-sidebar-border bg-card px-3 py-2.5 text-sm text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-colors",
        className ?? "",
      ].join(" ")}
    />
  );
}

// ── STEP 1 ───────────────────────────────────────────────────────────────────
function Step1({
  form, setForm,
}: { form: typeof initialState; setForm: React.Dispatch<React.SetStateAction<typeof initialState>> }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Your name" required>
          <TextInput
            icon={<User className="w-4 h-4" />}
            placeholder="Muhammad Ali"
            value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            autoComplete="name"
            maxLength={100}
          />
        </Field>
        <Field label="Phone (WhatsApp)" required>
          <TextInput
            icon={<Phone className="w-4 h-4" />}
            inputMode="tel"
            placeholder="03001234567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            autoComplete="tel"
            maxLength={20}
          />
        </Field>
      </div>

      <Field label="Email" hint="optional">
        <TextInput
          icon={<Mail className="w-4 h-4" />}
          inputMode="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          autoComplete="email"
          maxLength={160}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Gym name" required>
          <TextInput
            icon={<Building2 className="w-4 h-4" />}
            placeholder="Iron Forge Gym"
            value={form.gym_name}
            onChange={(e) => setForm({ ...form, gym_name: e.target.value })}
            maxLength={100}
          />
        </Field>
        <Field label="City" required>
          <TextInput
            icon={<MapPin className="w-4 h-4" />}
            placeholder="Karachi"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            maxLength={80}
          />
        </Field>
      </div>

      <Field label="Area" hint="optional">
        <TextInput
          placeholder="DHA Phase 5, Clifton, Gulshan-e-Iqbal…"
          value={form.area}
          onChange={(e) => setForm({ ...form, area: e.target.value })}
          maxLength={120}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Gym type" hint="optional">
          <SelectInput
            value={form.gym_type}
            onChange={(e) => setForm({ ...form, gym_type: e.target.value as typeof form.gym_type })}
          >
            <option value="">Select type…</option>
            {GYM_TYPES.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Active members today" hint="rough estimate">
          <TextInput
            icon={<Users className="w-4 h-4" />}
            inputMode="numeric"
            placeholder="e.g. 120"
            value={form.active_members_count}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "").slice(0, 5);
              setForm({ ...form, active_members_count: v });
            }}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Preferred start date" hint="optional">
          <TextInput
            icon={<Calendar className="w-4 h-4" />}
            type="date"
            value={form.preferred_start_date}
            onChange={(e) => setForm({ ...form, preferred_start_date: e.target.value })}
          />
        </Field>
        <Field label="Where did you hear about Pulse?" hint="optional">
          <SelectInput
            value={form.heard_from}
            onChange={(e) => setForm({ ...form, heard_from: e.target.value as typeof form.heard_from })}
          >
            <option value="">Select…</option>
            {HEARD_FROM.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </SelectInput>
        </Field>
      </div>
    </div>
  );
}

// ── STEP 2 — plan picker ────────────────────────────────────────────────────
function Step2({
  form, setForm, estimate,
}: {
  form: typeof initialState;
  setForm: React.Dispatch<React.SetStateAction<typeof initialState>>;
  estimate: { monthly: number; perBranch: number | null; annualTotal: number | null };
}) {
  const plans = [
    {
      key: "starter" as const,
      name: "Starter",
      tagline: "For gyms ready to ditch the spreadsheet.",
      sub: "Up to 200 members. Core features only.",
    },
    {
      key: "growth" as const,
      name: "Growth",
      badge: "Most popular",
      tagline: "Full control over your gym, team, and pipeline.",
      sub: "Up to 1000 members. Adds leads + classes + reports.",
    },
    {
      key: "pro" as const,
      name: "Pro",
      tagline: "The difference between a gym and a business.",
      sub: "Up to 2000 members. Profit insights + referrals + social.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((p) => {
          const selected = form.plan_choice === p.key;
          const price = form.billing_cycle === "annual"
            ? Math.round(BASE_PRICES[p.key] * (1 - ANNUAL_DISCOUNT))
            : BASE_PRICES[p.key];
          return (
            <button
              type="button"
              key={p.key}
              onClick={() => setForm({ ...form, plan_choice: p.key })}
              className={[
                "relative text-left rounded-2xl border p-4 sm:p-5 transition-all",
                selected
                  ? "border-primary/50 bg-primary/[0.06] shadow-[0_0_40px_-15px] shadow-primary/30"
                  : "border-sidebar-border bg-card hover:border-primary/30",
              ].join(" ")}
            >
              {p.badge && (
                <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-sm">
                  {p.badge}
                </span>
              )}
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{p.name}</p>
                <div className={[
                  "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                  selected ? "border-primary bg-primary" : "border-sidebar-border",
                ].join(" ")}>
                  {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
              </div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-[11px] text-muted-foreground">PKR</span>
                <span className="text-2xl font-bold tabular-nums">{price.toLocaleString("en-PK")}</span>
                <span className="text-[11px] text-muted-foreground pb-0.5">/mo</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug mt-1">{p.sub}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center">
        <Link
          href="/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline transition-colors"
        >
          View full pricing →
        </Link>
      </div>

      {/* Billing toggle */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground/90">Billing cycle</p>
        <div className="inline-flex w-full sm:w-auto items-center gap-1 p-1 rounded-xl border border-sidebar-border bg-card">
          {(["monthly", "annual"] as const).map((b) => {
            const active = form.billing_cycle === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setForm({ ...form, billing_cycle: b })}
                className={[
                  "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {b === "monthly" ? "Monthly" : "Annual"}
                {b === "annual" && (
                  <span className={[
                    "text-[10px] px-1.5 py-0.5 rounded-md font-bold",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary",
                  ].join(" ")}>
                    Save 20%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Branches */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground/90">Branches</p>
        <div className="grid grid-cols-2 gap-3">
          {(["single", "multi"] as const).map((b) => {
            const active = form.branch_type === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => {
                  setForm({
                    ...form,
                    branch_type: b,
                    branch_count: b === "single" ? 1 : Math.max(2, form.branch_count),
                  });
                }}
                className={[
                  "rounded-xl border px-4 py-3 text-sm font-semibold transition-all flex items-center justify-between gap-2",
                  active
                    ? "border-primary/50 bg-primary/[0.06] text-foreground"
                    : "border-sidebar-border bg-card text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <span>{b === "single" ? "Single branch" : "Multi-branch"}</span>
                {active && <Check className="w-4 h-4 text-primary" />}
              </button>
            );
          })}
        </div>
        {form.branch_type === "multi" && (
          <div className="pt-2">
            <Field label="How many branches?" hint="2–20">
              <TextInput
                inputMode="numeric"
                placeholder="2"
                value={String(form.branch_count)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "").slice(0, 2);
                  const n = Number(v || "0");
                  setForm({ ...form, branch_count: Math.min(20, Math.max(2, n || 2)) });
                }}
              />
            </Field>
          </div>
        )}
      </div>

      {/* Live estimate */}
      <div className="rounded-2xl border border-primary/30 bg-primary/[0.05] p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-1">Estimated cost</p>
        <div className="flex items-end gap-1.5">
          <span className="text-xs text-muted-foreground">PKR</span>
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {estimate.monthly.toLocaleString("en-PK")}
          </span>
          <span className="text-xs text-muted-foreground pb-1">/month</span>
        </div>
        {estimate.perBranch != null && (
          <p className="text-xs text-muted-foreground mt-1">
            PKR {estimate.perBranch.toLocaleString("en-PK")} per branch · {form.branch_count} branches
          </p>
        )}
        {estimate.annualTotal != null && (
          <p className="text-xs text-muted-foreground mt-1">
            Billed annually: PKR {estimate.annualTotal.toLocaleString("en-PK")}/year
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/80 mt-2">
          Final pricing confirmed during onboarding. No card needed to apply.
        </p>
      </div>
    </div>
  );
}

// ── STEP 3 — confirm ────────────────────────────────────────────────────────
function Step3({
  form, estimate,
}: {
  form: typeof initialState;
  estimate: { monthly: number; perBranch: number | null; annualTotal: number | null };
}) {
  const planLabel: Record<string, string> = {
    starter: "Starter",
    growth: "Growth",
    pro: "Pro",
  };

  const rows: { label: string; value: string }[] = [
    { label: "Gym",       value: `${form.gym_name}${form.city ? ` · ${form.city}` : ""}${form.area ? ` (${form.area})` : ""}` },
    { label: "Owner",     value: `${form.owner_name} · ${form.phone}${form.email ? ` · ${form.email}` : ""}` },
    ...(form.gym_type ? [{ label: "Type", value: GYM_TYPES.find((g) => g.value === form.gym_type)?.label ?? form.gym_type }] : []),
    ...(form.active_members_count ? [{ label: "Active members today", value: form.active_members_count }] : []),
    ...(form.preferred_start_date ? [{ label: "Preferred start", value: form.preferred_start_date }] : []),
    { label: "Plan",      value: `${planLabel[form.plan_choice]} · ${form.billing_cycle === "annual" ? "Annual" : "Monthly"}` },
    { label: "Branches",  value: form.branch_type === "single" ? "Single branch" : `${form.branch_count} branches` },
    { label: "Estimated", value: `PKR ${estimate.monthly.toLocaleString("en-PK")}/month` },
    ...(form.heard_from ? [{ label: "Heard from", value: HEARD_FROM.find((h) => h.value === form.heard_from)?.label ?? form.heard_from }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-sidebar-border bg-card/50">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your application</p>
        </div>
        <ul className="divide-y divide-sidebar-border">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-3 px-5 py-3">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">{r.label}</span>
                <span className="text-sm text-foreground font-medium sm:text-right break-words">{r.value}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed px-1">
        By submitting, you confirm this is your gym&apos;s information. We&apos;ll set up your admin
        dashboard and share your login credentials on WhatsApp shortly.
      </p>
    </div>
  );
}
