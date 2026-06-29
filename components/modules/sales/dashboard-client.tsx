"use client";

import Link from "next/link";
import {
  Phone, MessageCircle, CalendarCheck, Trophy,
  ChevronRight, Zap, DollarSign, AlertTriangle,
} from "lucide-react";
import type { SalesRepStats, Lead, LeadStatus, MonthlyEarnings } from "@/app/actions/sales-rep";

// ── Pipeline config ───────────────────────────────────────────────────────────

const PIPELINE: { key: LeadStatus; label: string; emoji: string; color: string; bg: string }[] = [
  { key: "new",              label: "New",          emoji: "🟢", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { key: "contacted",        label: "Contacted",    emoji: "📞", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  { key: "demo_given",       label: "Demo",         emoji: "🖥",  color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20" },
  { key: "follow_up",        label: "Follow-up",    emoji: "💬", color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  { key: "negotiating",      label: "Negotiating",  emoji: "🤝", color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
  { key: "payment_pending",  label: "Pending",      emoji: "⏳", color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20" },
  { key: "payment_received", label: "Received",     emoji: "💰", color: "text-green-400",   bg: "bg-green-500/10 border-green-500/20" },
  { key: "onboarding",       label: "Onboarding",   emoji: "🚀", color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20" },
  { key: "active",           label: "Clients",      emoji: "✅", color: "text-teal-400",    bg: "bg-teal-500/10 border-teal-500/20" },
  { key: "lost",             label: "Lost",         emoji: "❌", color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
];

// ── Compact metrics strip — replaces 4 large stat cards ───────────────────────

function MetricsStrip({ s, followupsCount }: { s: SalesRepStats; followupsCount: number }) {
  const items = [
    { icon: <Phone size={11} className="text-blue-400" />, label: "Calls today", value: s.calls_today, sub: `${s.calls_week} this week`, color: "text-blue-400" },
    { icon: <MessageCircle size={11} className="text-[#25D366]" />, label: "WhatsApp", value: s.whatsapp_today, sub: `${s.whatsapp_week} this week`, color: "text-[#25D366]" },
    { icon: <CalendarCheck size={11} className="text-amber-400" />, label: "Follow-ups", value: followupsCount, sub: "due today", color: followupsCount > 0 ? "text-amber-400" : "text-foreground" },
    { icon: <Trophy size={11} className="text-teal-400" />, label: "Won", value: s.won_this_month, sub: "this month", color: "text-teal-400" },
    { icon: <Zap size={11} className="text-primary" />, label: "Total leads", value: s.total_leads, sub: `${s.active_leads} active`, color: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-5 divide-x divide-sidebar-border rounded-xl border border-sidebar-border bg-sidebar overflow-hidden">
      {items.map(({ icon, label, value, sub, color }) => (
        <div key={label} className="flex flex-col items-center gap-1 px-3 py-4">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
          </div>
          <p className={`text-3xl font-black leading-none tabular-nums ${color}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground/50">{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Follow-up alert ───────────────────────────────────────────────────────────

function FollowupAlert({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={12} className="text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-amber-400">
            {leads.length} follow-up{leads.length !== 1 ? "s" : ""} due today
          </span>
        </div>
        <Link href="/sales/followups" className="text-[10px] text-amber-400/60 hover:text-amber-400 transition-colors flex items-center gap-0.5">
          See all <ChevronRight size={10} />
        </Link>
      </div>
      <div className="space-y-1.5">
        {leads.slice(0, 3).map(lead => {
          const safe = lead.whatsapp_number?.replace(/[^0-9+\-() ]/g, "") ?? null;
          const waUrl = safe
            ? `https://wa.me/${safe.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(`Assalam-o-Alaikum! ${lead.contact_name ? lead.contact_name + "," : ""} aaj follow-up ka din hai.`)}`
            : null;
          return (
            <div key={lead.id} className="flex items-center gap-2.5 rounded-lg bg-amber-500/8 border border-amber-500/12 px-3 py-1.5">
              <Link href={`/sales/leads/${lead.id}`} className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{lead.business_name}</p>
                {lead.contact_name && <p className="text-[10px] text-muted-foreground">{lead.contact_name}</p>}
              </Link>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-[#25D366] text-white text-[10px] font-bold hover:bg-[#1ebe5d] transition-colors"
                >
                  <MessageCircle size={10} /> WA
                </a>
              )}
              <Link href={`/sales/leads/${lead.id}`} className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <ChevronRight size={12} />
              </Link>
            </div>
          );
        })}
        {leads.length > 3 && (
          <Link href="/sales/followups" className="block text-center text-[10px] text-amber-400/60 hover:text-amber-400 py-0.5 transition-colors">
            +{leads.length - 3} more →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Earnings card — slim, no nested sub-cards ─────────────────────────────────

function EarningsCard({ earnings }: { earnings: MonthlyEarnings }) {
  const { goals, deals_closed, revenue_this_month, commission_earned, monthly_deals, annual_deals, month_label } = earnings;
  const hasGoals =
    goals.monthly_deal_target > 0 || goals.monthly_revenue_target > 0 ||
    goals.monthly_commission_pct > 0 || goals.annual_commission_pct > 0;

  const dealPct = goals.monthly_deal_target > 0
    ? Math.min(100, Math.round((deals_closed / goals.monthly_deal_target) * 100))
    : null;
  const revPct = goals.monthly_revenue_target > 0
    ? Math.min(100, Math.round((revenue_this_month / goals.monthly_revenue_target) * 100))
    : null;

  function pkr(n: number) {
    if (n >= 1_000_000) return `PKR ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `PKR ${Math.round(n / 1_000)}K`;
    return `PKR ${n.toLocaleString()}`;
  }

  if (!hasGoals) {
    return (
      <div className="rounded-xl border border-sidebar-border bg-sidebar px-4 py-3 flex items-center gap-2.5">
        <DollarSign size={12} className="text-muted-foreground/30 shrink-0" />
        <p className="text-xs text-muted-foreground/60">No commission goals set — contact admin to configure rates and targets.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <DollarSign size={12} className="text-muted-foreground/50 shrink-0" />
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">{month_label}</span>
        {/* Rate badges with deal counts */}
        <div className="flex items-center gap-1.5">
          {goals.monthly_commission_pct > 0 && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md">
              M {goals.monthly_commission_pct}% · {monthly_deals} deal{monthly_deals !== 1 ? "s" : ""}
            </span>
          )}
          {goals.annual_commission_pct > 0 && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md">
              A {goals.annual_commission_pct}% · {annual_deals} deal{annual_deals !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {/* Commission earned */}
        <div className="text-right pl-2 border-l border-sidebar-border ml-1">
          <span className="text-base font-black text-foreground tabular-nums">{pkr(commission_earned)}</span>
          <span className="text-[10px] text-muted-foreground ml-1">earned</span>
        </div>
      </div>

      {/* Progress bars */}
      {(dealPct !== null || revPct !== null) && (
        <div className="space-y-2">
          {dealPct !== null && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Deal target</span>
                <span className="tabular-nums">
                  <span className={dealPct >= 100 ? "text-green-400 font-bold" : "text-foreground font-semibold"}>{deals_closed}</span>
                  {" / "}{goals.monthly_deal_target} deals · <span className={dealPct >= 100 ? "text-green-400 font-bold" : "font-semibold"}>{dealPct}%</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-sidebar-border overflow-hidden">
                <div className={`h-full rounded-full transition-all ${dealPct >= 100 ? "bg-green-400" : "bg-primary"}`} style={{ width: `${dealPct}%` }} />
              </div>
            </div>
          )}
          {revPct !== null && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Revenue target</span>
                <span className="tabular-nums">
                  <span className={revPct >= 100 ? "text-green-400 font-bold" : "text-foreground font-semibold"}>{pkr(revenue_this_month)}</span>
                  {" / "}{pkr(goals.monthly_revenue_target)} · <span className={revPct >= 100 ? "text-green-400 font-bold" : "font-semibold"}>{revPct}%</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-sidebar-border overflow-hidden">
                <div className={`h-full rounded-full transition-all ${revPct >= 100 ? "bg-green-400" : "bg-gradient-to-r from-amber-400 to-green-400"}`} style={{ width: `${revPct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pipeline strip — single horizontal scrollable row ────────────────────────

function PipelineStrip({ byStage }: { byStage: Record<string, number> }) {
  const total = Object.values(byStage).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pipeline</span>
        <Link href="/sales/leads" className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5">
          View all <ChevronRight size={11} />
        </Link>
      </div>

      {/* Proportional bar */}
      {total > 0 && (
        <div className="flex h-1 rounded-full overflow-hidden mb-3 bg-sidebar-border gap-px">
          {PIPELINE.filter(s => (byStage[s.key] ?? 0) > 0).map(s => (
            <div
              key={s.key}
              title={`${s.label}: ${byStage[s.key] ?? 0}`}
              style={{ width: `${((byStage[s.key] ?? 0) / total) * 100}%` }}
              className={`h-full ${s.bg.split(" ")[0].replace("/10", "")} transition-all`}
            />
          ))}
        </div>
      )}

      {/* Stage pills — single scrollable row instead of 2-row grid */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {PIPELINE.map(({ key, label, emoji, color, bg }) => {
          const count = byStage[key] ?? 0;
          return (
            <Link href={`/sales/leads?status=${key}`} key={key}
              className={`flex-shrink-0 flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2.5 min-w-[60px] hover:scale-105 transition-transform ${bg} ${count === 0 ? "opacity-30" : ""}`}
            >
              <span className="text-sm leading-none">{emoji}</span>
              <span className={`text-base font-black leading-none tabular-nums mt-0.5 ${color}`}>{count}</span>
              <span className={`text-[9px] font-semibold text-center leading-tight mt-0.5 ${color} opacity-70 whitespace-nowrap`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Win rate — slim single-line bar ──────────────────────────────────────────

function WinRateBar({ won, lost }: { won: number; lost: number }) {
  const total = won + lost;
  if (total === 0) return null;
  const pct = Math.round((won / total) * 100);
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar px-4 py-3 flex items-center gap-3">
      <Zap size={12} className="text-primary shrink-0" />
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Win Rate</span>
      <div className="flex-1 h-1.5 rounded-full bg-sidebar-border overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-teal-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-black text-primary tabular-nums shrink-0">{pct}%</span>
      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{won} won · {lost} lost</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SalesDashboardClient({
  stats,
  todayFollowups,
  earnings,
}: {
  stats: SalesRepStats | null;
  todayFollowups: Lead[];
  earnings: MonthlyEarnings | null;
}) {
  const s: SalesRepStats = stats ?? {
    calls_today: 0, calls_week: 0,
    whatsapp_today: 0, whatsapp_week: 0,
    followups_today: 0,
    total_leads: 0, active_leads: 0,
    won_this_month: 0, lost_this_month: 0,
    pipeline_by_stage: {},
  };

  return (
    <div className="space-y-3.5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-foreground">Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Your sales performance at a glance</p>
      </div>

      {/* Follow-up alert — only shown when there are pending follow-ups */}
      <FollowupAlert leads={todayFollowups} />

      {/* Compact 5-column metrics strip */}
      <MetricsStrip s={s} followupsCount={todayFollowups.length} />

      {/* Earnings — slim card, only shown when enrolled in goals */}
      {earnings && <EarningsCard earnings={earnings} />}

      {/* Pipeline — single horizontal scrollable row */}
      <PipelineStrip byStage={s.pipeline_by_stage} />

      {/* Win rate — only shown when there is closed-deal data */}
      <WinRateBar won={s.won_this_month} lost={s.lost_this_month} />
    </div>
  );
}
