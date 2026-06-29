import { redirect } from "next/navigation";

// The add-lead form is a modal in leads-client; redirect to the list.
export default function NewLeadPage() {
  redirect("/sales/leads");
}
