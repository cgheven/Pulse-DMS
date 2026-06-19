import { listDmsLeads } from "@/app/actions/admin-leads";
import { LeadsClient } from "@/components/modules/admin/leads-client";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const { leads = [] } = await listDmsLeads();

  return <LeadsClient leads={leads} />;
}
