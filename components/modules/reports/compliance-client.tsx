"use client";
import { useMemo, useState } from "react";
import {
  FileText, Search, Printer, Save, Calendar as CalendarIcon, Check, Download,
  ChevronDown, FileSpreadsheet, FileImage,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, formatDateInput } from "@/lib/utils";
import { saveComplianceSettings, logComplianceReport } from "@/app/actions/compliance";
import type { Gym } from "@/types";

type Member = {
  id: string;
  full_name: string;
  member_number: string | null;
  phone: string | null;
  email: string | null;
  cnic: string | null;
  monthly_fee: number;
  plan_id: string | null;
  assigned_trainer_id: string | null;
  status: string;
  join_date: string;
  plan_expiry_date: string | null;
  plan?: { name: string } | null;
  trainer?: { full_name: string } | null;
};

interface Props {
  gym: Gym | null;
  members: Member[];
  payments: { member_id: string; total_amount: number; status: string; payment_date: string | null; for_period: string | null }[];
  trainers: { id: string; full_name: string }[];
}

// Reduced to fields that actually appear on tax/compliance documents.
// Order = importance. First 5 default-on, last 2 optional.
const ALL_FIELDS = [
  { key: "name",        label: "Name",        default: true  },
  { key: "cnic",        label: "CNIC",        default: true  },
  { key: "plan",        label: "Plan",        default: true  },
  { key: "monthly_fee", label: "Monthly Fee", default: true  },
  { key: "total_paid",  label: "Total Paid",  default: true  },
  { key: "phone",       label: "Phone",       default: false },
  { key: "join_date",   label: "Join Date",   default: false },
];

const RANGE_PRESETS = [
  { label: "This Month",     month: 0 },
  { label: "Last Month",     month: -1 },
  { label: "Last 3 Months",  month: -3 },
  { label: "This Year",      year: true },
  { label: "Custom",         custom: true },
];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfYear(d: Date)  { return new Date(d.getFullYear(), 0, 1); }

// Period label — full unambiguous dates on both sides for compliance ("Dec 1, 2025 → Apr 29, 2026").
function formatPeriod(startISO: string, endISO: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const fmt = (d: Date) => `${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}, ${d.getFullYear()}`;
  if (s.toDateString() === e.toDateString()) return fmt(s);
  return `${fmt(s)} → ${fmt(e)}`;
}

