"use client";
import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package, Receipt,
  BookOpen, BarChart3, Boxes, Settings, X, Zap, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShopContext } from "@/contexts/shop-context";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard",        label: "Dashboard",       icon: LayoutDashboard },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/sales",            label: "Sales",           icon: ShoppingCart },
      { href: "/stock",            label: "Stock",           icon: Boxes },
      { href: "/expenses",         label: "Expenses",        icon: Receipt },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { href: "/supplier-ledger",  label: "Supplier Ledger", icon: BookOpen },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/pl-report",        label: "P&L Report",      icon: BarChart3 },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/products",         label: "Products",        icon: Package },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/staff",            label: "Staff",           icon: Users },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings",         label: "Settings",        icon: Settings },
    ],
  },
];

type NavItem = (typeof navGroups)[0]["items"][0];

const NavLink = memo(function NavLink({
  href, label, icon: Icon, pathname, onClose,
}: NavItem & { pathname: string; onClose: () => void }) {
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
      )}
      <Icon
        className={cn(
          "w-4 h-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      <span>{label}</span>
    </Link>
  );
});

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useShopContext();
  const isStaff = profile?.role === "staff";

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 group"
            onClick={onClose}
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 transition-all group-hover:bg-primary/20">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-foreground font-bold text-base tracking-tight leading-none">Pulse DMS</p>
              <p className="text-primary/60 text-[10px] mt-1 font-semibold tracking-[0.15em] uppercase">
                Pulse of your business
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-4 scrollbar-hide">
          {(isStaff ? [{ label: "Operations", items: [{ href: "/sales", label: "Sales", icon: ShoppingCart }] }] : navGroups).map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    {...item}
                    pathname={pathname}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs text-muted-foreground">Pulse is online</p>
          </div>
        </div>
      </aside>
    </>
  );
}
