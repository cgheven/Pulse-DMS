"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, Menu, X, ArrowRight } from "lucide-react";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0">
      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Zap className="w-3.5 h-3.5 text-primary" />
      </div>
      <span className="font-bold text-base text-foreground tracking-tight">Pulse DMS</span>
    </Link>
  );
}

export function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="relative z-40 px-6 py-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <Logo />

        {/* Desktop nav links — centered */}
        <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </Link>
        </div>

        {/* Desktop auth actions */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
          >
            Get Started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-foreground hover:bg-sidebar/60 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden mt-3 rounded-2xl border border-sidebar-border bg-card p-4 space-y-1">
          <Link
            href="/pricing"
            onClick={() => setMobileOpen(false)}
            className="block px-2 py-2.5 text-sm font-medium text-foreground hover:bg-sidebar/60 rounded-lg transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            onClick={() => setMobileOpen(false)}
            className="block px-2 py-2.5 text-sm font-medium text-foreground hover:bg-sidebar/60 rounded-lg transition-colors"
          >
            Login
          </Link>
          <Link
            href="/register"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center gap-1.5 mt-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            Get Started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </nav>
  );
}
