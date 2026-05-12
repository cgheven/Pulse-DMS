import { requireFullAdmin } from "@/lib/admin-scope";
import AdminUsersClient from "./users-client";

export default async function AdminUsersPage() {
  await requireFullAdmin();
  return <AdminUsersClient />;
}
