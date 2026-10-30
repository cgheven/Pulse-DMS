"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, LogOut, Menu, X, Bike, PlusCircle, ClipboardList, Wallet, Landmark,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/logo-mark";

// Nav items grow as later phases add more routes under app/(rider)/rider/*.
// Only pages that actually exist are listed here to avoid dead links. The
// bottom tab bar only shows the first 4 (thumb-reach, mobile screen width) —
// the drawer shows all of them, so items past index 3 are still reachable.
const riderNav = [
  { href: "/rider/dashboard",  label: "Dashboard", icon: LayoutDashboard },
  { href: "/rider/orders/new", label: "New Order", icon: PlusCircle },
  { href: "/rider/orders",     label: "My Orders", icon: ClipboardList },
  { href: "/rider/cash",       label: "Cash",      icon: Wallet },
  { href: "/rider/cheque",     label: "Cheque",    icon: Landmark },
];
const BOTTOM_NAV_COUNT = 4;

function RiderSidebar({ open, onClose, email, fullName }: {
  open: boolean; onClose: () => void; email: string; fullName: string | null;
}) {
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:z-auto",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <div>
              <p className="text-sm font-bold text-foreground leading-none">Pulse</p>
              <p className="text-muted-foreground/50 text-[9px] mt-0.5 font-bold tracking-[0.12em] uppercase">Rider Portal</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto flex flex-col gap-1 min-h-0">
          {riderNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} onClick={onClose}
                className={cn(
                  "relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  active ? "bg-white/6 text-foreground font-semibold" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />}
                <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-sidebar-border shrink-0">
          <button onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
          <div className="px-3 pt-2.5">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              <p className="text-xs font-semibold text-foreground truncate">{fullName ?? "Rider"}</p>
            </div>
            <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{email}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

// Thumb-friendly bottom tab bar for mobile — riders take orders one-handed
// on a round, so the primary actions live within thumb reach at all times,
// not just behind the hamburger drawer.
function RiderBottomNav() {
  const pathname = usePathname();
  const items = riderNav.slice(0, BOTTOM_NAV_COUNT);
  return (
    <nav
      className="lg:hidden shrink-0 border-t border-sidebar-border bg-sidebar/95 backdrop-blur-md grid pb-[env(safe-area-inset-bottom)]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RiderShell({ children, email, fullName }: {
  children: React.ReactNode; email: string; fullName: string | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      <RiderSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} email={email} fullName={fullName} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-12 border-b border-sidebar-border bg-sidebar/80 backdrop-blur-md shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Bike className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Rider Portal</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        <RiderBottomNav />
      </div>
    </div>
  );
}
