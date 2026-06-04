import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return `Rs. ${new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

// Multi-plan display helpers. A member may have several plans via the
// pulse_member_plans junction (member.plans); member.plan is the primary
// (fallback for surfaces that don't join the junction).
type PlanLike = { name?: string | null } | null;
interface MemberPlanShape {
  plan?: PlanLike;
  plans?: { plan?: PlanLike }[] | null;
}

export function memberPlanNames(m: MemberPlanShape | null | undefined): string[] {
  const fromJunction = (m?.plans ?? [])
    .map((pp) => pp.plan?.name)
    .filter((n): n is string => !!n);
  if (fromJunction.length) return fromJunction;
  return m?.plan?.name ? [m.plan.name] : [];
}

export function memberPlanLabel(m: MemberPlanShape | null | undefined, empty = "—"): string {
  const names = memberPlanNames(m);
  return names.length ? names.join(" + ") : empty;
}

export function formatLakh(amount: number): string {
  if (amount >= 10_000_000) return `Rs. ${(amount / 10_000_000).toFixed(1)} Cr`;
  if (amount >= 100_000)    return `Rs. ${(amount / 100_000).toFixed(1)} Lakh`;
  return formatCurrency(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateInput(date: Date) {
  // Build the YYYY-MM-DD string from LOCAL date components.
  // Using toISOString() here would convert to UTC, which shifts the date
  // back a day for any positive-offset timezone (e.g. Pakistan UTC+5) when
  // the Date sits at local midnight — exactly what new Date(y, m, d) produces.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Convert "HH:MM" or "HH:MM:SS" 24h string to "h:MM AM/PM".
 * "16:00" → "4:00 PM". "00:30" → "12:30 AM". Invalid input returned as-is.
 */
export function formatTime12h(time: string | null | undefined): string {
  if (!time) return "";
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time;
  const h = Number(m[1]);
  const mins = m[2];
  if (Number.isNaN(h) || h < 0 || h > 23) return time;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mins} ${period}`;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+92 ${digits.slice(1, 4)}-${digits.slice(4)}`;
  }
  return phone;
}

export function formatCNIC(cnic: string): string {
  const digits = cnic.replace(/\D/g, "");
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }
  return cnic;
}

export function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: formatDateInput(start),
    end: formatDateInput(end),
  };
}

export function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

export function getMemberStatusColor(status: string): string {
  switch (status) {
    case "active":    return "text-success bg-success/10 border-success/20";
    case "expired":   return "text-destructive bg-destructive/10 border-destructive/20";
    case "frozen":    return "text-info bg-info/10 border-info/20";
    case "cancelled": return "text-muted-foreground bg-muted border-border";
    default:          return "text-muted-foreground bg-muted border-border";
  }
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
