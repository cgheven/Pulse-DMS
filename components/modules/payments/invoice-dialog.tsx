"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp-reminder";
import { toast } from "@/hooks/use-toast";
import { Download, MessageCircle } from "lucide-react";
import type { Payment, Gym, PaymentMethod, PaymentStatus } from "@/types";

export interface InvoiceData {
  payment: Payment;
  memberName: string;
  memberPhone?: string | null;
  planName?: string | null;
}

interface InvoiceDialogProps {
  data: InvoiceData | null;
  gym: Pick<Gym, "name" | "address" | "city" | "phone" | "ntn" | "report_settings"> | null;
  onClose: () => void;
}

const methodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  card: "Card",
  other: "Other",
};

type StatusMeta = {
  label: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  pdfFill: [number, number, number];
  pdfBorder: [number, number, number];
  pdfText: [number, number, number];
};

const statusMeta: Record<PaymentStatus, StatusMeta> = {
  paid: {
    label: "PAID",
    badgeBg: "bg-emerald-50", badgeBorder: "border-emerald-300", badgeText: "text-slate-800",
    pdfFill: [240, 253, 244], pdfBorder: [134, 239, 172], pdfText: [15, 17, 38],
  },
  pending: {
    label: "PENDING",
    badgeBg: "bg-amber-50", badgeBorder: "border-amber-300", badgeText: "text-slate-800",
    pdfFill: [255, 251, 235], pdfBorder: [252, 211, 77], pdfText: [15, 17, 38],
  },
  overdue: {
    label: "OVERDUE",
    badgeBg: "bg-rose-50", badgeBorder: "border-rose-300", badgeText: "text-slate-800",
    pdfFill: [255, 241, 242], pdfBorder: [252, 165, 165], pdfText: [15, 17, 38],
  },
  refunded: {
    label: "REFUNDED",
    badgeBg: "bg-sky-50", badgeBorder: "border-sky-300", badgeText: "text-slate-800",
    pdfFill: [240, 249, 255], pdfBorder: [125, 211, 252], pdfText: [15, 17, 38],
  },
  waived: {
    label: "WAIVED",
    badgeBg: "bg-slate-50", badgeBorder: "border-slate-300", badgeText: "text-slate-800",
    pdfFill: [248, 248, 250], pdfBorder: [200, 203, 215], pdfText: [15, 17, 38],
  },
};

function formatPeriod(forPeriod: string | null | undefined): string {
  if (!forPeriod) return "";
  const parts = forPeriod.split("-");
  if (parts.length < 2) return "";
  const year  = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return "";
  try {
    return new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  } catch { return ""; }
}

function amountInWords(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "Zero Rupees Only";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tensArr = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function words(num: number): string {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return tensArr[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + words(num % 100) : "");
    if (num < 100000) return words(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + words(num % 1000) : "");
    if (num < 10000000) return words(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + words(num % 100000) : "");
    return words(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + words(num % 10000000) : "");
  }
  return words(rounded) + " Rupees Only";
}

function pkr(n: number): string {
  return `PKR ${Number(n).toLocaleString("en-PK")}`;
}

// Itemized plan lines for the receipt. Uses the plan_breakdown snapshotted on
// the payment (multi-plan members → one line per plan). Falls back to a single
// "Membership Fee" line for old payments without a breakdown, or when the
// breakdown's prices don't reconcile with the charged amount (e.g. fee edited).
function planLineItems(payment: Payment): { name: string; price: number }[] {
  const breakdown = (payment as Payment & { plan_breakdown?: { name: string; price: number }[] | null }).plan_breakdown;
  if (Array.isArray(breakdown) && breakdown.length > 0) {
    const sum = breakdown.reduce((s, p) => s + Number(p.price), 0);
    if (Math.round(sum) === Math.round(Number(payment.amount))) {
      return breakdown.map((p) => ({ name: p.name, price: Number(p.price) }));
    }
  }
  return [{ name: "Membership Fee", price: Number(payment.amount) }];
}

