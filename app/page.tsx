import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RepairRequestRow = {
  id: string;
  status: string;
  assigned_to: string | null;
};

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

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function isActiveStatus(status: string) {
  return !["completed", "out_of_warranty", "cancelled"].includes(status);
}

export default async function HomePage() {
  let repairRows: RepairRequestRow[] = [];
  let repairErrorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("repair_requests")
      .select("id, status, assigned_to");

    if (error) {
      repairErrorMessage = error.message;
    } else {
      repairRows = (data || []) as RepairRequestRow[];
    }
  } catch (error) {
    repairErrorMessage =
      error instanceof Error ? error.message : "修理受付の集計取得に失敗しました";
  }

  const activeRows = repairRows.filter((row) => isActiveStatus(row.status));
  const completedRows = repairRows.filter((row) => row.status === "completed");
  const closedRows = repairRows.filter((row) =>
    ["out_of_warranty", "cancelled"].includes(row.status)
  );
  const unassignedRows = activeRows.filter((row) => !row.assigned_to);

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

      {repairErrorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          修理受付の集計取得に失敗しました: {repairErrorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">修理受付サマリー</h2>
            <p className="mt-1 text-sm text-gray-500">
              現在の修理受付状況を確認できます。
            </p>
          </div>

          <Link
            href="/repair-requests"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            修理受付管理へ
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">全受付</div>
            <div className="mt-2 text-3xl font-bold">{repairRows.length}</div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">対応中</div>
            <div className="mt-2 text-3xl font-bold">{activeRows.length}</div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">未担当</div>
            <div className="mt-2 text-3xl font-bold">
              {unassignedRows.length}
            </div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">修理完了</div>
            <div className="mt-2 text-3xl font-bold">
              {completedRows.length}
            </div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">対象外・キャンセル</div>
            <div className="mt-2 text-3xl font-bold">{closedRows.length}</div>
          </div>
        </div>
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
              一覧・新規作成・PDF導線を整備中
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">修理受付</div>
            <div className="mt-2 text-base font-semibold">
              受付・進捗確認・写真・履歴・集計まで対応
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