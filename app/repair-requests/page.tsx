import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RepairRequestRow = {
  id: string;
  request_no: string;
  certificate_no: string;
  customer_name: string;
  phone: string;
  product_name: string;
  symptom_category: string | null;
  status: string;
  created_at: string;
};

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
  switch (status) {
    case "received":
      return "受付";
    case "checking":
      return "内容確認中";
    case "manufacturer_checking":
      return "メーカー確認中";
    case "repair_arranging":
      return "修理手配中";
    case "visit_scheduling":
      return "訪問日調整中";
    case "completed":
      return "修理完了";
    case "out_of_warranty":
      return "保証対象外";
    case "cancelled":
      return "キャンセル";
    default:
      return status;
  }
}

export default async function RepairRequestsPage() {
  let rows: RepairRequestRow[] = [];
  let errorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("repair_requests")
      .select(
        "id, request_no, certificate_no, customer_name, phone, product_name, symptom_category, status, created_at"
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">修理受付管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            お客様からの修理依頼を確認・対応管理します
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

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          一覧取得に失敗しました: {errorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">修理受付一覧</h2>
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
                  <th className="px-4 py-3 font-medium">保証書番号</th>
                  <th className="px-4 py-3 font-medium">お客様名</th>
                  <th className="px-4 py-3 font-medium">電話番号</th>
                  <th className="px-4 py-3 font-medium">対象機器</th>
                  <th className="px-4 py-3 font-medium">症状区分</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">受付日時</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/repair-requests/detail?id=${row.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {row.request_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.certificate_no}</td>
                    <td className="px-4 py-3">{row.customer_name}</td>
                    <td className="px-4 py-3">{row.phone}</td>
                    <td className="px-4 py-3">{row.product_name}</td>
                    <td className="px-4 py-3">{row.symptom_category || "-"}</td>
                    <td className="px-4 py-3">{statusLabel(row.status)}</td>
                    <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
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