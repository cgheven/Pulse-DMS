import { redirect } from "next/navigation";
import { getAuthContext, getStaffSession } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { GymProvider } from "@/contexts/gym-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { Gym } from "@/types";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (ctx.profile?.is_admin) redirect("/admin/gyms");

  // Trainers / referrers / social-managers each have their own portal —
  // keep these redirects intact for back-compat with the trainer flow.
  const role = (ctx.profile as { role?: string } | null)?.role;
  if (role === "trainer") redirect("/trainer");
  if (role === "referrer") redirect("/referrer");
  if (role === "social_manager") redirect("/social");
  // Compliance users live in pulse_compliance_users (not pulse_staff), so
  // getStaffSession() returns null for them. Without this redirect they'd
  // fall through to the bottom-of-layout login redirect → infinite loop.
  if (role === "compliance") redirect("/compliance-portal");

  // Owner path — full access. ctx.gymId resolves to the active gym.
  if (ctx.gymId) {
    return (
      <GymProvider profile={ctx.profile} gym={ctx.gym} gyms={ctx.gyms ?? []} isDemo={ctx.isDemo}>
        <DashboardShell>{children}</DashboardShell>
      </GymProvider>
    );
  }

  // Non-owner staff path — frontdesk / manager / cleaner / guard / cook / other.
  // These users have a pulse_staff row but no owned gym; their gym comes from
  // the staff record. Sidebar + page guards filter what they can see/do.
  const staff = await getStaffSession();
  if (staff) {
    // Load the staff member's gym so the navbar / dashboard can render.
    const admin = createAdminClient();
    const { data: gymRow } = await admin
      .from("pulse_gyms").select("*").eq("id", staff.gymId).single();
    const gym = (gymRow ?? null) as Gym | null;

    return (
      <GymProvider
        profile={ctx.profile}
        gym={gym}
        gyms={gym ? [gym] : []}
        isDemo={false}
      >
        <DashboardShell permissions={staff.permissions}>{children}</DashboardShell>
      </GymProvider>
    );
  }

  // Authenticated but has no owned gym AND no staff record.
  // Case A — owner whose gym creation trigger failed / gym was deleted.
  //   Render a static "Set up your gym" landing (the trigger runs on
  //   profile insert, so this is rare; ./settings can't help because it
  //   itself requires a gym to load). Without this, redirecting back to
  //   /login while the auth session is valid creates a loop.
  // Case B — orphaned auth user with no profile → /login.
  if (role === "owner") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="text-2xl">🏋️</span>
          </div>
          <p className="text-xl font-bold">Set up your gym</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We couldn&apos;t find a gym tied to your account. This usually happens
            if onboarding didn&apos;t finish. Message us on WhatsApp to complete
            setup, or sign in with a different account.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <a
              href={`https://wa.me/923336673553?text=${encodeURIComponent("Hi, my Pulse account has no gym attached. Please help finish my setup.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center min-h-[40px] px-5 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-sm font-medium hover:bg-[#25D366]/20 transition-colors"
            >
              Message us on WhatsApp
            </a>
            <a
              href="/login"
              className="inline-flex items-center justify-center min-h-[40px] px-5 py-2 rounded-lg border border-sidebar-border bg-card text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Back to login
            </a>
          </div>
        </div>
      </div>
    );
  }
  redirect("/login");
}
