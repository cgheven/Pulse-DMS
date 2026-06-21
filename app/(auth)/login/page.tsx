"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone, syntheticEmailFromPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

function resolveEmail(input: string): string {
  const canonical = normalizePhone(input);
  if (canonical) return syntheticEmailFromPhone(canonical);
  return input;
}

export default function LoginPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Finding 13 fix: read the query params, show toasts, then strip the params from
    // the URL via history.replaceState so they do not persist in browser history,
    // bookmarks, or screenshots. useSearchParams() is consumed once on mount.
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (params.get("password_reset") === "1") {
      toast({
        title: "Password updated",
        description: "Sign in with your new password.",
      });
      params.delete("password_reset");
      changed = true;
    }
    if (params.get("error") === "reset_failed") {
      toast({
        title: "Reset link expired",
        description: "Please request a new password reset link.",
        variant: "destructive",
      });
      params.delete("error");
      changed = true;
    }
    if (params.get("registered") === "1") {
      toast({
        title: "Account created!",
        description: "Please sign in with your new credentials.",
      });
      params.delete("registered");
      changed = true;
    }

    if (changed) {
      const cleanUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", cleanUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const email = resolveEmail(identity.trim());
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h1 className="font-serif text-3xl text-foreground tracking-tight">Pulse DMS</h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
            Dealer Management System
          </p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="identity" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Mobile / Email
              </Label>
              <Input
                id="identity"
                type="text"
                placeholder="03001234567 or you@example.com"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                required
                autoComplete="username"
                disabled={loading}
                className="h-10 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  className="h-10 pr-10 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 mt-2 bg-primary text-white font-semibold hover:bg-primary/90 transition-all duration-200"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
