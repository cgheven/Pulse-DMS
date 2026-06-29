"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield, Users, LayoutDashboard,
  Menu, X, LogOut, ClipboardList, Zap, Target, Inbox, Users2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin",               label: "Dashboard",    icon: LayoutDashboard, exact: true },
  { href: "/admin/users",         label: "Clients",      icon: Users },
  { href: "/admin/leads",         label: "Leads",        icon: Target },
  { href: "/admin/inquiries",     label: "Inquiries",    icon: Inbox },
  { href: "/admin/sales-teams",   label: "Sales Teams",  icon: Users2 },
  { href: "/admin/audit",         label: "Audit Log",    icon: ClipboardList },
];

function AdminSidebar({ open, onClose, email }: { open: boolean; onClose: () => void; email: string }) {
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
        "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:z-auto",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground leading-none">Pulse</p>
              <p className="text-primary/60 text-[10px] mt-1 font-semibold tracking-[0.15em] uppercase">Pulse of your business</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2.5 overflow-y-auto">
          <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-3 mb-1.5">Admin Panel</p>
          <div className="space-y-0.5">
            {adminNav.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'));
              return (
                <Link key={href} href={href} onClick={onClose}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />}
                  <Icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="px-2.5 py-3 border-t border-sidebar-border space-y-0.5">
          <Link href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            Back to Dashboard
          </Link>
          <button onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
          <div className="px-3 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              <p className="text-xs text-muted-foreground">Admin session</p>
            </div>
            <p className="text-xs text-muted-foreground/60 truncate">{email}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

export function AdminShell({ children, email }: { children: React.ReactNode; email: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} email={email} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-sidebar-border bg-sidebar/80 backdrop-blur-md shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Admin Panel</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