export function ComplianceClient({ gym, members, payments, trainers }: Props) {
  // Defaults from saved settings, with sensible fallbacks
  const savedFields = gym?.report_settings?.fields;
  const initialFields = new Set(savedFields ?? ALL_FIELDS.filter((f) => f.default).map((f) => f.key));

  const [ntn, setNtn] = useState(gym?.ntn ?? "");
  const [headerTitle, setHeaderTitle] = useState(gym?.report_settings?.headerTitle ?? "Revenue Report");
  const [notes, setNotes] = useState(gym?.report_settings?.notes ?? "");
  const [taxRate, setTaxRate] = useState(gym?.report_settings?.taxRate ?? 0);
  const [taxInclusive, setTaxInclusive] = useState(gym?.report_settings?.taxInclusive ?? true);
  const [taxLabel, setTaxLabel] = useState(gym?.report_settings?.taxLabel ?? "Sales Tax");
  const [selectedFields, setSelectedFields] = useState<Set<string>>(initialFields);

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  // Date range — default this month
  const today = new Date();
  const [startDate, setStartDate] = useState(formatDateInput(startOfMonth(today)));
  const [endDate, setEndDate] = useState(formatDateInput(endOfMonth(today)));
  const [activePreset, setActivePreset] = useState<number>(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(members.map((m) => m.id)));
  const [savingSettings, setSavingSettings] = useState(false);

  function applyPreset(idx: number) {
    setActivePreset(idx);
    const preset = RANGE_PRESETS[idx];
    if (preset.custom) return;
    const now = new Date();
    if (preset.year) {
      setStartDate(formatDateInput(startOfYear(now)));
      setEndDate(formatDateInput(now));
      return;
    }
    if (typeof preset.month === "number") {
      const target = new Date(now.getFullYear(), now.getMonth() + preset.month, 1);
      const monthsBack = Math.abs(preset.month);
      const start = startOfMonth(monthsBack > 1 ? target : target);
      const end = preset.month === 0 ? endOfMonth(now) : endOfMonth(now); // current month covers up to today
      // Actually for "Last 3 Months" we want from N months ago to today
      if (preset.month === -3) {
        setStartDate(formatDateInput(startOfMonth(new Date(now.getFullYear(), now.getMonth() - 3, 1))));
        setEndDate(formatDateInput(now));
      } else {
        setStartDate(formatDateInput(start));
        setEndDate(formatDateInput(preset.month === 0 ? now : end));
      }
    }
  }

  // Aggregate paid amount per member within date range
  const paidByMember = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of payments) {
      if (!p.payment_date) continue;
      if (p.payment_date < startDate || p.payment_date > endDate) continue;
      map[p.member_id] = (map[p.member_id] ?? 0) + Number(p.total_amount);
    }
    return map;
  }, [payments, startDate, endDate]);

  // Filtered member rows for selection table
  const filteredMembers = useMemo(() => {
    let list = members;
    if (activeOnly) list = list.filter((m) => m.status === "active");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.cnic ?? "").includes(q)
      );
    }
    return list;
  }, [members, search, activeOnly]);

  const reportRows = useMemo(
    () => filteredMembers.filter((m) => selectedIds.has(m.id)).map((m) => ({
      ...m,
      total_paid: paidByMember[m.id] ?? 0,
    })),
    [filteredMembers, selectedIds, paidByMember]
  );

  const totalRevenue = reportRows.reduce((s, r) => s + r.total_paid, 0);

  function toggleField(key: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredMembers.forEach((m) => next.add(m.id));
      return next;
    });
  }

  function clearAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredMembers.forEach((m) => next.delete(m.id));
      return next;
    });
  }

  async function saveDefaults() {
    setSavingSettings(true);
    const res = await saveComplianceSettings({
      ntn: ntn || null,
      fields: Array.from(selectedFields),
      notes: notes || null,
      headerTitle,
      taxRate,
      taxInclusive,
      taxLabel: taxLabel || null,
    });
    setSavingSettings(false);
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else toast({ title: "Defaults saved" });
  }

  async function generateReport() {
    if (reportRows.length === 0) {
      toast({ title: "Select at least one member", variant: "destructive" });
      return;
    }
    // Audit log + print
    await logComplianceReport({
      memberCount: reportRows.length,
      totalRevenue,
      startDate,
      endDate,
      fields: Array.from(selectedFields),
    });
    window.print();
  }

  const [generatingPdf, setGeneratingPdf] = useState(false);
  async function downloadPDF() {
    if (reportRows.length === 0) {
      toast({ title: "Select at least one member", variant: "destructive" });
      return;
    }
    setGeneratingPdf(true);
    try {
      const [{ default: jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableModule.default;

      const showTax = taxRate > 0;
      const rate = taxRate / 100;
      const taxAmount = showTax
        ? (taxInclusive ? totalRevenue - totalRevenue / (1 + rate) : totalRevenue * rate)
        : 0;
      const subtotal   = showTax ? (taxInclusive ? totalRevenue - taxAmount : totalRevenue) : totalRevenue;
      const grandTotal = showTax ? (taxInclusive ? totalRevenue : totalRevenue + taxAmount) : totalRevenue;

      const fmtCnic = (raw: string | null | undefined): string => {
        if (!raw) return "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length === 13) return `${digits.slice(0,5)}-${digits.slice(5,12)}-${digits.slice(12)}`;
        return raw;
      };
      const fmtMoney = (n: number) => `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 40;
      let y = margin;

      // ── Header
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text((gym?.name ?? "Gym").toUpperCase(), margin, y);
      y += 18;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(80);
      const addrLine = [gym?.address, gym?.city].filter(Boolean).join(", ");
      if (addrLine) { pdf.text(addrLine, margin, y); y += 12; }
      if (gym?.phone) { pdf.text(`Phone: ${gym.phone}`, margin, y); y += 12; }
      if (ntn)        { pdf.text(`NTN: ${ntn}`, margin, y); y += 12; }

      pdf.setDrawColor(0);
      pdf.setLineWidth(1.5);
      pdf.line(margin, y + 4, pageW - margin, y + 4);
      y += 16;

      // Title + period
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(0);
      pdf.text(headerTitle, margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      // Helvetica (WinAnsi) doesn't include U+2192 — swap → for ASCII dash
      const periodText = formatPeriod(startDate, endDate).replace(/\s*→\s*/g, " - ");
      const periodW = pdf.getTextWidth(periodText);
      pdf.text(periodText, pageW - margin - periodW, y);
      y += 14;

      if (notes) {
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(9);
        pdf.setTextColor(80);
        const noteLines = pdf.splitTextToSize(notes, pageW - margin * 2);
        pdf.text(noteLines, margin, y);
        y += noteLines.length * 11 + 4;
      }

      // ── Member table
      const head: string[] = ["#"];
      if (selectedFields.has("name"))        head.push("Name");
      if (selectedFields.has("cnic"))        head.push("CNIC");
      if (selectedFields.has("phone"))       head.push("Phone");
      if (selectedFields.has("plan"))        head.push("Plan");
      if (selectedFields.has("monthly_fee")) head.push("Monthly Fee");
      if (selectedFields.has("total_paid"))  head.push("Total Paid");
      if (selectedFields.has("join_date"))   head.push("Join Date");

      const body = reportRows.map((r, i) => {
        const cols: (string | number)[] = [i + 1];
        if (selectedFields.has("name"))        cols.push(r.full_name);
        if (selectedFields.has("cnic"))        cols.push(fmtCnic(r.cnic));
        if (selectedFields.has("phone"))       cols.push(r.phone ?? "");
        if (selectedFields.has("plan"))        cols.push(r.plan?.name ?? "");
        if (selectedFields.has("monthly_fee")) cols.push(fmtMoney(r.monthly_fee));
        if (selectedFields.has("total_paid"))  cols.push(fmtMoney(r.total_paid));
        if (selectedFields.has("join_date"))   cols.push(r.join_date ? formatDate(r.join_date) : "");
        return cols;
      });

      autoTable(pdf, {
        head: [head],
        body,
        startY: y,
        margin: { left: margin, right: margin, bottom: 40 },
        styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [20, 20, 20], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        showHead: "everyPage",
        rowPageBreak: "avoid",
      });

      // ── Summary — compute height up-front to avoid mid-block break
      const finalY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
      const pageH = pdf.internal.pageSize.getHeight();
      const summaryRows = showTax ? 4 : 2;
      const summaryHeight = 14 /* line+gap */ + 14 /* heading */ + summaryRows * 14 + 14 /* gap + divider */;
      let sy = finalY;
      if (sy + summaryHeight > pageH - 40 /* footer reserve */) {
        pdf.addPage();
        sy = margin;
      }

      pdf.setDrawColor(0);
      pdf.setLineWidth(0.5);
      pdf.line(margin, sy, pageW - margin, sy);
      sy += 14;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(0);
      pdf.text("SUMMARY", margin, sy);
      sy += 14;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const labelX = pageW - margin - 200;
      const valueX = pageW - margin;
      const rowH = 14;
      const summaryRow = (label: string, value: string, bold = false) => {
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.text(label, labelX, sy);
        pdf.text(value, valueX - pdf.getTextWidth(value), sy);
        sy += rowH;
      };

      summaryRow("Total Members", String(reportRows.length));
      sy += 8; // breathing room after member count
      if (showTax) {
        summaryRow(taxInclusive ? "Subtotal (excl. tax)" : "Subtotal", fmtMoney(subtotal));
        summaryRow(`${taxLabel || "Tax"} (${taxRate}%)`, fmtMoney(taxAmount));
        // thin divider before grand total
        pdf.setDrawColor(180);
        pdf.setLineWidth(0.4);
        pdf.line(labelX, sy - 4, valueX, sy - 4);
        sy += 6;
        summaryRow("Grand Total", fmtMoney(grandTotal), true);
      } else {
        pdf.setDrawColor(180);
        pdf.setLineWidth(0.4);
        pdf.line(labelX, sy - 4, valueX, sy - 4);
        sy += 6;
        summaryRow("Total Revenue", fmtMoney(totalRevenue), true);
      }

      // Stamp "Page X of Y" footer after all pages exist (final count is now known)
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(120);
        pdf.text(`Page ${p} of ${totalPages}`, pageW / 2, pageH - 20, { align: "center" });
      }

      const fileName = `${(gym?.name ?? "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

      await logComplianceReport({
        memberCount: reportRows.length,
        totalRevenue,
        startDate,
        endDate,
        fields: Array.from(selectedFields),
      });
      toast({ title: "PDF downloaded" });
    } catch (err) {
      toast({ title: "PDF generation failed", description: err instanceof Error ? err.message : "Try Print → Save as PDF instead", variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function downloadCSV() {
    if (reportRows.length === 0) {
      toast({ title: "Select at least one member", variant: "destructive" });
      return;
    }

    // Tax calc — same logic as print preview
    const showTax = taxRate > 0;
    const rate = taxRate / 100;
    const taxAmount = showTax
      ? (taxInclusive ? totalRevenue - totalRevenue / (1 + rate) : totalRevenue * rate)
      : 0;
    const subtotal   = showTax ? (taxInclusive ? totalRevenue - taxAmount : totalRevenue) : totalRevenue;
    const grandTotal = showTax ? (taxInclusive ? totalRevenue : totalRevenue + taxAmount) : totalRevenue;

    // CSV escape — quote if contains comma/quote/newline; double internal quotes.
    const esc = (v: string | number | null | undefined): string => {
      if (v == null || v === "") return "";
      const str = String(v);
      return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const row = (cols: (string | number | null | undefined)[]) => cols.map(esc).join(",");

    // Money values — 2 decimals if non-integer, else integer (clean spreadsheet feel)
    const money = (n: number) => Number.isInteger(n) ? n : Number(n.toFixed(2));

    // Format CNIC into 5-7-1 digit groups so Excel never misreads it as a number.
    // "4410293847566" → "44102-9384756-6" (standard PK format)
    const fmtCnic = (raw: string | null | undefined): string => {
      if (!raw) return "";
      const digits = raw.replace(/\D/g, "");
      if (digits.length === 13) return `${digits.slice(0,5)}-${digits.slice(5,12)}-${digits.slice(12)}`;
      return raw;
    };

    // Force Excel to treat as text (preserves leading zeros, prevents number conversion)
    const asText = (v: string | null | undefined): string => v ? `="${String(v).replace(/"/g, '""')}"` : "";

    const lines: string[] = [];

    // ── SECTION 1: Gym Information ────────────────────────────────────
    lines.push(row(["GYM INFORMATION"]));
    lines.push(row(["Name", gym?.name ?? ""]));
    if (gym?.address || gym?.city) {
      lines.push(row(["Address", [gym?.address, gym?.city].filter(Boolean).join(", ")]));
    }
    if (gym?.phone) lines.push(row(["Phone", asText(gym.phone)]));
    if (ntn)        lines.push(row(["NTN", asText(ntn)]));
    lines.push("");

    // ── SECTION 2: Report Details ─────────────────────────────────────
    lines.push(row(["REPORT DETAILS"]));
    lines.push(row(["Title", headerTitle]));
    lines.push(row(["Period", formatPeriod(startDate, endDate)]));
    if (notes) lines.push(row(["Notes", notes]));
    lines.push("");

    // ── SECTION 3: Members ────────────────────────────────────────────
    lines.push(row(["MEMBERS"]));
    const header = ["#"];
    if (selectedFields.has("name"))        header.push("Name");
    if (selectedFields.has("cnic"))        header.push("CNIC");
    if (selectedFields.has("phone"))       header.push("Phone");
    if (selectedFields.has("plan"))        header.push("Plan");
    if (selectedFields.has("monthly_fee")) header.push("Monthly Fee (Rs.)");
    if (selectedFields.has("total_paid"))  header.push("Total Paid (Rs.)");
    if (selectedFields.has("join_date"))   header.push("Join Date");
    lines.push(row(header));

    reportRows.forEach((r, i) => {
      const cols: (string | number)[] = [i + 1];
      if (selectedFields.has("name"))        cols.push(r.full_name);
      if (selectedFields.has("cnic"))        cols.push(asText(fmtCnic(r.cnic)));
      if (selectedFields.has("phone"))       cols.push(asText(r.phone ?? ""));
      if (selectedFields.has("plan"))        cols.push(r.plan?.name ?? "");
      if (selectedFields.has("monthly_fee")) cols.push(money(r.monthly_fee));
      if (selectedFields.has("total_paid"))  cols.push(money(r.total_paid));
      if (selectedFields.has("join_date"))   cols.push(r.join_date ?? "");
      lines.push(row(cols));
    });
    lines.push("");

    // ── SECTION 4: Summary ────────────────────────────────────────────
    lines.push(row(["SUMMARY"]));
    lines.push(row(["Total Members", reportRows.length]));
    if (showTax) {
      lines.push(row([taxInclusive ? "Subtotal (excl. tax)" : "Subtotal", money(subtotal)]));
      lines.push(row([`${taxLabel || "Tax"} (${taxRate}%)`, money(taxAmount)]));
      lines.push(row(["Grand Total", money(grandTotal)]));
    } else {
      lines.push(row(["Total Revenue", money(totalRevenue)]));
    }

    // UTF-8 BOM → Excel opens with correct encoding (non-ASCII chars render properly)
    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const safeTitle = headerTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const fname = `${safeTitle}_${startDate}_to_${endDate}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await logComplianceReport({
      memberCount: reportRows.length,
      totalRevenue,
      startDate,
      endDate,
      fields: Array.from(selectedFields),
    });

    toast({ title: "CSV downloaded", description: "Opens cleanly in Excel, Google Sheets, or Numbers" });
  }

  return (
    <>
      <div className="space-y-6 animate-fade-in no-print">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-serif font-normal tracking-tight flex items-center gap-3">
              <FileText className="w-7 h-7 text-primary" /> Compliance Report
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Generate a printable revenue report with selective member inclusion.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button onClick={saveDefaults} variant="outline" size="sm" className="gap-1.5" disabled={savingSettings}>
                <Save className="w-3.5 h-3.5" /> {savingSettings ? "Saving…" : "Save defaults"}
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={generatingPdf}>
                    <Download className="w-3.5 h-3.5" />
                    {generatingPdf ? "Generating…" : "Download"}
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-1">
                  <button
                    type="button"
                    onClick={downloadCSV}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors text-left"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span className="flex-1">CSV</span>
                    <span className="text-[10px] text-muted-foreground">Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={downloadPDF}
                    disabled={generatingPdf}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors text-left disabled:opacity-50"
                  >
                    <FileImage className="w-4 h-4 text-rose-400" />
                    <span className="flex-1">PDF</span>
                    <span className="text-[10px] text-muted-foreground">A4</span>
                  </button>
                </PopoverContent>
              </Popover>
              <Button onClick={generateReport} size="sm" className="gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 max-w-xs text-right">
              Tip: in Firefox / Safari, also uncheck <span className="font-medium text-muted-foreground">"Headers and footers"</span> in the print dialog.
            </p>
          </div>
        </div>

        {/* Report metadata + period — single card */}
        <div className="rounded-2xl border border-sidebar-border bg-card p-4 space-y-4">
          {/* Row 1: Title / NTN / Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Report Title</Label>
              <Input value={headerTitle} onChange={(e) => setHeaderTitle(e.target.value)} placeholder="Revenue Report" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">NTN / Tax Number</Label>
              <Input value={ntn} onChange={(e) => setNtn(e.target.value)} placeholder="e.g. 1234567-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for authorities" />
            </div>
          </div>

          {/* Row 2: Period — preset chips + custom dates inline */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-3 border-t border-sidebar-border/60">
            <div className="flex items-center gap-2 shrink-0">
              <CalendarIcon className="w-4 h-4 text-primary" />
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Period</Label>
            </div>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {RANGE_PRESETS.map((p, i) => (
                <button key={p.label} type="button" onClick={() => applyPreset(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activePreset === i
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                  }`}>{p.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DatePicker value={startDate} onChange={(v) => { setStartDate(v); setActivePreset(4); }} className="!w-36" />
              <span className="text-xs text-muted-foreground">→</span>
              <DatePicker value={endDate} onChange={(v) => { setEndDate(v); setActivePreset(4); }} className="!w-36" />
            </div>
          </div>

          {/* Row 3: Tax — for compliance / tax filing */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-3 border-t border-sidebar-border/60">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">Tax</Label>
            <Input value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)}
              placeholder="Sales Tax / GST"
              className="max-w-[180px]" />
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="decimal" value={taxRate}
                onChange={(e) => setTaxRate(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0"
                className="!w-20 text-right" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
              <input type="checkbox" checked={taxInclusive}
                onChange={(e) => setTaxInclusive(e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer" />
              Prices include tax
            </label>
            <span className="text-[11px] text-muted-foreground/70">
              {taxRate > 0
                ? (taxInclusive ? "Tax extracted from totals" : "Tax added on top")
                : "No tax — set rate to enable"}
            </span>
          </div>
        </div>

        {/* Members + Columns — unified card. Selection list mirrors the print output. */}
        <div className="rounded-2xl border border-sidebar-border bg-card overflow-hidden">
          {/* Top: title + bulk actions */}
          <div className="p-4 border-b border-sidebar-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Members & Columns</p>
              <p className="text-xs text-muted-foreground">
                {selectedIds.size} of {members.length} selected
                <span className="opacity-50"> · </span>
                Total: <span className="text-emerald-400 font-medium">{formatCurrency(totalRevenue)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={selectAllVisible} variant="outline" size="sm">Select all visible</Button>
              <Button onClick={clearAllVisible} variant="outline" size="sm">Clear visible</Button>
            </div>
          </div>

          {/* Column toggle chips — toggle live which fields appear in table below + print */}
          <div className="px-4 py-3 border-b border-sidebar-border flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Columns:</span>
            {ALL_FIELDS.map((f) => (
              <button key={f.key} type="button" onClick={() => toggleField(f.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1 ${
                  selectedFields.has(f.key)
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}>
                {selectedFields.has(f.key) && <Check className="w-3 h-3" />}
                {f.label}
              </button>
            ))}
          </div>

          {/* Search + active-only */}
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-sidebar-border">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name or CNIC…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer" />
              Active members only
            </label>
          </div>

          {/* Member table — rows mirror selected columns (live preview of output) */}
          <div className="max-h-[480px] overflow-y-auto overflow-x-auto">
            {filteredMembers.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">No members match.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-sidebar-border z-10">
                  <tr>
                    <th className="text-left px-3 py-2 w-10"></th>
                    {selectedFields.has("name")        && <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Name</th>}
                    {selectedFields.has("cnic")        && <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">CNIC</th>}
                    {selectedFields.has("phone")       && <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Phone</th>}
                    {selectedFields.has("plan")        && <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>}
                    {selectedFields.has("monthly_fee") && <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Monthly</th>}
                    {selectedFields.has("total_paid")  && <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Paid</th>}
                    {selectedFields.has("join_date")   && <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-sidebar-border/50">
                  {filteredMembers.map((m) => {
                    const checked = selectedIds.has(m.id);
                    const paid = paidByMember[m.id] ?? 0;
                    return (
                      <tr key={m.id} onClick={() => toggleMember(m.id)}
                        className={`cursor-pointer hover:bg-white/[0.02] transition-colors ${checked ? "bg-primary/[0.03]" : ""}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={checked} readOnly
                            className="w-4 h-4 accent-primary cursor-pointer pointer-events-none" />
                        </td>
                        {selectedFields.has("name")        && <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{m.full_name}</td>}
                        {selectedFields.has("cnic")        && <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{m.cnic ?? <span className="italic opacity-60">—</span>}</td>}
                        {selectedFields.has("phone")       && <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{m.phone ?? "—"}</td>}
                        {selectedFields.has("plan")        && <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{m.plan?.name ?? "—"}</td>}
                        {selectedFields.has("monthly_fee") && <td className="px-3 py-2 text-right text-xs text-foreground whitespace-nowrap">{formatCurrency(m.monthly_fee)}</td>}
                        {selectedFields.has("total_paid")  && <td className={`px-3 py-2 text-right text-sm font-semibold tabular-nums whitespace-nowrap ${paid > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>{formatCurrency(paid)}</td>}
                        {selectedFields.has("join_date")   && <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{m.join_date ? formatDate(m.join_date) : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Live preview header (screen only) */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Live Preview</h2>
            <span className="text-xs text-muted-foreground">— exactly how it will print</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>~{Math.max(1, Math.ceil(reportRows.length / 35))} page{reportRows.length / 35 > 1 ? "s" : ""}</span>
            <span className="opacity-50">·</span>
            <span>{reportRows.length} member{reportRows.length !== 1 ? "s" : ""}</span>
            <span className="opacity-50">·</span>
            <span>Total <span className="text-emerald-400 font-medium">{formatCurrency(totalRevenue)}</span></span>
          </div>
        </div>
      </div>

      {/* Print preview — capped height on screen with both-axis scroll, full width on print */}
      <div className="rounded-2xl border border-sidebar-border shadow-2xl bg-white mt-4 max-h-[800px] overflow-auto">
        <PrintReport
          gym={gym}
          ntn={ntn}
          headerTitle={headerTitle}
          notes={notes}
          startDate={startDate}
          endDate={endDate}
          rows={reportRows}
          totalRevenue={totalRevenue}
          fields={selectedFields}
          taxRate={taxRate}
          taxInclusive={taxInclusive}
          taxLabel={taxLabel}
        />
      </div>
    </>
  );
}

// ── Print preview view ──────────────────────────────────────────────────────

function PrintReport({ gym, ntn, headerTitle, notes, startDate, endDate, rows, totalRevenue, fields, taxRate, taxInclusive, taxLabel }: {
  gym: Gym | null;
  ntn: string;
  headerTitle: string;
  notes: string;
  startDate: string;
  endDate: string;
  rows: (Member & { total_paid: number })[];
  totalRevenue: number;
  fields: Set<string>;
  taxRate: number;
  taxInclusive: boolean;
  taxLabel: string;
}) {
  const has = (k: string) => fields.has(k);

  // Tax calc — inclusive: extract tax FROM gross. Exclusive: add tax ON TOP.
  const showTax = taxRate > 0;
  const rate = taxRate / 100;
  const taxAmount = showTax
    ? (taxInclusive ? totalRevenue - totalRevenue / (1 + rate) : totalRevenue * rate)
    : 0;
  const subtotal  = showTax ? (taxInclusive ? totalRevenue - taxAmount : totalRevenue) : totalRevenue;
  const grandTotal = showTax ? (taxInclusive ? totalRevenue : totalRevenue + taxAmount) : totalRevenue;

  return (
    <div id="print-area" className="bg-white text-black p-8 sm:p-10 min-w-[820px] print:min-w-0">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight">{gym?.name ?? "Gym"}</h1>
            {gym?.address && <p className="text-sm">{gym.address}{gym.city ? `, ${gym.city}` : ""}</p>}
            {gym?.phone && <p className="text-xs text-gray-700">Phone: {gym.phone}</p>}
            {ntn && <p className="text-xs text-gray-700">NTN: {ntn}</p>}
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">{headerTitle}</h2>
            <p className="text-sm font-medium">{formatPeriod(startDate, endDate)}</p>
          </div>
          {notes && <p className="text-xs text-gray-700 mt-2 italic">{notes}</p>}
        </div>

        {/* Table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-2 px-2 text-xs uppercase">#</th>
              {has("name")        && <th className="text-left py-2 px-2 text-xs uppercase">Name</th>}
              {has("member_id")   && <th className="text-left py-2 px-2 text-xs uppercase">ID</th>}
              {has("cnic")        && <th className="text-left py-2 px-2 text-xs uppercase">CNIC</th>}
              {has("phone")       && <th className="text-left py-2 px-2 text-xs uppercase">Phone</th>}
              {has("email")       && <th className="text-left py-2 px-2 text-xs uppercase">Email</th>}
              {has("plan")        && <th className="text-left py-2 px-2 text-xs uppercase">Plan</th>}
              {has("monthly_fee") && <th className="text-right py-2 px-2 text-xs uppercase">Monthly Fee</th>}
              {has("total_paid")  && <th className="text-right py-2 px-2 text-xs uppercase">Paid</th>}
              {has("join_date")   && <th className="text-left py-2 px-2 text-xs uppercase">Joined</th>}
              {has("trainer")     && <th className="text-left py-2 px-2 text-xs uppercase">Trainer</th>}
              {has("status")      && <th className="text-left py-2 px-2 text-xs uppercase">Status</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-gray-300">
                <td className="py-1.5 px-2 text-xs">{i + 1}</td>
                {has("name")        && <td className="py-1.5 px-2">{r.full_name}</td>}
                {has("member_id")   && <td className="py-1.5 px-2 font-mono text-xs">{r.member_number ?? "—"}</td>}
                {has("cnic")        && <td className="py-1.5 px-2 font-mono text-xs">{r.cnic ?? "—"}</td>}
                {has("phone")       && <td className="py-1.5 px-2 text-xs">{r.phone ?? "—"}</td>}
                {has("email")       && <td className="py-1.5 px-2 text-xs">{r.email ?? "—"}</td>}
                {has("plan")        && <td className="py-1.5 px-2">{r.plan?.name ?? "—"}</td>}
                {has("monthly_fee") && <td className="py-1.5 px-2 text-right">{formatCurrency(r.monthly_fee)}</td>}
                {has("total_paid")  && <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(r.total_paid)}</td>}
                {has("join_date")   && <td className="py-1.5 px-2 text-xs">{r.join_date ? formatDate(r.join_date) : "—"}</td>}
                {has("trainer")     && <td className="py-1.5 px-2 text-xs">{r.trainer?.full_name ?? "—"}</td>}
                {has("status")      && <td className="py-1.5 px-2 text-xs capitalize">{r.status}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {showTax ? (
              <>
                <tr className="border-t-2 border-black">
                  <td rowSpan={3} colSpan={2} className="py-2 px-2 font-bold uppercase text-xs whitespace-nowrap align-top">
                    Total Members: {rows.length}
                  </td>
                  <td colSpan={Math.max(1, Array.from(fields).length - 2)} className="py-2 px-2 text-right uppercase text-xs">
                    {taxInclusive ? "Subtotal (excl. tax):" : "Subtotal:"}
                  </td>
                  <td className="py-2 px-2 text-right">{formatCurrency(subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={Math.max(1, Array.from(fields).length - 2)} className="py-1 px-2 text-right uppercase text-xs">
                    {taxLabel || "Tax"} ({taxRate}%):
                  </td>
                  <td className="py-1 px-2 text-right">{formatCurrency(taxAmount)}</td>
                </tr>
                <tr className="border-t border-black">
                  <td colSpan={Math.max(1, Array.from(fields).length - 2)} className="py-2 px-2 text-right font-bold uppercase text-xs">
                    Grand Total:
                  </td>
                  <td className="py-2 px-2 text-right font-bold">{formatCurrency(grandTotal)}</td>
                </tr>
              </>
            ) : (
              <tr className="border-t-2 border-black">
                <td colSpan={2} className="py-2 px-2 font-bold uppercase text-xs whitespace-nowrap">
                  Total Members: {rows.length}
                </td>
                <td colSpan={Math.max(1, Array.from(fields).length - 2)} className="py-2 px-2 text-right font-bold uppercase text-xs">
                  Total Revenue:
                </td>
                <td className="py-2 px-2 text-right font-bold">{formatCurrency(totalRevenue)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Footer */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-xs keep-together">
          <div>
            <div className="border-t border-black pt-1 mt-12">
              <p className="text-gray-600">Authorized Signature</p>
            </div>
          </div>
          <div>
            <div className="border-t border-black pt-1 mt-12">
              <p className="text-gray-600">Date</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
