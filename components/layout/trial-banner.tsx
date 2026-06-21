"use client";
import Link from "next/link";
import { Clock, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrialBannerProps {
  trialEndsAt: string | null;
  trialPlan: string | null;
}

export function TrialBanner({ trialEndsAt, trialPlan }: TrialBannerProps) {
  if (!trialEndsAt) return null;

  const daysLeft = Math.ceil(
    (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft <= 0) {
    return (
      <div className="w-full border-b border-red-500/40 bg-red-500/10 py-2.5 px-4 flex items-center justify-center gap-3">
        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
        <span className="text-sm font-semibold text-red-400">
          Your trial has expired. Upgrade to continue using Pulse DMS.
        </span>
        <Button
          asChild
          size="sm"
          className="h-7 px-3 bg-red-500 hover:bg-red-600 text-white text-xs font-bold shrink-0"
        >
          <Link href="/pricing">Upgrade Now</Link>
        </Button>
      </div>
    );
  }

  if (daysLeft <= 3) {
    return (
      <div className="w-full border-b border-amber-500/40 bg-amber-500/10 py-2.5 px-4 flex items-center justify-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-400">
          Trial expires in <strong className="text-amber-300">{daysLeft} {daysLeft === 1 ? "day" : "days"}</strong>. Upgrade to keep access.
        </span>
        <Button
          asChild
          size="sm"
          className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold shrink-0"
        >
          <Link href="/pricing">Upgrade</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full border-b border-primary/20 bg-primary/5 py-2.5 px-4 flex items-center justify-center gap-2.5">
      <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-sm font-semibold text-primary">
        Free trial — <strong className="text-foreground">{daysLeft} days remaining</strong>
      </span>
      <span className="text-muted-foreground/50 text-xs hidden sm:block">·</span>
      <Link
        href="/pricing"
        className="hidden sm:block text-xs font-semibold text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
      >
        Upgrade anytime
      </Link>
    </div>
  );
}
