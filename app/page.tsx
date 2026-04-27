import Link from "next/link";

export const dynamic = "force-dynamic";

const mainCards = [
  {
    title: "保証書管理",
    description: "保証書の一覧確認、新規作成、今後のPDF発行へ進みます",
    href: "/warranty-certificates",
    icon: "📘",
  },
  {
    title: "修理受付管理",
    description: "お客様からの修理依頼を確認し、対応状況を管理します",
    href: "/repair-requests",
    icon: "🛠️",
  },
  {
    title: "請求書管理",
    description: "請求書の一覧確認、新規作成、PDF発行準備へ進みます",
    href: "/warranty-invoices",
    icon: "🧾",
  },
  {
    title: "本部管理",
    description: "本部情報、ロゴ、管理導線を確認・更新します",
    href: "/headquarters",
    icon: "🏢",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">STAR WARRANTY</p>
        <h1 className="mt-1 text-3xl font-bold">保証管理ホーム</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          保証書の登録、修理受付の管理、請求書の作成を行うためのホーム画面です。
          StarWarranty 用の業務導線に切り替えています。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mainCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-3xl">{card.icon}</div>
            <h2 className="mt-3 text-lg font-bold">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {card.description}
            </p>
            <div className="mt-4 text-sm font-medium text-blue-600">
              開く →
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">現在の開発状況</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">保証書</div>
            <div className="mt-2 text-base font-semibold">
              一覧・新規作成の土台作成中
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">修理受付</div>
            <div className="mt-2 text-base font-semibold">
              管理画面と公開フォーム準備中
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">請求書</div>
            <div className="mt-2 text-base font-semibold">
              見本PDF寄せの実装準備中
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}