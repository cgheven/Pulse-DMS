"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileBarChart, FileSpreadsheet, FileText, MapPin, RefreshCw,
  TrendingUp, Wallet, Landmark, Clock, AlertCircle,
} from "lucide-react";
import { useBranchContext } from "@/contexts/branch-context";
import { useShopContext } from "@/contexts/shop-context";
import { getManagementReports } from "@/app/actions/riders";
import { formatDateInput, cn } from "@/lib/utils";
import { downloadReportCsv } from "@/lib/reports/csv-export";
import { downloadReportPdf } from "@/lib/reports/pdf-export";
import type { ReportColumn } from "@/lib/reports/types";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type {
  Rider, RiderDailySalesRow, RiderCashTotalByRiderDay, RiderChequeTotalByRider,
  RiderPerformanceRow, RiderPendingOrder, ManagementReports,
} from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Preset = "today" | "week" | "month" | "custom";
type Tab = "daily_sales" | "collections" | "performance" | "pending_orders";

function todayStr() { return formatDateInput(new Date()); }
function startOfWeek() { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return formatDateInput(d); }
function startOfMonth() { const d = new Date(); d.setDate(1); return formatDateInput(d); }

const EMPTY: ManagementReports = {
  dailySalesByRider: [], cashByRiderDay: [], cashGrandTotal: 0,
  chequeByRider: [], chequePendingTotal: 0, chequeClearedTotal: 0, chequeBouncedTotal: 0,
  riderPerformance: [], pendingOrders: [],
};

function fmt(n: number) { return `Rs ${Math.round(n).toLocaleString()}`; }
function prettyDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

const TABS: { key: Tab; label: string; Icon: typeof FileBarChart }[] = [
  { key: "daily_sales",    label: "Daily Sales by Rider",   Icon: TrendingUp },
  { key: "collections",    label: "Cash & Cheque",          Icon: Wallet },
  { key: "performance",    label: "Rider Performance",      Icon: FileBarChart },
  { key: "pending_orders", label: "Pending Orders",         Icon: Clock },
];

// ─── Export buttons (Excel = CSV download, PDF via jspdf+jspdf-autotable) ────

function ExportButtons<Row>({
  rows, columns, title, shopName, period, filenameBase, totalsRow = true,
}: {
  rows: Row[]; columns: ReportColumn<Row>[]; title: string; shopName: string;
  period?: string; filenameBase: string; totalsRow?: boolean;
}) {
  const disabled = rows.length === 0;
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        disabled={disabled}
        onClick={() => downloadReportCsv({ filename: filenameBase, columns, rows, totalsRow })}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Export Excel (CSV)"
      >
        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
      </button>
      <button
        disabled={disabled}
        onClick={() => downloadReportPdf({ meta: { title, shopName, period, filename: filenameBase }, columns, rows, totalsRow })}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Export PDF"
      >
        <FileText className="w-3.5 h-3.5" /> PDF
      </button>
    </div>
  );
}

// ─── Generic table shell (mobile: horizontal scroll inside its own container) ─

