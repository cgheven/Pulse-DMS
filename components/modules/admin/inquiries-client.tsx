"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Inbox, CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { convertInquiryToLead, dismissInquiry } from "@/app/actions/admin-inquiries";
import type { DmsInquiry } from "@/app/actions/admin-inquiries";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  converted: "bg-emerald-500/10 text-emerald-400",
  dismissed: "bg-muted text-muted-foreground",
};

const PLAN_LABEL: Record<string, string> = {
  single: "Single Branch",
  double: "Double Branch",
  triple: "Triple Branch",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Row actions ───────────────────────────────────────────────────────────────

function InquiryActions({ inquiry }: { inquiry: DmsInquiry }) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (inquiry.status === "converted") {
    return (
      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Converted
      </div>
    );
  }

  if (inquiry.status === "dismissed") {
    return (
      <span className="text-xs text-muted-foreground">Dismissed</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-destructive">{err}</span>}
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setErr(null);
            const res = await convertInquiryToLead(inquiry.id);
            if (res.error) setErr(res.error);
          })
        }
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
      >
        <ArrowRight className="w-3 h-3" />
        Convert to Lead
      </button>
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setErr(null);
            const res = await dismissInquiry(inquiry.id);
            if (res.error) setErr(res.error);
          })
        }
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sidebar-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-60"
      >
        <XCircle className="w-3 h-3" />
        Dismiss
      </button>
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "converted", label: "Converted" },
  { key: "dismissed", label: "Dismissed" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

// ── Main client component ─────────────────────────────────────────────────────

export function InquiriesClient({ inquiries }: { inquiries: DmsInquiry[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const newCount = inquiries.filter((i) => i.status === "new").length;

  const filtered =
    filter === "all" ? inquiries : inquiries.filter((i) => i.status === filter);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inquiries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Website demo requests — convert to leads or dismiss
          </p>
        </div>
        {newCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">
              {newCount} new
            </span>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count =
            key === "all"
              ? inquiries.length
              : inquiries.filter((i) => i.status === key).length;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-sidebar-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className={`ml-1.5 ${filter === key ? "opacity-80" : "opacity-60"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Inbox className="w-8 h-8 opacity-30" />
          <p className="text-sm">No inquiries found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sidebar-border bg-sidebar/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Shop
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    Phone
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sidebar-border/60">
                {filtered.map((inquiry) => (
                  <tr
                    key={inquiry.id}
                    className="hover:bg-sidebar/40 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">{inquiry.contact_name}</p>
                      {inquiry.city && (
                        <p className="text-xs text-muted-foreground mt-0.5">{inquiry.city}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-foreground">{inquiry.shop_name}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <div className="space-y-0.5">
                        <p className="text-foreground">
                          {inquiry.plan_interest
                            ? PLAN_LABEL[inquiry.plan_interest] ?? inquiry.plan_interest
                            : <span className="text-muted-foreground">—</span>}
                        </p>
                        {inquiry.num_branches && (
                          <p className="text-xs text-muted-foreground">
                            {inquiry.num_branches} {inquiry.num_branches === 1 ? "branch" : "branches"}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <p className="text-foreground font-mono text-xs">{inquiry.phone}</p>
                      {inquiry.whatsapp && inquiry.whatsapp !== inquiry.phone && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          WA: {inquiry.whatsapp}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <p className="text-muted-foreground text-xs">{fmt(inquiry.created_at)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          STATUS_STYLE[inquiry.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {inquiry.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <InquiryActions inquiry={inquiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
