import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MessageCircle, ArrowRight, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Thanks — we'll be in touch | Pulse GMS",
  description:
    "Thank you for your interest in Pulse. Our team will review your application and get back to you within 24 hours.",
};

const PULSE_WHATSAPP = "923193454321";
const PRE_FILLED_MSG = "Hi, I just submitted my gym onboarding form. Looking forward to hearing back!";

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const params = await searchParams;
  const phone = (params.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20);
  const whatsappHref = `https://wa.me/${PULSE_WHATSAPP}?text=${encodeURIComponent(PRE_FILLED_MSG)}`;

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-sidebar-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-serif text-xl tracking-tight">Pulse</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-6 sm:p-10 text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 sm:w-11 sm:h-11 text-primary" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-serif tracking-tight mb-3">
            Thank you for your interest in Pulse!
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-6">
            Our team will review your details and get back to you within 24 hours via WhatsApp.
          </p>

          {phone && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-sidebar-border bg-card px-4 py-2.5 mb-6">
              <span className="text-xs text-muted-foreground">We&apos;ll contact you on</span>
              <span className="text-sm font-semibold tabular-nums">{phone}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow-md shadow-primary/20 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Message us on WhatsApp
            </a>
            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-sidebar-border hover:border-primary/40 text-sm font-semibold transition-colors"
            >
              Back to pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/70 mt-6">
          Wrong number or details? Just message us on WhatsApp and we&apos;ll update it.
        </p>
      </main>
    </div>
  );
}
