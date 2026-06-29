import { listActivityLog } from "@/app/actions/admin-audit";
import AuditClient from "@/components/modules/admin/audit-client";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const { logs, error } = await listActivityLog();

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <AuditClient logs={logs} />
    </div>
  );
}
