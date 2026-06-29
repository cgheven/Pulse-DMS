"use client";

import Link from "next/link";
import { CalendarCheck, ChevronRight, Phone, MapPin } from "lucide-react";
import type { Lead } from "@/app/actions/sales-rep";

const STATUS_COLORS: Record<string, string> = {
  new:              "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  contacted:        "bg-blue-500/15 text-blue-400 border-blue-500/25",
  demo_given:       "bg-violet-500/15 text-violet-400 border-violet-500/25",
  follow_up:        "bg-amber-500/15 text-amber-400 border-amber-500/25",
  negotiating:      "bg-orange-500/15 text-orange-400 border-orange-500/25",
  payment_pending:  "bg-yellow-500/15 text-yellow-500 border-yellow-500/25",
  payment_received: "bg-green-500/15 text-green-400 border-green-500/25",
  onboarding:       "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  active:           "bg-teal-500/15 text-teal-400 border-teal-500/25",
  lost:             "bg-red-500/15 text-red-400 border-red-500/25",
};

export default function FollowupsClient({ leads }: { leads: Lead[] }) {
  const today = new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <CalendarCheck size={18} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Today&apos;s Follow-ups</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{today}</p>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center py-20 rounded-xl border border-dashed border-sidebar-border">
          <CalendarCheck size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No follow-ups scheduled for today</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Check your leads to schedule future follow-ups</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => {
            const safePhone = lead.whatsapp_number?.replace(/[^0-9+\-() ]/g, "") ?? null;
            const waUrl = safePhone
              ? `https://wa.me/${safePhone.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(`Assalam-o-Alaikum! ${lead.contact_name ? lead.contact_name + ", aaj" : "Aaj"} hum ne aap se baat karni thi Pulse DMS ke baare mein.`)}`
              : null;

            return (
              <Link key={lead.id} href={`/sales/leads/${lead.id}`}
                className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 hover:border-amber-500/40 hover:bg-amber-500/10 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <CalendarCheck size={15} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-foreground truncate">{lead.business_name}</p>
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[lead.status] ?? ""}`}>
                      {lead.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {lead.contact_name && <span>{lead.contact_name}</span>}
                    {safePhone && (
                      <span className="flex items-center gap-1">
                        <Phone size={10} />{safePhone}
                      </span>
                    )}
                    {lead.city && (
                      <span className="flex items-center gap-1">
                        <MapPin size={10} />{lead.city}
                      </span>
                    )}
                  </div>
                </div>
                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 text-xs font-semibold transition-colors"
                  >
                    WA
                  </a>
                )}
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-amber-400 transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
