import Link from "next/link";
import { Zap } from "lucide-react";

const WHATSAPP_NUMBER = "923336673553";
const CONTACT_EMAIL = "hello@yourpulse.io";

const OTHER_PULSE_PRODUCTS = [
  { href: "https://hms.yourpulse.io/", name: "HMS" },
  { href: "https://bms.yourpulse.io/", name: "BMS" },
  { href: "https://gms.musabkhan.me/", name: "GMS" },
  { href: "https://clinic.yourpulse.io/", name: "Clinic" },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-sidebar-border px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pb-8">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Zap className="w-3 h-3 text-primary" />
              </div>
              <span className="font-bold text-base text-foreground">Pulse DMS</span>
            </Link>
            <p className="text-xs text-muted-foreground/70 mt-3 max-w-[200px] leading-relaxed">
              Inventory and sales management software for retail shops and distributors.
            </p>
            <p className="text-[11px] text-muted-foreground/50 mt-4">
              Also from Pulse:{" "}
              {OTHER_PULSE_PRODUCTS.map((p, i) => (
                <span key={p.href}>
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-muted-foreground transition-colors"
                  >
                    {p.name}
                  </a>
                  {i < OTHER_PULSE_PRODUCTS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Company</p>
            <ul className="space-y-2">
              <li><Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Home</Link></li>
              <li><Link href="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Pricing</Link></li>
              <li>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</p>
            <ul className="space-y-2">
              <li>
                <a href="https://yourpulse.io/terms" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="https://yourpulse.io/privacy" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="https://yourpulse.io/refund" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Refund Policy
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Contact</p>
            <ul className="space-y-2">
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  +92 333 6673553
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground/60">
            © 2026 PulseHub (SMC-Private) Limited
          </p>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Sign in →
          </Link>
        </div>
      </div>
    </footer>
  );
}