function ReportTable({ head, children, empty }: { head: React.ReactNode; children: React.ReactNode; empty: boolean }) {
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-sidebar-border">
        <AlertCircle className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-foreground">No data for this period</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different rider or date range.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sidebar-border/60 bg-muted/10">{head}</tr>
          </thead>
          <tbody className="divide-y divide-sidebar-border/40">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return (
    <th className={cn(
      "px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap",
      num ? "text-right" : "text-left"
    )}>
      {children}
    </th>
  );
}
function Td({ children, num, className }: { children: React.ReactNode; num?: boolean; className?: string }) {
  return (
    <td className={cn("px-3 py-2 whitespace-nowrap", num ? "text-right tabular-nums" : "text-left", className)}>
      {children}
    </td>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RiderReportsClient({ riders }: { riders: Rider[] }) {
  const { branchId, branch } = useBranchContext();
  const { shop } = useShopContext();
  const shopName = `${shop?.shop_name ?? "Shop"} — ${branch?.name ?? "Branch"}`;
  const slug = (shop?.shop_name ?? "shop").replace(/\s+/g, "-").toLowerCase();

  const [tab, setTab] = useState<Tab>("daily_sales");
  const [riderId, setRiderId] = useState<string>("all");
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(startOfMonth());
  const [customTo, setCustomTo] = useState(todayStr());
  const [minPendingDays, setMinPendingDays] = useState(0);
  const [data, setData] = useState<ManagementReports>(EMPTY);
  const [loading, setLoading] = useState(true);

  const rangeFor = useCallback((p: Preset) => {
    const today = todayStr();
    if (p === "today") return { from: today, to: today };
    if (p === "week")  return { from: startOfWeek(), to: today };
    if (p === "month") return { from: startOfMonth(), to: today };
    return { from: customFrom, to: customTo };
  }, [customFrom, customTo]);

  const load = useCallback((from: string, to: string) => {
    if (!branchId) return;
    setLoading(true);
    getManagementReports(branchId, from, to, { riderId: riderId === "all" ? undefined : riderId })
      .then((res) => {
        if (res.error) {
          toast({ title: "Failed to load reports", description: res.error, variant: "destructive" });
          setData(EMPTY);
        } else {
          setData(res);
        }
      })
      .finally(() => setLoading(false));
  }, [branchId, riderId]);

  useEffect(() => {
    if (preset === "custom") return;
    const { from, to } = rangeFor(preset);
    load(from, to);
  }, [branchId, riderId, preset, rangeFor, load]);

  const { from, to } = rangeFor(preset);
  const period = `${prettyDate(from)} – ${prettyDate(to)}`;

  const pendingOrdersFiltered = useMemo(
    () => data.pendingOrders.filter((o) => o.daysPending >= minPendingDays),
    [data.pendingOrders, minPendingDays]
  );

  // ── Column definitions (one per report, per the CSV/PDF export contract) ──

  const dailySalesColumns: ReportColumn<RiderDailySalesRow>[] = [
    { id: "date",   label: "Date",               defaultOn: true, accessor: (r) => r.date },
    { id: "rider",  label: "Rider",              defaultOn: true, accessor: (r) => r.riderName },
    { id: "orders", label: "Orders",             defaultOn: true, numeric: true, accessor: (r) => r.orderCount },
    { id: "amount", label: "Total Amount (PKR)", defaultOn: true, numeric: true, accessor: (r) => r.totalAmount },
  ];

  const cashColumns: ReportColumn<RiderCashTotalByRiderDay>[] = [
    { id: "date",  label: "Date",                 defaultOn: true, accessor: (r) => r.date },
    { id: "rider", label: "Rider",                defaultOn: true, accessor: (r) => r.riderName },
    { id: "total", label: "Cash Collected (PKR)", defaultOn: true, numeric: true, accessor: (r) => r.total },
  ];

  const chequeColumns: ReportColumn<RiderChequeTotalByRider>[] = [
    { id: "rider",   label: "Rider",           defaultOn: true, accessor: (r) => r.riderName },
    { id: "pending", label: "Pending (PKR)",   defaultOn: true, numeric: true, accessor: (r) => r.pendingTotal },
    { id: "cleared", label: "Cleared (PKR)",   defaultOn: true, numeric: true, accessor: (r) => r.clearedTotal },
    { id: "bounced", label: "Bounced (PKR)",   defaultOn: true, numeric: true, accessor: (r) => r.bouncedTotal },
  ];

  const perfColumns: ReportColumn<RiderPerformanceRow>[] = [
    { id: "rider",     label: "Rider",                   defaultOn: true, accessor: (r) => r.riderName },
    { id: "taken",     label: "Orders Taken",            defaultOn: true, numeric: true, accessor: (r) => r.ordersTaken },
    { id: "delivered", label: "Delivered",                defaultOn: true, numeric: true, accessor: (r) => r.delivered },
    { id: "cancelled", label: "Cancelled",                defaultOn: true, numeric: true, accessor: (r) => r.cancelled },
    { id: "pending",   label: "Pending",                  defaultOn: true, numeric: true, accessor: (r) => r.pending },
    { id: "rate",      label: "Delivery Rate %",          defaultOn: true, numeric: true, accessor: (r) => r.deliveryRatePct },
    { id: "cash",      label: "Cash Collected (PKR)",     defaultOn: true, numeric: true, accessor: (r) => r.cashCollected },
    { id: "cheque",    label: "Cheque Collected (PKR)",   defaultOn: true, numeric: true, accessor: (r) => r.chequeCollected },
    { id: "avg",       label: "Avg Order Value (PKR)",    defaultOn: true, numeric: true, accessor: (r) => r.avgOrderValue },
  ];

  const pendingColumns: ReportColumn<RiderPendingOrder>[] = [
    { id: "date",     label: "Order Date",     defaultOn: true, accessor: (r) => r.order_date },
    { id: "days",     label: "Days Pending",   defaultOn: true, numeric: true, accessor: (r) => r.daysPending },
    { id: "rider",    label: "Rider",          defaultOn: true, accessor: (r) => r.rider?.full_name ?? "" },
    { id: "client",   label: "Client",         defaultOn: true, accessor: (r) => r.client?.name ?? "" },
    { id: "payment",  label: "Payment Method", defaultOn: true, accessor: (r) => r.payment_method },
    { id: "amount",   label: "Amount (PKR)",   defaultOn: true, numeric: true, accessor: (r) => r.total_amount },
    { id: "location", label: "Location",       defaultOn: true, accessor: (r) => r.mapsUrl ?? "" },
  ];

  const filenameBase = (report: string) => `${report}-${slug}-${from}_to_${to}`;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rider Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Daily sales, cash &amp; cheque collection, performance, and pending orders — export to Excel or PDF.</p>
        </div>
        <button
          onClick={() => load(from, to)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-lg border border-sidebar-border px-3 py-2"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-sidebar-border bg-card p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Select value={riderId} onValueChange={setRiderId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All riders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All riders</SelectItem>
              {riders.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-0.5 bg-muted/20 rounded-lg p-0.5 w-fit">
            {(["today", "week", "month", "custom"] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  preset === p ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
              </button>
            ))}
          </div>
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">From</span>
            <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={customTo} min={customFrom} max={todayStr()} onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <button
              onClick={() => load(customFrom, customTo)}
              disabled={loading}
              className="h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Generate"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors",
              tab === key ? "bg-primary/10 text-primary border-primary/30" : "border-sidebar-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Daily Sales by Rider ── */}
          {tab === "daily_sales" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total sales, {period}</p>
                    <p className="text-lg font-bold text-foreground">{fmt(data.dailySalesByRider.reduce((s, r) => s + r.totalAmount, 0))}</p>
                  </div>
                </div>
                <ExportButtons
                  rows={data.dailySalesByRider} columns={dailySalesColumns}
                  title="Daily Sales by Rider" shopName={shopName} period={period}
                  filenameBase={filenameBase("daily-sales-by-rider")}
                />
              </div>
              <ReportTable
                empty={data.dailySalesByRider.length === 0}
                head={<><Th>Date</Th><Th>Rider</Th><Th num>Orders</Th><Th num>Total Amount</Th></>}
              >
                {data.dailySalesByRider.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/10">
                    <Td>{prettyDate(r.date)}</Td>
                    <Td>{r.riderName}</Td>
                    <Td num>{r.orderCount}</Td>
                    <Td num className="font-semibold">{fmt(r.totalAmount)}</Td>
                  </tr>
                ))}
              </ReportTable>
            </div>
          )}

          {/* ── Cash + Cheque Collection ── */}
          {tab === "collections" && (
            <div className="space-y-5">
              {/* Cash */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                      <Wallet className="w-4.5 h-4.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cash collected, {period}</p>
                      <p className="text-lg font-bold text-foreground">{fmt(data.cashGrandTotal)}</p>
                    </div>
                  </div>
                  <ExportButtons
                    rows={data.cashByRiderDay} columns={cashColumns}
                    title="Cash Collection Totals by Rider & Day" shopName={shopName} period={period}
                    filenameBase={filenameBase("cash-collection")}
                  />
                </div>
                <ReportTable
                  empty={data.cashByRiderDay.length === 0}
                  head={<><Th>Date</Th><Th>Rider</Th><Th num>Cash Collected</Th></>}
                >
                  {data.cashByRiderDay.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/10">
                      <Td>{prettyDate(r.date)}</Td>
                      <Td>{r.riderName}</Td>
                      <Td num className="font-semibold">{fmt(r.total)}</Td>
                    </tr>
                  ))}
                </ReportTable>
              </div>

              {/* Cheque */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 flex items-center gap-2.5">
                      <Landmark className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Pending</p>
                        <p className="text-sm font-bold text-foreground">{fmt(data.chequePendingTotal)}</p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-green-500/30 bg-green-500/5 px-3.5 py-2.5 flex items-center gap-2.5">
                      <Landmark className="w-4 h-4 text-green-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Cleared</p>
                        <p className="text-sm font-bold text-foreground">{fmt(data.chequeClearedTotal)}</p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 flex items-center gap-2.5">
                      <Landmark className="w-4 h-4 text-red-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Bounced</p>
                        <p className="text-sm font-bold text-foreground">{fmt(data.chequeBouncedTotal)}</p>
                      </div>
                    </div>
                  </div>
                  <ExportButtons
                    rows={data.chequeByRider} columns={chequeColumns}
                    title="Cheque Collection Totals by Rider" shopName={shopName} period={period}
                    filenameBase={filenameBase("cheque-collection")}
                  />
                </div>
                <ReportTable
                  empty={data.chequeByRider.length === 0}
                  head={<><Th>Rider</Th><Th num>Pending</Th><Th num>Cleared</Th><Th num>Bounced</Th></>}
                >
                  {data.chequeByRider.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/10">
                      <Td>{r.riderName}</Td>
                      <Td num>{fmt(r.pendingTotal)}</Td>
                      <Td num>{fmt(r.clearedTotal)}</Td>
                      <Td num>{fmt(r.bouncedTotal)}</Td>
                    </tr>
                  ))}
                </ReportTable>
              </div>
            </div>
          )}

          {/* ── Rider Performance Summary ── */}
          {tab === "performance" && (
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <ExportButtons
                  rows={data.riderPerformance} columns={perfColumns}
                  title="Rider Performance Summary" shopName={shopName} period={period}
                  filenameBase={filenameBase("rider-performance")}
                  totalsRow={false}
                />
              </div>
              <ReportTable
                empty={data.riderPerformance.length === 0}
                head={<>
                  <Th>Rider</Th><Th num>Taken</Th><Th num>Delivered</Th><Th num>Cancelled</Th>
                  <Th num>Pending</Th><Th num>Delivery %</Th><Th num>Cash</Th><Th num>Cheque</Th><Th num>Avg Order</Th>
                </>}
              >
                {data.riderPerformance.map((r) => (
                  <tr key={r.riderId} className="hover:bg-muted/10">
                    <Td className="font-medium">{r.riderName}</Td>
                    <Td num>{r.ordersTaken}</Td>
                    <Td num>{r.delivered}</Td>
                    <Td num>{r.cancelled}</Td>
                    <Td num>{r.pending}</Td>
                    <Td num>
                      <span className={cn(
                        "font-semibold",
                        r.deliveryRatePct >= 80 ? "text-emerald-400" : r.deliveryRatePct >= 50 ? "text-amber-400" : "text-red-400"
                      )}>
                        {r.deliveryRatePct.toFixed(0)}%
                      </span>
                    </Td>
                    <Td num>{fmt(r.cashCollected)}</Td>
                    <Td num>{fmt(r.chequeCollected)}</Td>
                    <Td num>{fmt(r.avgOrderValue)}</Td>
                  </tr>
                ))}
              </ReportTable>
            </div>
          )}

          {/* ── Pending Orders ── */}
          {tab === "pending_orders" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show pending for at least</span>
                  <input
                    type="number" min={0} value={minPendingDays}
                    onChange={(e) => setMinPendingDays(Math.max(0, Number(e.target.value) || 0))}
                    className="w-16 h-8 px-2 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">day(s) — {pendingOrdersFiltered.length} order{pendingOrdersFiltered.length !== 1 ? "s" : ""}</span>
                </div>
                <ExportButtons
                  rows={pendingOrdersFiltered} columns={pendingColumns}
                  title="Pending Orders" shopName={shopName}
                  filenameBase={filenameBase("pending-orders")}
                  totalsRow={false}
                />
              </div>
              <ReportTable
                empty={pendingOrdersFiltered.length === 0}
                head={<>
                  <Th>Order Date</Th><Th num>Days Pending</Th><Th>Rider</Th><Th>Client</Th>
                  <Th>Payment</Th><Th num>Amount</Th><Th>Location</Th>
                </>}
              >
                {pendingOrdersFiltered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/10">
                    <Td>{prettyDate(o.order_date)}</Td>
                    <Td num>
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
                        o.daysPending > 7 ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : o.daysPending > 2 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-green-500/10 text-green-400 border-green-500/20"
                      )}>
                        <Clock className="w-3 h-3" /> {o.daysPending}
                      </span>
                    </Td>
                    <Td>{o.rider?.full_name ?? "—"}</Td>
                    <Td>{o.client?.name ?? "—"}</Td>
                    <Td className="capitalize">{o.payment_method}</Td>
                    <Td num className="font-semibold">{fmt(o.total_amount)}</Td>
                    <Td>
                      {o.mapsUrl ? (
                        <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <MapPin className="w-3.5 h-3.5" /> View
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </ReportTable>
            </div>
          )}
        </>
      )}
    </div>
  );
}
