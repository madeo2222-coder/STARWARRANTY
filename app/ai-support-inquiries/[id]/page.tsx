import Link from "next/link";

export default function AiSupportInquiryDetailPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm text-gray-500">STAR WARRANTY</p>
        <h1 className="text-2xl font-bold">AI一次受付詳細</h1>
        <p className="mt-1 text-sm text-gray-500">
          詳細画面は次の工程で実装します。
        </p>
      </div>

      <Link
        href="/ai-support-inquiries"
        className="inline-block rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
      >
        一覧へ戻る
      </Link>
    </div>
  );
}