import { listDmsClients } from "@/app/actions/admin-users";
import ClientsClient from "@/components/modules/admin/clients-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { clients = [], error } = await listDmsClients();

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <ClientsClient clients={clients} />
    </div>
  );
}
