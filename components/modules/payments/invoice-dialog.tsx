"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp-reminder";
import { buildInvoiceDoc, pkr, amountInWords, planLineItems, formatPeriod, methodLabels } from "@/lib/invoice-pdf";
import { createInvoiceLink } from "@/app/actions/invoices";
import { toast } from "@/hooks/use-toast";
import { Download, MessageCircle } from "lucide-react";
import type { Payment, Gym } from "@/types";

export interface InvoiceData {
  payment: Payment;
  memberName: string;
  memberPhone?: string | null;
  memberNumber?: string | null;
  planName?: string | null;
}

interface InvoiceDialogProps {
  data: InvoiceData | null;
  gym: Pick<Gym, "name" | "address" | "city" | "phone" | "email" | "ntn" | "report_settings"> | null;
  onClose: () => void;
}

// ── Dialog ────────────────────────────────────────────────────────────────────
export function InvoiceDialog({ data, gym, onClose }: InvoiceDialogProps) {
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  if (!data) return null;

  const { payment, memberName, memberPhone, memberNumber, planName } = data;
  const formattedPeriod = formatPeriod(payment.for_period);
  const taxRate = gym?.report_settings?.taxRate ?? 0;
  const taxInc = gym?.report_settings?.taxInclusive ?? false;
  const taxLabel = gym?.report_settings?.taxLabel ?? "Tax";
  const showTax = taxRate > 0 && !taxInc;
  const methodLabel = payment.payment_method ? methodLabels[payment.payment_method] : "—";
  const receiptNo = payment.receipt_number ?? payment.id.slice(0, 8);
  const receiptFilename = `receipt-${receiptNo}.pdf`;
  const gymName = gym?.name ?? "Gym";
  const notes = payment.notes ?? "Thank you for training with us.";

  const contactParts: string[] = [];
  if (gym?.address) contactParts.push(gym.address);
  if (gym?.city) contactParts.push(gym.city);

  const dateDisplay = payment.payment_date
    ? formatDate(payment.payment_date)
    : formatDate(new Date().toISOString());

  async function downloadPdf() {
    const doc = await buildInvoiceDoc({ payment, memberName, memberPhone, memberNumber, planName }, gym, formattedPeriod);
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = receiptFilename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function handleDownload() {
    setIsPdfLoading(true);
    try {
      await downloadPdf();
    } catch (err) {
      toast({ title: "Failed to generate PDF", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsPdfLoading(false);
    }
  }

  // Generate a secure 7-day receipt link (server-side) and open WhatsApp with a
  // message that includes it — so the member gets a real, downloadable receipt.
  async function handleWhatsApp() {
    if (!memberPhone) return;
    setIsSharing(true);
    try {
      const res = await createInvoiceLink(payment.id);
      if ("error" in res) {
        toast({ title: "Couldn't create receipt link", description: res.error, variant: "destructive" });
        return;
      }
      const firstName = memberName.split(" ")[0];
      const planPart = planName ? ` for *${planName}*` : "";
      const message =
        `Assalam o Alaikum ${firstName},\n\n` +
        `Your payment of *${pkr(Number(payment.total_amount))}*${planPart} has been received. ` +
        `You can download your receipt from the link below — this link will expire in 7 days:\n${res.url}\n\n` +
        `Thank you for choosing ${gymName}!`;
      const waUrl = whatsappUrl(memberPhone, message);
      if (!waUrl) {
        toast({ title: "Invalid phone number", variant: "destructive" });
        return;
      }
      window.open(waUrl, "_blank");
    } catch (err) {
      toast({ title: "Failed to share receipt", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSharing(false);
    }
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
              {gym?.ntn && <p className="text-[12px] text-slate-500">NTN: {gym.ntn}</p>}
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
            <span className="text-[12px] font-bold tracking-wide">TOTAL PAID</span>
            <span className="text-[18px] font-bold">{pkr(Number(payment.total_amount))}</span>
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
          <Button variant="outline" className="flex-1 gap-2" disabled={isPdfLoading || isSharing} onClick={handleDownload}>
            <Download className="w-4 h-4" />
            {isPdfLoading ? "Generating…" : "Download PDF"}
          </Button>
          {memberPhone && (
            <Button
              className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isPdfLoading || isSharing}
              onClick={handleWhatsApp}
            >
              <MessageCircle className="w-4 h-4" />
              {isSharing ? "Preparing…" : "WhatsApp"}
            </Button>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
