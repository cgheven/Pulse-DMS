"use client";

import Link from "next/link";
import {
  Phone, MessageCircle, CalendarCheck, Trophy, XCircle,
  TrendingUp, Target, AlertTriangle, ChevronRight,
  Plus, Zap,
} from "lucide-react";
import type { SalesRepStats, Lead, LeadStatus } from "@/app/actions/sales-rep";

// ── Pipeline config ───────────────────────────────────────────────────────────

const PIPELINE: { key: LeadStatus; label: string; emoji: string; color: string; bg: string }[] = [
  { key: "new",              label: "New",             emoji: "🟢", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { key: "contacted",        label: "Contacted",       emoji: "📞", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  { key: "demo_given",       label: "Demo",            emoji: "🖥",  color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20" },
  { key: "follow_up",        label: "Follow-up",       emoji: "💬", color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  { key: "negotiating",      label: "Negotiating",     emoji: "🤝", color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
  { key: "payment_pending",  label: "Pymt. Pending",   emoji: "⏳", color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20" },
  { key: "payment_received", label: "Pymt. Received",  emoji: "💰", color: "text-green-400",   bg: "bg-green-500/10 border-green-500/20" },
  { key: "onboarding",       label: "Onboarding",      emoji: "🚀", color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20" },
  { key: "active",           label: "Clients",         emoji: "✅", color: "text-teal-400",    bg: "bg-teal-500/10 border-teal-500/20" },
  { key: "lost",             label: "Lost",            emoji: "❌", color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
];

// ── Small stat card ───────────────────────────────────────────────────────────

function StatCard({
  icon, label, today, week, todayColor = "text-foreground", border = "border-sidebar-border", bg = "bg-sidebar",
}: {
  icon: React.ReactNode; label: string; today: number; week: number;
  todayColor?: string; border?: string; bg?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${border} ${bg}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-4xl font-black leading-none ${todayColor}`}>{today}</p>
      <p className="text-xs text-muted-foreground mt-1.5">
        <span className="font-semibold text-foreground">{week}</span> this week
      </p>
    </div>
  );
}

// ── Follow-up alert ───────────────────────────────────────────────────────────

function FollowupAlert({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <AlertTriangle size={13} className="text-amber-400" />
          </div>
          <span className="text-sm font-bold text-amber-400">
            {leads.length} follow-up{leads.length !== 1 ? "s" : ""} due today
          </span>
        </div>
        <Link href="/sales/followups" className="text-xs text-amber-400/70 hover:text-amber-400 transition-colors flex items-center gap-1">
          See all <ChevronRight size={11} />
        </Link>
      </div>
      <div className="space-y-1.5">
        {leads.slice(0, 4).map(lead => {
          const safe = lead.whatsapp_number?.replace(/[^0-9+\-() ]/g, "") ?? null;
          const waUrl = safe
            ? `https://wa.me/${safe.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(`Assalam-o-Alaikum! ${lead.contact_name ? lead.contact_name + "," : ""} aaj follow-up ka din hai.`)}`
            : null;
          return (
            <div key={lead.id} className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/15 px-3 py-2">
              <Link href={`/sales/leads/${lead.id}`} className="flex-1 min-w-0 flex items-center gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{lead.business_name}</p>
                  {lead.contact_name && <p className="text-xs text-muted-foreground">{lead.contact_name}</p>}
                </div>
              </Link>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#25D366] text-white text-xs font-bold hover:bg-[#1ebe5d] transition-colors"
                >
                  <MessageCircle size={11} /> WA
                </a>
              )}
              <Link href={`/sales/leads/${lead.id}`}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-amber-400 transition-colors"
              >
                <ChevronRight size={13} />
              </Link>
            </div>
          );
        })}
        {leads.length > 4 && (
          <Link href="/sales/followups" className="block text-center text-xs text-amber-400/70 hover:text-amber-400 py-1 transition-colors">
            +{leads.length - 4} more follow-ups →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Pipeline strip ────────────────────────────────────────────────────────────

function PipelineStrip({ byStage }: { byStage: Record<string, number> }) {
  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-foreground">Pipeline Breakdown</h2>
        <Link href="/sales/leads" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
          View all <ChevronRight size={11} />
        </Link>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden mb-5 gap-px">
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

      <div className="grid grid-cols-5 gap-2">
        {PIPELINE.map(({ key, label, emoji, color, bg }) => {
          const count = byStage[key] ?? 0;
          return (
            <Link href={`/sales/leads?status=${key}`} key={key}
              className={`flex flex-col items-center rounded-xl border p-3 hover:scale-105 transition-transform ${bg} ${count === 0 ? "opacity-40" : ""}`}
            >
              <span className="text-lg mb-1">{emoji}</span>
              <span className={`text-xl font-black leading-none ${color}`}>{count}</span>
              <span className={`text-[10px] font-semibold mt-1 text-center leading-tight ${color} opacity-70`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Win rate card ─────────────────────────────────────────────────────────────

function WinRateCard({ won, lost }: { won: number; lost: number }) {
  const total = won + lost;
  if (total === 0) return null;
  const pct = Math.round((won / total) * 100);
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={15} className="text-primary" />
        <span className="text-sm font-bold text-foreground">Win Rate</span>
        <span className="ml-auto text-2xl font-black text-primary">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-sidebar-border overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-teal-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-xs text-muted-foreground">{won} won this month</span>
        <span className="text-xs text-muted-foreground">{lost} lost</span>
      </div>
    </div>
  );
}

// ── Quick actions ─────────────────────────────────────────────────────────────

function QuickActions({ stats, followupsCount }: { stats: SalesRepStats; followupsCount: number }) {
  const items = [
    { href: "/sales/leads", icon: Target, label: "All Leads", value: stats.total_leads, color: "text-primary", hoverBg: "hover:bg-primary/5 hover:border-primary/30" },
    { href: "/sales/followups", icon: CalendarCheck, label: "Follow-ups Today", value: followupsCount, color: "text-amber-400", hoverBg: "hover:bg-amber-500/5 hover:border-amber-500/30" },
    { href: "/sales/leads?status=active", icon: Trophy, label: "Won Clients", value: stats.won_this_month, color: "text-teal-400", hoverBg: "hover:bg-teal-500/5 hover:border-teal-500/30" },
    { href: "/sales/leads?status=lost", icon: XCircle, label: "Lost This Month", value: stats.lost_this_month, color: "text-red-400", hoverBg: "hover:bg-red-500/5 hover:border-red-500/30" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(({ href, icon: Icon, label, value, color, hoverBg }) => (
        <Link key={href} href={href}
          className={`flex items-center justify-between rounded-xl border border-sidebar-border bg-card px-4 py-3 transition-colors group ${hoverBg}`}
        >
          <div className="flex items-center gap-2.5">
            <Icon size={16} className={color} />
            <span className="text-sm font-semibold text-foreground">{label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-black ${color}`}>{value}</span>
            <ChevronRight size={13} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SalesDashboardClient({
  stats,
  todayFollowups,
}: {
  stats: SalesRepStats | null;
  todayFollowups: Lead[];
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
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your sales performance at a glance</p>
        </div>
        <Link href="/sales/leads"
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Plus size={15} />
          New Lead
        </Link>
      </div>

      {/* Follow-up alert */}
      <FollowupAlert leads={todayFollowups} />

      {/* Activity stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Phone size={14} className="text-blue-400" />}
          label="Calls"
          today={s.calls_today}
          week={s.calls_week}
          todayColor="text-blue-400"
          border="border-blue-500/20"
          bg="bg-blue-500/5"
        />
        <StatCard
          icon={<MessageCircle size={14} className="text-[#25D366]" />}
          label="WhatsApp"
          today={s.whatsapp_today}
          week={s.whatsapp_week}
          todayColor="text-[#25D366]"
          border="border-[#25D366]/20"
          bg="bg-[#25D366]/5"
        />
        <StatCard
          icon={<Trophy size={14} className="text-amber-400" />}
          label="Won (month)"
          today={s.won_this_month}
          week={s.active_leads}
          todayColor="text-amber-400"
          border="border-amber-500/20"
          bg="bg-amber-500/5"
        />
        <StatCard
          icon={<XCircle size={14} className="text-red-400" />}
          label="Lost (month)"
          today={s.lost_this_month}
          week={s.total_leads}
          todayColor="text-red-400"
          border="border-red-500/20"
          bg="bg-red-500/5"
        />
      </div>

      {/* Win rate */}
      <WinRateCard won={s.won_this_month} lost={s.lost_this_month} />

      {/* Pipeline */}
      <PipelineStrip byStage={s.pipeline_by_stage} />

      {/* Quick links */}
      <QuickActions stats={s} followupsCount={todayFollowups.length} />

      {/* Calls vs WA comparison */}
      {(s.calls_week > 0 || s.whatsapp_week > 0) && (
        <div className="rounded-xl border border-sidebar-border bg-sidebar p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-primary" />
            <span className="text-sm font-bold text-foreground">This Week&apos;s Activity</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>📞 Calls</span>
                <span className="font-semibold text-foreground">{s.calls_week}</span>
              </div>
              <div className="h-2 rounded-full bg-sidebar-border overflow-hidden">
                <div className="h-full rounded-full bg-blue-400 transition-all"
                  style={{ width: `${Math.max(s.calls_week, s.whatsapp_week) === 0 ? 0 : (s.calls_week / Math.max(s.calls_week, s.whatsapp_week)) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>💬 WhatsApp</span>
                <span className="font-semibold text-foreground">{s.whatsapp_week}</span>
              </div>
              <div className="h-2 rounded-full bg-sidebar-border overflow-hidden">
                <div className="h-full rounded-full bg-[#25D366] transition-all"
                  style={{ width: `${Math.max(s.calls_week, s.whatsapp_week) === 0 ? 0 : (s.whatsapp_week / Math.max(s.calls_week, s.whatsapp_week)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
