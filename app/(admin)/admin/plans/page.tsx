import { requireFullAdmin } from "@/lib/admin-scope";
import { createClient } from "@/lib/supabase/server";
import { DefaultPlansClient } from "@/components/modules/admin/default-plans-client";

export default async function AdminPlansPage() {
  await requireFullAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("pulse_default_plans")
    .select("*")
    .order("sort_order");
  return <DefaultPlansClient plans={data ?? []} />;
}
