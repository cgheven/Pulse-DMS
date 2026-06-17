"use client";
import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { useShopContext } from "@/contexts/shop-context";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, shop } = useShopContext();

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Navbar
            onMenuClick={() => setSidebarOpen(true)}
            profile={profile}
            shop={shop}
          />
          <main className="flex-1 overflow-y-auto overscroll-y-contain">
            <div className="container mx-auto px-4 sm:px-6 py-6 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
