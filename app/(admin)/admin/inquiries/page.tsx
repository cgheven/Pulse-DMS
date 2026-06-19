import { listDmsInquiries } from "@/app/actions/admin-inquiries";
import { InquiriesClient } from "@/components/modules/admin/inquiries-client";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage() {
  const { inquiries = [] } = await listDmsInquiries();
  return <InquiriesClient inquiries={inquiries} />;
}
