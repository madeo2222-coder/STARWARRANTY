import Link from "next/link";

export const dynamic = "force-dynamic";

const invoiceSteps = [
  {
    title: "請求書一覧",
    description: "作成済み請求書の確認・検索・ステータス管理",
    status: "次に実装",
  },
  {
    title: "新規請求書作成",
    description: "代理店・顧客・明細を選択して請求書を作成",
    status: "準備中",
  },
  {
    title: "PDF発行",
    description: "見本デザインに寄せたPDF請求書を出力",
    status: "準備中",
  },
  {
    title: "入金管理",
    description: "未入金・入金済み・取消などの状態管理",
    status: "準備中",
  },
];

export default function WarrantyInvoicesPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">請求書管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            請求書の一覧確認・新規作成・PDF発行・入金管理を行います。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/headquarters"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            本部管理へ
          </Link>

          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            ホームへ
          </Link>

          <button
            type="button"
            disabled
            className="rounded-lg bg-gray-300 px-4 py-2 text-sm text-white"
          >
            新規作成 準備中
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">全請求書</div>
          <div className="mt-2 text-3xl font-bold">0</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未入金</div>
          <div className="mt-2 text-3xl font-bold">0</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">入金済み</div>
          <div className="mt-2 text-3xl font-bold">0</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">今月請求額</div>
          <div className="mt-2 text-3xl font-bold">¥0</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">請求書一覧</h2>
          <p className="mt-1 text-sm text-gray-500">
            作成済みの請求書を一覧で確認できるようにします。
          </p>
        </div>

        <div className="p-6 text-sm text-gray-500">
          まだ請求書データはありません。次の実装で請求書テーブルと一覧表示を接続します。
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">実装ステップ</h2>
          <p className="mt-1 text-sm text-gray-500">
            請求書管理で追加していく機能です。
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          {invoiceSteps.map((step) => (
            <div key={step.title} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    {step.description}
                  </p>
                </div>

                <span className="whitespace-nowrap rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                  {step.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}