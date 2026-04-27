import Link from "next/link";

export const dynamic = "force-dynamic";

export default function WarrantyInvoicesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">請求書管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            請求書の一覧確認・新規作成・PDF発行準備を行います
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/headquarters"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            本部管理へ
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold">準備中</div>
        <p className="mt-2 text-sm text-gray-500">
          次で請求書一覧・複数明細対応・見本PDF寄せを追加します。
        </p>
      </div>
    </div>
  );
}