import { Suspense } from "react";
import ContractsPageClient from "./ContractsPageClient";
import {
  getCurrentProfile,
  type CurrentProfile,
} from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

function ContractsFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default async function ContractsPage() {
  const initialProfile: CurrentProfile | null = await getCurrentProfile();

  return (
    <Suspense fallback={<ContractsFallback />}>
      <ContractsPageClient initialProfile={initialProfile} />
    </Suspense>
  );
}