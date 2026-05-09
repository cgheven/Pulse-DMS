import { Suspense } from "react";
import { getMembers } from "@/lib/data";
import { MembersClient } from "@/components/modules/members/members-client";
import MembersLoading from "./loading";

export default function MembersPage() {
  return (
    <Suspense fallback={<MembersLoading />}>
      <MembersData />
    </Suspense>
  );
}

async function MembersData() {
  const data = await getMembers();
  return <MembersClient {...data} />;
}
