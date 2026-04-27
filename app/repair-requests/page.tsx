import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RepairRequestRow = {
  id: string;
  request_no: string;
  certificate_no: string | null;
  customer_name: string;
  phone: string;
  product_name: string;
  symptom_category: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "received", label: "受付" },
  { value: "checking", label: "内容確認中" },
  { value: "manufacturer_checking", label: "メーカー確認中" },
  { value: "repair_arranging", label: "修理手配中" },
  { value: "visit_scheduling", label: "訪問日調整中" },
  { value: "completed", label: "修理完了" },
  { value: "out_of_warranty", label: "保証対象外" },
  { value: "cancelled", label: "キャンセル" },
] as const;

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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function statusLabel(status: string) {
  const found = STATUS_OPTIONS.find((option) => option.value === status);
  return found ? found.label : status;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "received":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "checking":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "manufacturer_checking":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "repair_arranging":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "visit_scheduling":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "completed":
      return "bg-green-50 text-green-700 border-green-200";
    case "out_of_warranty":
      return "bg-gray-50 text-gray-700 border-gray-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function isActiveStatus(status: string) {
  return !["completed", "out_of_warranty", "cancelled"].includes(status);
}

export default async function RepairRequestsPage() {
  let rows: RepairRequestRow[] = [];
  let errorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("repair_requests")
      .select(
        "id, request_no, certificate_no, customer_name, phone, product_name, symptom_category, status, assigned_to, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      rows = (data || []) as RepairRequestRow[];
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "一覧取得に失敗しました";
  }

  const activeRows = rows.filter((row) => isActiveStatus(row.status));
  const completedRows = rows.filter((row) => row.status === "completed");
  const closedRows = rows.filter((row) =>
    ["out_of_warranty", "cancelled"].includes(row.status)
  );
  const unassignedRows = activeRows.filter((row) => !row.assigned_to);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">修理受付管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            お客様からの修理依頼を確認・担当者管理します
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
            href="/warranty-certificates"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            保証書管理へ
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          一覧取得に失敗しました: {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">全受付</div>
          <div className="mt-2 text-3xl font-bold">{rows.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">対応中</div>
          <div className="mt-2 text-3xl font-bold">{activeRows.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未担当</div>
          <div className="mt-2 text-3xl font-bold">{unassignedRows.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">修理完了</div>
          <div className="mt-2 text-3xl font-bold">{completedRows.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">対象外・キャンセル</div>
          <div className="mt-2 text-3xl font-bold">{closedRows.length}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">修理受付一覧</h2>
            <p className="mt-1 text-sm text-gray-500">
              受付番号または詳細・編集ボタンから、担当者・ステータス・対応履歴を管理できます。
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            まだ修理受付はありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">受付番号</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">担当者</th>
                  <th className="px-4 py-3 font-medium">お客様名</th>
                  <th className="px-4 py-3 font-medium">電話番号</th>
                  <th className="px-4 py-3 font-medium">対象機器</th>
                  <th className="px-4 py-3 font-medium">症状区分</th>
                  <th className="px-4 py-3 font-medium">保証書番号</th>
                  <th className="px-4 py-3 font-medium">受付日時</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <Link
                        href={`/repair-requests/detail?id=${row.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {row.request_no}
                      </Link>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                          row.status
                        )}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {row.assigned_to ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {row.assigned_to}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          未担当
                        </span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {row.customer_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{row.phone}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.product_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.symptom_category || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.certificate_no || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/repair-requests/detail?id=${row.id}`}
                        className="rounded-lg bg-black px-3 py-2 text-xs text-white hover:opacity-90"
                      >
                        詳細・編集
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}