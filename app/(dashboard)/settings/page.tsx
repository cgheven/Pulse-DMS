import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/data";
import { SettingsClient } from "@/components/modules/settings/settings-client";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsData />
    </Suspense>
  );
}

async function SettingsData() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  if (!ctx.shop) redirect("/onboarding");

  return (
    <SettingsClient
      shop={ctx.shop}
      profile={ctx.profile}
    />
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="animate-pulse bg-muted rounded-xl h-9 w-32" />
        <div className="animate-pulse bg-muted rounded-xl h-4 w-48" />
      </div>
      <div className="animate-pulse bg-muted rounded-xl h-48" />
    </div>
  );
}
