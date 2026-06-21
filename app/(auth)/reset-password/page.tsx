"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Zap, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // The auth callback route exchanges the recovery code and establishes a session
  // before redirecting here. Verify the session is present before showing the form.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setSessionReady(true);
      } else {
        router.replace("/login?error=reset_failed");
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 72) {
      setError("Password must be 72 characters or fewer.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message ?? "Failed to update password. Please try again.");
      setLoading(false);
      return;
    }

    // Finding 9 fix: call signOut BEFORE setDone(true) so that:
    // (a) Other sessions are terminated before the UI shows success, closing the
    //     race window where a compromised concurrent session remains valid.
    // (b) If signOut fails (network error, Supabase error), we surface the error
    //     rather than silently continuing — the user is told to sign out manually.
    // NEW-4 fix: setLoading(false) is NOT called until after signOut completes.
    //     The earlier code cleared loading before signOut, re-enabling the submit
    //     button mid-flow. A second click would fire updateUser again on the same
    //     recovery session before signOut finished, creating a double-submit window.
    //     Keeping loading=true throughout the entire async sequence closes this window.
    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) {
      setError(
        "Password updated but failed to sign out other sessions. Please sign out of other devices manually."
      );
      setLoading(false);
      return;
    }

    setLoading(false);
    setDone(true);
    setTimeout(() => router.push("/login?password_reset=1"), 2000);
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-serif text-foreground tracking-tight">
            Pulse DMS
          </h1>
        </div>

        <div className="bg-sidebar/80 backdrop-blur-sm border border-sidebar-border rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Password updated
              </h2>
              <p className="text-sm text-muted-foreground">
                Redirecting you to sign in…
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  Set new password
                </h2>
                <p className="text-sm text-muted-foreground">
                  Choose a strong password for your account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    New password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      autoFocus
                      disabled={loading}
                      className="h-10 pr-10 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    Confirm password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={loading}
                      className="h-10 pr-10 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 mt-2 bg-primary text-white font-semibold hover:bg-primary/90 transition-all duration-200"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                  ) : (
                    "Update password"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
