"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, ChevronDown, Zap, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile, Shop } from "@/types";

interface NavbarProps {
  onMenuClick: () => void;
  profile: Profile | null;
  shop: Shop | null;
}

export function Navbar({ onMenuClick, profile, shop }: NavbarProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const initials = (profile?.full_name ?? profile?.email ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 h-14 bg-sidebar/90 backdrop-blur-md border-b border-sidebar-border">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Shop name */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 border border-primary/20 shrink-0">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="font-semibold text-sm truncate text-foreground">
            {shop?.shop_name ?? "My Shop"}
          </span>
        </div>
      </div>

      {/* User menu */}
      <div className="flex items-center gap-2 relative ml-auto">
        <button
          onClick={() => setDropOpen((p) => !p)}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 border border-primary/25 text-primary text-xs font-bold">
            {initials}
          </div>
          <span className="hidden sm:block text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[120px]">
            {profile?.full_name ?? profile?.email ?? "Owner"}
          </span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
              dropOpen && "rotate-180"
            )}
          />
        </button>

        {dropOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDropOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 z-20 rounded-xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden animate-fade-up">
              <div className="px-4 py-3 border-b border-sidebar-border">
                <p className="text-xs font-medium text-foreground truncate">
                  {profile?.full_name ?? "Owner"}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {profile?.email ?? ""}
                </p>
              </div>
              <div className="p-1">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
