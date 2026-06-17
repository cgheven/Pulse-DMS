"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Zap, Loader2 } from "lucide-react";
import { createShop } from "@/app/actions/shop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export default function OnboardingPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shopName.trim()) return;
    setLoading(true);
    const res = await createShop(shopName);
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" });
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
          <h1 className="font-serif text-3xl text-foreground tracking-tight">Welcome to Pulse</h1>
          <p className="mt-2 text-sm text-muted-foreground text-center leading-relaxed">
            Let&apos;s set up your shop to get started.
          </p>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Name your shop</p>
              <p className="text-xs text-muted-foreground">You can change this anytime in Settings</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="shopName" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Shop Name
              </Label>
              <Input
                id="shopName"
                placeholder="e.g. Al-Hassan Electronics"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
                autoFocus
                disabled={loading}
                className="h-10 bg-background/50 border-sidebar-border focus-visible:ring-primary/40 focus-visible:border-primary/50"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !shopName.trim()}
              className="w-full h-10 mt-2 bg-primary text-white font-semibold hover:bg-primary/90 transition-all duration-200"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
              ) : (
                "Create My Shop →"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
