import { requireFullAdmin } from "@/lib/admin-scope";
import { listAuditLogs, listLoginLogs } from "@/app/actions/admin-audit";
import { AuditClient } from "@/components/modules/admin/audit-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireFullAdmin();
  const [{ logs = [] }, { logs: loginLogs = [] }] = await Promise.all([
    listAuditLogs(),
    listLoginLogs(),
  ]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AuditClient initialLogs={logs} initialLoginLogs={loginLogs} />
    </div>
  );
}
