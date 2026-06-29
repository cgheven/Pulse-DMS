"use client";

import { useState, useMemo } from "react";
import {
  Activity, Clock, AlertTriangle, XCircle, Users,
  MessageCircle, TrendingUp, Package, Wifi, WifiOff,
  ShoppingCart, Search,
} from "lucide-react";
import type { ShopActivity, ActivityStatus } from "@/app/actions/admin-audit";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function trialLabel(plan: string | null, endsAt: string | null): { label: string; color: string } {
  if (!plan || plan === "full") return { label: "Full Access", color: "text-muted-foreground" };
  if (!endsAt) return { label: plan.replace("_", " "), color: "text-muted-foreground" };
  const daysLeft = Math.ceil((new Date(endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return { label: "Expired", color: "text-red-400" };
  if (daysLeft <= 3) return { label: `Expiring · ${daysLeft}d`, color: "text-amber-400" };
  return { label: `${daysLeft}d left`, color: "text-emerald-400" };
}

function buildWhatsAppUrl(phone: string | null, name: string | null, daysInactive: number | null): string {
  const greeting = name ? `Assalam-o-Alaikum ${name.split(" ")[0]}!` : "Assalam-o-Alaikum!";
  const inactiveNote = daysInactive && daysInactive > 3
    ? `\n\nHum ne notice kiya ke aap ${daysInactive} din se Pulse DMS use nahi kar rahe. Kya koi masla hai?`
    : "";
  const msg = `${greeting}${inactiveNote}\n\nAgar koi bhi help chahiye ho to hum hamesha available hain!\n\nLogin: https://dms.yourpulse.io`;

  if (!phone) return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ActivityStatus }) {
  const map: Record<ActivityStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    active:   { label: "Active",    icon: <Wifi size={11} />,          cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
    idle:     { label: "Idle",      icon: <Clock size={11} />,         cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
    dormant:  { label: "Dormant",   icon: <WifiOff size={11} />,       cls: "bg-red-500/15 text-red-400 border-red-500/25" },
    new:      { label: "New",       icon: <Activity size={11} />,      cls: "bg-primary/15 text-primary border-primary/25" },
    no_shop:  { label: "No Shop",   icon: <AlertTriangle size={11} />, cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
  };
  const { label, icon, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

type Filter = "all" | ActivityStatus | "follow_up";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "active",    label: "Active" },
  { key: "idle",      label: "Idle" },
  { key: "dormant",   label: "Dormant" },
  { key: "new",       label: "New" },
  { key: "no_shop",   label: "No Shop" },
  { key: "follow_up", label: "Needs Follow-up" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function AuditClient({ logs }: { logs: ShopActivity[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => ({
    all:       logs.length,
    active:    logs.filter((l) => l.activity_status === "active").length,
    idle:      logs.filter((l) => l.activity_status === "idle").length,
    dormant:   logs.filter((l) => l.activity_status === "dormant").length,
    new:       logs.filter((l) => l.activity_status === "new").length,
    no_shop:   logs.filter((l) => l.activity_status === "no_shop").length,
    follow_up: logs.filter((l) => l.activity_status === "dormant" || l.activity_status === "idle" || l.activity_status === "no_shop").length,
  }), [logs]);

  const filtered = useMemo(() => {
    let rows = logs;
    if (filter === "follow_up") {
      rows = rows.filter((l) => l.activity_status === "dormant" || l.activity_status === "idle" || l.activity_status === "no_shop");
    } else if (filter !== "all") {
      rows = rows.filter((l) => l.activity_status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (l) =>
          l.email.toLowerCase().includes(q) ||
          (l.full_name ?? "").toLowerCase().includes(q) ||
          (l.shop_name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [logs, filter, search]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Activity Monitor</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Who's using the product — and who needs a follow-up</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-sidebar-border bg-sidebar px-4 py-3 flex items-center gap-3">
          <Users size={16} className="text-muted-foreground shrink-0" />
          <div>
            <p className="text-xl font-bold text-foreground leading-none">{counts.all}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Clients</p>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
          <Wifi size={16} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-xl font-bold text-emerald-400 leading-none">{counts.active}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active (3d)</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
          <Clock size={16} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-xl font-bold text-amber-400 leading-none">{counts.idle}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Idle (3–14d)</p>
          </div>
        </div>
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 flex items-center gap-3">
          <XCircle size={16} className="text-red-400 shrink-0" />
          <div>
            <p className="text-xl font-bold text-red-400 leading-none">{counts.dormant + counts.no_shop}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Dormant / No Shop</p>
          </div>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === key
                  ? "bg-primary text-white"
                  : "bg-sidebar border border-sidebar-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {label}
              {counts[key as keyof typeof counts] !== undefined && (
                <span className={`ml-1.5 ${filter === key ? "opacity-80" : "opacity-50"}`}>
                  {counts[key as keyof typeof counts]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search client, shop…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg border border-sidebar-border bg-sidebar text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-full sm:w-56"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-sidebar-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sidebar-border bg-sidebar">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shop</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Login</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales 7d / 30d</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Products</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trial</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Follow Up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sidebar-border">
              {filtered.map((log) => {
                const trial = trialLabel(log.trial_plan, log.trial_ends_at);
                return (
                  <tr key={log.user_id} className="bg-card hover:bg-sidebar/50 transition-colors">
                    {/* Client */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground truncate max-w-[160px]">
                        {log.full_name ?? <span className="text-muted-foreground italic text-xs">No name</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">{log.email}</p>
                    </td>

                    {/* Shop */}
                    <td className="px-4 py-3">
                      {log.shop_name
                        ? <p className="text-foreground truncate max-w-[140px]">{log.shop_name}</p>
                        : <span className="text-xs text-muted-foreground/50 italic">No shop</span>}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={log.activity_status} />
                    </td>

                    {/* Last Login */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(log.last_sign_in_at)}
                    </td>

                    {/* Sales */}
                    <td className="px-4 py-3">
                      {log.shop_id ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <ShoppingCart size={11} className="text-muted-foreground" />
                          <span className={log.sales_7d > 0 ? "text-emerald-400 font-semibold" : "text-muted-foreground"}>
                            {log.sales_7d}
                          </span>
                          <span className="text-muted-foreground/40">/</span>
                          <span className={log.sales_30d > 0 ? "text-foreground" : "text-muted-foreground"}>
                            {log.sales_30d}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Products */}
                    <td className="px-4 py-3">
                      {log.shop_id ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Package size={11} />
                          <span className={log.total_products > 0 ? "text-foreground" : ""}>{log.total_products}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Trial */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${trial.color}`}>{trial.label}</span>
                    </td>

                    {/* Follow Up */}
                    <td className="px-4 py-3 text-right">
                      <a
                        href={buildWhatsAppUrl(log.shop_phone, log.full_name, log.days_inactive)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 text-xs font-semibold transition-colors"
                        title="Open WhatsApp with pre-filled message"
                      >
                        <MessageCircle size={12} />
                        WhatsApp
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-16 text-center">
            <TrendingUp size={28} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No clients match this filter.</p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground/50 mt-3 text-right">
        Active = logged in within 3 days · Idle = 3–14 days · Dormant = 14+ days
      </p>
    </div>
  );
}
