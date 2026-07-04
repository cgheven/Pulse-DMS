import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRiderAuthContext } from "@/app/actions/rider";
import { isModuleEnabled } from "@/lib/modules";
import { RiderShell } from "@/components/layout/rider-shell";
import { Bike } from "lucide-react";

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  // Same cached lookup every page's data-fetching function uses — one
  // getUser()+profile+rider round-trip per navigation, mirrors (sales)/layout.tsx.
  const ctx = await getRiderAuthContext();
  if (!ctx?.user) redirect("/login");
  const { user, profile, rider } = ctx;

  if (!profile?.is_rider || !rider) {
    // Defense-in-depth: mirror (dashboard)/layout.tsx's fallback so a profile
    // flag out of sync with the dms_riders row can't produce a redirect loop.
    const admin = createAdminClient();
    const { data: riderRow } = await admin
      .from("dms_riders")
      .select("id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!riderRow) redirect("/dashboard");
  }

  if (rider && !rider.is_active) redirect("/login");

  // Module disabled while a rider is mid-session: their auth session is
  // still valid, so redirecting to /login would just bounce them straight
  // back in — an inline message avoids that redirect loop (see spec §11.6).
  if (rider && !(await isModuleEnabled(rider.shop_id, "rider_management"))) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
            <Bike className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground mb-1">Rider Portal Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            The Rider Management module has been disabled for your shop. Please contact your shop owner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <RiderShell fullName={rider?.full_name ?? profile?.full_name ?? null} email={user.email ?? ""}>
      {children}
    </RiderShell>
  );
}
