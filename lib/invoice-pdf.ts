// Shared invoice/receipt PDF builder. Runs in BOTH the browser (preview +
// download) and Node (server-side generation for the 7-day WhatsApp share
// link), so the shared file the member receives is byte-identical to the
// on-screen preview. Pure jsPDF text/vector — no DOM or canvas.
import { formatDate } from "@/lib/utils";
import type { jsPDF } from "jspdf";
import type { Gym, Payment, PaymentMethod } from "@/types";

export type InvoiceGym = Pick<Gym, "name" | "address" | "city" | "phone" | "email" | "ntn" | "report_settings">;

export interface InvoicePdfData {
  payment: Payment;
  memberName: string;
  memberPhone?: string | null;
  memberNumber?: string | null;
  planName?: string | null;
}

export const methodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  card: "Card",
  other: "Other",
};

export function formatPeriod(forPeriod: string | null | undefined): string {
  if (!forPeriod) return "";
  const parts = forPeriod.split("-");
  if (parts.length < 2) return "";
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return "";
  try {
    return new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export function amountInWords(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "Zero Rupees Only";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tensArr = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
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

export function pkr(n: number): string {
  return `PKR ${Number(n).toLocaleString("en-US")}`;
}

// Itemized plan lines for the receipt. Uses the plan_breakdown snapshotted on
// the payment (multi-plan members → one line per plan). Falls back to a single
// "Membership Fee" line for old payments without a breakdown, or when the
// breakdown's prices don't reconcile with the charged amount (e.g. fee edited).
export function planLineItems(payment: Payment): { name: string; price: number }[] {
  const breakdown = (payment as Payment & { plan_breakdown?: { name: string; price: number }[] | null }).plan_breakdown;
  if (Array.isArray(breakdown) && breakdown.length > 0) {
    const sum = breakdown.reduce((s, p) => s + Number(p.price), 0);
    if (Math.round(sum) === Math.round(Number(payment.amount))) {
      return breakdown.map((p) => ({ name: p.name, price: Number(p.price) }));
    }
  }
  return [{ name: "Membership Fee", price: Number(payment.amount) }];
}

// Resolve the jsPDF constructor across environments: bundlers expose it as the
// default export, Node's ESM interop exposes it as a named `jsPDF` export.
async function newDoc(format: [number, number] | "a4" = "a4"): Promise<jsPDF> {
  const mod = (await import("jspdf")) as unknown as {
    jsPDF?: new (o?: object) => jsPDF;
    default?: (new (o?: object) => jsPDF) & { jsPDF?: new (o?: object) => jsPDF };
  };
  const Ctor = mod.jsPDF ?? mod.default?.jsPDF ?? mod.default;
  if (!Ctor) throw new Error("jsPDF constructor not found");
  return new Ctor({ unit: "pt", format, orientation: "portrait" });
}

/**
 * Build the receipt PDF document. Caller decides the output:
 *   browser → doc.output("blob")
 *   server  → doc.output("arraybuffer")
 */
export async function buildInvoiceDoc(
  data: InvoicePdfData,
  gym: InvoiceGym | null,
  formattedPeriod: string,
): Promise<jsPDF> {
  const ML = 14;    // left margin
  const MR = 236;   // right margin
  const CX = (ML + MR) / 2;  // center = 125
  const KV = ML + 55;         // key-value colon column

  const BLACK: [number, number, number] = [0, 0, 0];
  const GRAY: [number, number, number] = [40, 40, 40];
  const LGRAY: [number, number, number] = [130, 130, 130];

  const { payment, memberName, memberPhone, memberNumber, planName } = data;
  const gymName = gym?.name ?? "Gym";
  const taxRate = gym?.report_settings?.taxRate ?? 0;
  const taxInc = gym?.report_settings?.taxInclusive ?? false;
  const taxLabel = gym?.report_settings?.taxLabel ?? "Tax";
  const showTax = taxRate > 0 && !taxInc;
  const taxAmt = showTax ? Math.round((Number(payment.total_amount) * taxRate) / 100) : 0;
  const methodLabel = payment.payment_method ? methodLabels[payment.payment_method] : "—";
  const receiptNo = payment.receipt_number ?? payment.id.slice(0, 8);
  const dateStr = payment.payment_date
    ? formatDate(payment.payment_date)
    : formatDate(new Date().toISOString());
  const statusText = payment.status.charAt(0).toUpperCase() + payment.status.slice(1);
  const isAdmission = payment.for_period === "admission";

  // Pre-calculate items so we can size the page dynamically
  const items = isAdmission
    ? [{ name: "Admission / Signup Fee", price: Number(payment.amount) }]
    : planLineItems(payment);

  // Height grows with extra plan items (~43pt each beyond the first)
  const pageHeight = 555 + Math.max(0, items.length - 1) * 43;
  const doc = await newDoc([250, pageHeight]);

  // Format number with commas (no currency prefix — used in table rows)
  function num(n: number | string): string {
    return Number(n).toLocaleString("en-US");
  }

  let y = 0;

  // Dashed divider
  function dashed() {
    y += 8;
    doc.setDrawColor(...LGRAY);
    doc.setLineWidth(0.7);
    (doc as unknown as { setLineDash: (pattern: number[], phase?: number) => void })
      .setLineDash([2, 3], 0);
    doc.line(ML, y, MR, y);
    (doc as unknown as { setLineDash: (pattern: number[], phase?: number) => void })
      .setLineDash([], 0);
    y += 15;
  }

  // Left-aligned key : value row
  function kv(label: string, value: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(label, ML, y);
    doc.text(`: ${value}`, KV, y);
    y += 10;
  }

  // Label left, value right-aligned
  function kvRight(label: string, value: string, bold = false) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(label, ML, y);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...BLACK);
    doc.text(value, MR, y, { align: "right" });
    y += 10;
  }

  // ── HEADER (centered) ──────────────────────────────────────────────────────
  y = 20;

  dashed();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BLACK);
  doc.text(gymName, CX, y, { align: "center" });
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text("Membership Invoice", CX, y, { align: "center" });
  y += 10;

  if (gym?.email) {
    doc.setFontSize(7.5);
    doc.text(gym.email, CX, y, { align: "center" });
    y += 9;
  }

  if (gym?.phone) {
    doc.setFontSize(7.5);
    doc.text(`Phone#: ${gym.phone}`, CX, y, { align: "center" });
    y += 9;
  }

  if (gym?.ntn) {
    doc.setFontSize(7.5);
    doc.text(`NTN: ${gym.ntn}`, CX, y, { align: "center" });
    y += 9;
  }

  const addrParts = [gym?.address, gym?.city].filter(Boolean) as string[];
  if (addrParts.length > 0) {
    doc.setFontSize(7.5);
    doc.text(addrParts.join(", "), CX, y, { align: "center" });
    y += 9;
  }

  y += 2;
  dashed();

  // ── INVOICE INFO ───────────────────────────────────────────────────────────
  kv("Invoice #", receiptNo);
  kv("Date Time", dateStr);
  if (memberPhone) kv("Phone", memberPhone);
  kv("Member", memberName);
  if (memberNumber) kv("MID", memberNumber);

  y += 2;
  dashed();

  // ── PLAN & LINE ITEMS ──────────────────────────────────────────────────────
  if (planName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(planName, ML, y);
    y += 11;
  }

  // Table header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("#", ML, y);
  doc.text("Description", ML + 14, y);
  doc.text("Amount", MR, y, { align: "right" });
  y += 9;

  // Max width for description text (leaves room for # col + amount col)
  const DESC_MAX = MR - (ML + 14) - 32;

  items.forEach((item, idx) => {
    // Main row — wrap long plan names
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(String(idx + 1), ML, y);
    const desc = (!isAdmission && formattedPeriod)
      ? `${item.name} (${formattedPeriod})`
      : item.name;
    const descLines = doc.splitTextToSize(desc, DESC_MAX) as string[];
    doc.text(descLines, ML + 14, y);
    doc.text(num(item.price), MR, y, { align: "right" });
    y += descLines.length > 1 ? descLines.length * 9 : 9;
    y += 9;

    // Sub-rows: Discount (only on first item to avoid double-counting)
    if (idx === 0 && Number(payment.discount) > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY);
      doc.text("Discount", ML + 14, y);
      doc.text(num(payment.discount), MR, y, { align: "right" });
      y += 8;
    }
    if (idx === 0 && Number(payment.late_fee) > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY);
      doc.text("Late Fee", ML + 14, y);
      doc.text(`+${num(payment.late_fee)}`, MR, y, { align: "right" });
      y += 8;
    }

    // Total + Paid sub-rows
    const itemTotal = idx === 0
      ? Number(payment.total_amount)
      : item.price;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text("Total", ML + 14, y);
    doc.text(num(itemTotal), MR, y, { align: "right" });
    y += 8;
    doc.text("Paid", ML + 14, y);
    doc.text(num(itemTotal), MR, y, { align: "right" });
    y += 10;
  });

  y += 2;
  dashed();

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  kvRight("Sub Total", num(Number(payment.amount)));
  if (showTax) {
    kvRight(`${taxLabel} (${taxRate}%)`, num(taxAmt));
  } else {
    kvRight("Tax", "0");
  }
  kvRight("Discount", Number(payment.discount) > 0 ? `-${num(Number(payment.discount))}` : "0");

  y += 2;
  dashed();

  // Grand Total (bold)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text("Grand Total", ML, y + 1);
  doc.text(pkr(Number(payment.total_amount)), MR, y + 1, { align: "right" });
  y += 13;

  y += 2;
  dashed();

  // ── PAYMENT BREAKDOWN ──────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text("PAYMENT BREAKDOWN", ML, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text(`1. ${dateStr} - ${methodLabel}`, ML, y);
  doc.text(num(Number(payment.total_amount)), MR, y, { align: "right" });
  y += 10;

  y += 2;
  dashed();

  // Paid Amount + Status
  kvRight("Paid Amount", num(Number(payment.total_amount)));
  kvRight("Payment Status", statusText, true);

  y += 2;
  dashed();

  // ── AMOUNT IN WORDS ────────────────────────────────────────────────────────
  const words = amountInWords(Number(payment.total_amount));
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...BLACK);
  // Wrap long words text to fit narrow column
  const wordLines = doc.splitTextToSize(`Amount: ${words}`, MR - ML) as string[];
  doc.text(wordLines, ML, y);
  y += wordLines.length * 9 + 4;

  dashed();

  // ── THANK YOU ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("Thank you for your business!", CX, y, { align: "center" });
  y += 13;
  doc.text("We appreciate your membership.", CX, y, { align: "center" });
  y += 10;

  dashed();

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...LGRAY);
  doc.text("Powered by Pulse GMS", CX, y, { align: "center" });

  return doc;
}
