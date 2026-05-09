import { Suspense } from "react";
import { getSmartEarnData } from "@/lib/data";
import { SmartEarnClient } from "@/components/modules/smart-earn/smart-earn-client";
import SmartEarnLoading from "./loading";

export default function SmartEarnPage() {
  return (
    <Suspense fallback={<SmartEarnLoading />}>
      <SmartEarnData />
    </Suspense>
  );
}

async function SmartEarnData() {
  const data = await getSmartEarnData();
  return <SmartEarnClient {...data} />;
}