async function generatePdfBlob(
  data: InvoiceData,
  gym: Pick<Gym, "name" | "address" | "city" | "phone" | "ntn" | "report_settings"> | null,
  formattedPeriod: string
): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  const W  = 595.28;
  const ML = 48;
  const MR = 547;

  const DARK:  [number, number, number] = [15,  17,  38];
  const GRAY:  [number, number, number] = [120, 125, 148];
  const LGRAY: [number, number, number] = [210, 213, 228];

  const { payment, memberName, planName } = data;
  const gymName     = gym?.name ?? "Gym";
  const taxRate     = gym?.report_settings?.taxRate      ?? 0;
  const taxInc      = gym?.report_settings?.taxInclusive ?? false;
  const taxLabel    = gym?.report_settings?.taxLabel     ?? "Tax";
  const showTax     = taxRate > 0 && !taxInc;
  const methodLabel = payment.payment_method ? methodLabels[payment.payment_method] : "—";
  const receiptNo   = payment.receipt_number ?? payment.id.slice(0, 8);
  const dateStr     = payment.payment_date
    ? formatDate(payment.payment_date)
    : formatDate(new Date().toISOString());
  const notes  = payment.notes ?? "Thank you for training with us.";
  const status = statusMeta[payment.status];

  let y = 0;

  // helpers ──────────────────────────────────────────────────────────────────
  function divider() {
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.5);
    doc.line(ML, y, MR, y);
    y += 14;
  }

  function sectionLabel(text: string, x = ML) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(text, x, y);
    y += 15;
  }

  function sectionValue(text: string, size = 12, x = ML, color: [number, number, number] = DARK) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(text, x, y);
  }

  // ── HEADER ────────────────────────────────────────────────────────────────
  y = 44;

  // Generated by — top right
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(190, 193, 210);
  doc.text("Generated by Pulse GMS", MR, 22, { align: "right" });

  // Gym name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text(gymName, ML, y);
  y += 15;

  // Contact lines
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  const addrParts = [gym?.address, gym?.city].filter(Boolean) as string[];
  if (addrParts.length > 0) { doc.text(addrParts.join(", "), ML, y); y += 13; }
  if (gym?.phone) { doc.text(gym.phone, ML, y); y += 13; }
  if (gym?.ntn)   { doc.text(`NTN: ${gym.ntn}`, ML, y); y += 13; }

  y += 8;
  divider();

  // ── RECEIPT ID / DATE (two columns) ──────────────────────────────────────
  const MID = ML + (MR - ML) / 2 + 10;

  sectionLabel("RECEIPT ID");
  const labelY = y;
  sectionValue(receiptNo, 12);
  y = labelY - 15;

  // Date column
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text("DATE", MID, y);
  y += 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text(dateStr, MID, y);

  y += 16;
  divider();

  // ── MEMBER ────────────────────────────────────────────────────────────────
  sectionLabel("MEMBER");
  sectionValue(memberName, 13);
  y += 16;
  divider();

  // ── PLAN DETAILS ──────────────────────────────────────────────────────────
  sectionLabel("PLAN DETAILS");
  if (planName) {
    sectionValue(planName, 13);
    y += 15;
  }
  if (formattedPeriod) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text(`Period: ${formattedPeriod}`, ML, y);
    y += 13;
  }
  y += 4;
  divider();

  // ── DESCRIPTION / AMOUNT ──────────────────────────────────────────────────
  // Column headers (bold, not small-caps)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Description", ML, y);
  doc.text("Amount", MR, y, { align: "right" });
  y += 14;

  // Plan line items (one per plan for multi-plan members)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  for (const item of planLineItems(payment)) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.text(item.name, ML, y);
    doc.text(pkr(item.price), MR, y, { align: "right" });
    y += 14;
  }

  if (Number(payment.discount) > 0) {
    doc.setTextColor(...DARK);
    doc.text("Discount", ML, y);
    doc.setTextColor(22, 163, 74);
    doc.text(`-${pkr(payment.discount)}`, MR, y, { align: "right" });
    y += 14;
  }
  if (Number(payment.late_fee) > 0) {
    doc.setTextColor(...DARK);
    doc.text("Late Fee", ML, y);
    doc.setTextColor(200, 45, 45);
    doc.text(`+${pkr(payment.late_fee)}`, MR, y, { align: "right" });
    y += 14;
  }
  if (showTax) {
    const taxAmt = Math.round((payment.total_amount * taxRate) / 100);
    doc.setTextColor(...DARK);
    doc.text(`${taxLabel} (${taxRate}%)`, ML, y);
    doc.setTextColor(...DARK);
    doc.text(pkr(taxAmt), MR, y, { align: "right" });
    y += 14;
  }

  y += 4;
  divider();

  // ── TOTAL PAID ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text("TOTAL PAID", ML, y + 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text(pkr(Number(payment.total_amount)), MR, y + 6, { align: "right" });

  y += 22;
  divider();

  // ── AMOUNT IN WORDS ───────────────────────────────────────────────────────
  sectionLabel("AMOUNT IN WORDS");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(amountInWords(Number(payment.total_amount)), ML, y);
  y += 16;
  divider();

  // ── PAYMENT METHOD / STATUS (two columns) ────────────────────────────────
  sectionLabel("PAYMENT METHOD");
  const pmY = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(methodLabel, ML, y);
  y = pmY - 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text("STATUS", MID, y);
  y += 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  const statusText = payment.status.charAt(0).toUpperCase() + payment.status.slice(1);
  doc.text(statusText, MID, y);

  y += 16;
  divider();

  // ── THANK YOU ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(160, 165, 185);
  doc.text(notes, (ML + MR) / 2, y, { align: "center" });

  y += 22;


  return doc.output("blob");
}

