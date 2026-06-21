"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MailCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { verifyRegistrationOTP, resendRegistrationOTP } from "@/app/actions/registration";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  // Finding 4 fix: token is no longer read from the URL query string.
  // The server action reads it from the HttpOnly cookie automatically.

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Start cooldown countdown on mount
  useEffect(() => {
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const submitOTP = useCallback(
    async (otp: string) => {
      if (otp.length !== OTP_LENGTH) return;
      setLoading(true);

      // Finding 4 fix: no token argument — server action reads cookie.
      const result = await verifyRegistrationOTP(otp);

      if (result.error) {
        toast({ title: "Verification failed", description: result.error, variant: "destructive" });
        // Clear digits on error
        setDigits(Array(OTP_LENGTH).fill(""));
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
        setLoading(false);
        return;
      }

      setVerified(true);
      toast({ title: "Account created!", description: "Redirecting to sign in…" });

      setTimeout(() => {
        router.push("/login?registered=1");
      }, 1500);
    },
    [router]
  );

  function handleDigitInput(index: number, value: string) {
    // Handle paste of multiple digits
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (cleaned.length === 0) return;
      const newDigits = [...digits];
      for (let i = 0; i < cleaned.length && index + i < OTP_LENGTH; i++) {
        newDigits[index + i] = cleaned[i];
      }
      setDigits(newDigits);
      const nextFocus = Math.min(index + cleaned.length, OTP_LENGTH - 1);
      setTimeout(() => inputRefs.current[nextFocus]?.focus(), 0);
      if (newDigits.every((d) => d !== "")) {
        submitOTP(newDigits.join(""));
      }
      return;
    }

    const char = value.replace(/\D/g, "");
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    if (char && index < OTP_LENGTH - 1) {
      setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
    }

    if (newDigits.every((d) => d !== "")) {
      submitOTP(newDigits.join(""));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = "";
        setDigits(newDigits);
      } else if (index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = "";
        setDigits(newDigits);
        setTimeout(() => inputRefs.current[index - 1]?.focus(), 0);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, index: number) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const newDigits = [...digits];
    for (let i = 0; i < pasted.length && index + i < OTP_LENGTH; i++) {
      newDigits[index + i] = pasted[i];
    }
    setDigits(newDigits);
    const nextFocus = Math.min(index + pasted.length, OTP_LENGTH - 1);
    setTimeout(() => inputRefs.current[nextFocus]?.focus(), 0);
    if (newDigits.every((d) => d !== "")) {
      submitOTP(newDigits.join(""));
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);

    // Finding 2/5 fix: no token or ipAddress argument — all enforcement is server-side.
    const result = await resendRegistrationOTP();

    setResending(false);
    if (result.error) {
      toast({ title: "Failed to resend", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Code resent", description: "A new 6-digit code has been sent to your email." });
    setResendCooldown(RESEND_COOLDOWN);
    setDigits(Array(OTP_LENGTH).fill(""));
    setTimeout(() => inputRefs.current[0]?.focus(), 50);

    // Restart cooldown
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function handleManualSubmit() {
    const otp = digits.join("");
    if (otp.length !== OTP_LENGTH) {
      toast({ title: "Incomplete code", description: "Please enter all 6 digits.", variant: "destructive" });
      return;
    }
    submitOTP(otp);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-fade-up">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h1 className="font-serif text-3xl text-foreground tracking-tight">Pulse DMS</h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
            Dealer Management System
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-sidebar-border bg-card p-8 shadow-2xl">
          {verified ? (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <MailCheck className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Account created!</h2>
              <p className="text-sm text-muted-foreground">Redirecting you to sign in…</p>
              <Loader2 className="w-4 h-4 text-primary animate-spin mt-4" />
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-foreground">Check your email</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  We sent a 6-digit code to your email address. Enter it below to verify your account.
                </p>
              </div>

              {/* OTP Input Boxes */}
              <div className="flex gap-2 justify-center mb-6">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={digit}
                    disabled={loading}
                    onChange={(e) => handleDigitInput(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={(e) => handlePaste(e, index)}
                    onFocus={(e) => e.target.select()}
                    className={[
                      "w-11 h-12 text-center text-xl font-bold rounded-lg border bg-background/50",
                      "transition-colors outline-none",
                      "focus:border-primary/50 focus:ring-2 focus:ring-primary/20",
                      digit ? "border-primary/30" : "border-sidebar-border",
                      "text-foreground disabled:opacity-50 disabled:cursor-not-allowed",
                    ].join(" ")}
                    aria-label={`Digit ${index + 1}`}
                    autoComplete="one-time-code"
                    autoFocus={index === 0}
                  />
                ))}
              </div>

              {/* Submit button */}
              <Button
                type="button"
                disabled={loading || digits.some((d) => !d)}
                onClick={handleManualSubmit}
                className="w-full h-10 bg-primary text-white font-semibold hover:bg-primary/90 transition-all duration-200"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                ) : (
                  "Verify email"
                )}
              </Button>

              {/* Resend */}
              <div className="mt-5 text-center">
                {resendCooldown > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Resend code in{" "}
                    <span className="text-primary font-semibold tabular-nums">{resendCooldown}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
                  >
                    {resending ? (
                      <span className="flex items-center gap-1 justify-center">
                        <Loader2 className="w-3 h-3 animate-spin" /> Sending…
                      </span>
                    ) : (
                      "Resend code"
                    )}
                  </button>
                )}
              </div>

              {/* Back link */}
              <p className="text-center text-xs text-muted-foreground mt-4">
                <Link href="/register" className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  Back to registration
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
