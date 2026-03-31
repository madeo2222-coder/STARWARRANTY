import ContractsPageClient from "./ContractsPageClient";

export default function ContractsPage() {
  return (
    <div className="p-4">
      <h1 className="mb-6 text-3xl font-bold">契約一覧</h1>
      <ContractsPageClient />
    </div>
  );
}