// ── Dialog ────────────────────────────────────────────────────────────────────
export function InvoiceDialog({ data, gym, onClose }: InvoiceDialogProps) {
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  if (!data) return null;

  const { payment, memberName, memberPhone, planName } = data;
  const formattedPeriod = formatPeriod(payment.for_period);
  const taxRate  = gym?.report_settings?.taxRate      ?? 0;
  const taxInc   = gym?.report_settings?.taxInclusive ?? false;
  const taxLabel = gym?.report_settings?.taxLabel     ?? "Tax";
  const showTax  = taxRate > 0 && !taxInc;
  const methodLabel     = payment.payment_method ? methodLabels[payment.payment_method] : "—";
  const receiptNo       = payment.receipt_number ?? payment.id.slice(0, 8);
  const receiptFilename = `receipt-${receiptNo}.pdf`;
  const gymName         = gym?.name ?? "Gym";
  const notes           = payment.notes ?? "Thank you for training with us.";
  const status          = statusMeta[payment.status];

  const contactParts: string[] = [];
  if (gym?.address) contactParts.push(gym.address);
  if (gym?.city)    contactParts.push(gym.city);

  const dateDisplay = payment.payment_date
    ? formatDate(payment.payment_date)
    : formatDate(new Date().toISOString());

  async function downloadPdf() {
    const blob = await generatePdfBlob(data!, gym, formattedPeriod);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = receiptFilename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function handleDownload() {
    setIsPdfLoading(true);
    try { await downloadPdf(); }
    catch (err) { toast({ title: "Failed to generate PDF", description: (err as Error).message, variant: "destructive" }); }
    finally { setIsPdfLoading(false); }
  }

  async function handleWhatsApp() {
    if (!memberPhone) return;
    const message =
      `*Payment Receipt* — ${gymName}\n` +
      `Member: ${memberName}\n` +
      `Period: ${formattedPeriod || "—"}\n` +
      `Amount: ${pkr(Number(payment.total_amount))}\n` +
      `Method: ${methodLabel}\n` +
      `Receipt: ${receiptNo}\n` +
      notes;
    const waUrl = whatsappUrl(memberPhone, message);
    if (!waUrl) { toast({ title: "Invalid phone number", variant: "destructive" }); return; }
    setIsPdfLoading(true);
    try { await downloadPdf(); window.open(waUrl, "_blank"); }
    catch (err) { toast({ title: "Failed to generate PDF", description: (err as Error).message, variant: "destructive" }); }
    finally { setIsPdfLoading(false); }
  }

  // Reusable section label
  function SectionLabel({ children }: { children: string }) {
    return (
      <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase mb-2.5">
        {children}
      </p>
    );
  }

  const D = () => <div className="border-t border-slate-200" />;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogTitle className="sr-only">Payment Receipt</DialogTitle>

        {/* Paper */}
        <div className="bg-white max-h-[88vh] overflow-y-auto text-[#0F1126]">

          {/* ── Header: gym info + payment status badge ── */}
          <div className="px-6 pt-4 pb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-[22px] font-bold leading-tight tracking-tight">{gymName}</p>
              {contactParts.length > 0 && (
                <p className="text-[12px] text-slate-500 mt-1">{contactParts.join(", ")}</p>
              )}
              {gym?.phone && <p className="text-[12px] text-slate-500">{gym.phone}</p>}
              {gym?.ntn   && <p className="text-[12px] text-slate-500">NTN: {gym.ntn}</p>}
            </div>
            <span className="text-[9px] text-slate-300 shrink-0 mt-1">Generated by Pulse GMS</span>
          </div>

          <D />

          {/* ── Receipt ID / Date ── */}
          <div className="px-6 py-3 grid grid-cols-2 gap-4">
            <div>
              <SectionLabel>Receipt ID</SectionLabel>
              <p className="text-[13px] font-bold">{receiptNo}</p>
            </div>
            <div>
              <SectionLabel>Date</SectionLabel>
              <p className="text-[13px] font-bold">{dateDisplay}</p>
            </div>
          </div>

          <D />

          {/* ── Member ── */}
          <div className="px-6 py-3">
            <SectionLabel>Member</SectionLabel>
            <p className="text-[14px] font-bold">{memberName}</p>
          </div>

          <D />

          {/* ── Plan details ── */}
          <div className="px-6 py-3">
            <SectionLabel>Plan Details</SectionLabel>
            {planName && <p className="text-[14px] font-bold">{planName}</p>}
            {formattedPeriod && (
              <p className="text-[12px] text-slate-400 mt-0.5">Period: {formattedPeriod}</p>
            )}
          </div>

          <D />

          {/* ── Description / Amount ── */}
          <div className="px-6 py-3">
            <div className="flex justify-between mb-2.5">
              <span className="text-[12px] font-bold">Description</span>
              <span className="text-[12px] font-bold">Amount</span>
            </div>
            <div className="space-y-1.5">
              {planLineItems(payment).map((item, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className="text-[12px] text-slate-700 min-w-0 truncate">{item.name}</span>
                  <span className="text-[12px] text-slate-700 shrink-0">{pkr(item.price)}</span>
                </div>
              ))}
              {Number(payment.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[12px] text-slate-500">Discount</span>
                  <span className="text-[12px] text-emerald-600 font-medium">-{pkr(Number(payment.discount))}</span>
                </div>
              )}
              {Number(payment.late_fee) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[12px] text-slate-500">Late Fee</span>
                  <span className="text-[12px] text-rose-500 font-medium">+{pkr(Number(payment.late_fee))}</span>
                </div>
              )}
              {showTax && (
                <div className="flex justify-between">
                  <span className="text-[12px] text-slate-500">{taxLabel} ({taxRate}%)</span>
                  <span className="text-[12px] text-slate-700">
                    {pkr(Math.round((payment.total_amount * taxRate) / 100))}
                  </span>
                </div>
              )}
            </div>
          </div>

          <D />

          {/* ── Total paid ── */}
          <div className="px-6 py-3.5 flex justify-between items-center">
            <span className="text-[14px] font-bold tracking-wide">TOTAL PAID</span>
            <span className="text-[26px] font-bold">{pkr(Number(payment.total_amount))}</span>
          </div>

          <D />

          {/* ── Amount in words ── */}
          <div className="px-6 py-3">
            <SectionLabel>Amount in Words</SectionLabel>
            <p className="text-[13px] text-slate-800">{amountInWords(Number(payment.total_amount))}</p>
          </div>

          <D />

          {/* ── Payment method + Status ── */}
          <div className="px-6 py-3 grid grid-cols-2 gap-4">
            <div>
              <SectionLabel>Payment Method</SectionLabel>
              <p className="text-[13px] font-bold">{methodLabel}</p>
            </div>
            <div>
              <SectionLabel>Status</SectionLabel>
              <p className="text-[13px] font-bold capitalize">{payment.status}</p>
            </div>
          </div>

          <D />

          {/* ── Thank you ── */}
          <div className="px-6 py-4 text-center">
            <p className="text-[13px] italic text-slate-400 tracking-wide">{notes}</p>
          </div>


        </div>

        {/* ── Buttons ── */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-sidebar-border bg-card">
          <Button variant="outline" className="flex-1 gap-2" disabled={isPdfLoading} onClick={handleDownload}>
            <Download className="w-4 h-4" />
            {isPdfLoading ? "Generating…" : "Download PDF"}
          </Button>
          {memberPhone && (
            <Button
              className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isPdfLoading}
              onClick={handleWhatsApp}
            >
              <MessageCircle className="w-4 h-4" />
              {isPdfLoading ? "Generating…" : "WhatsApp"}
            </Button>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
