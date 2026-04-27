import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type WarrantyCertificateItemRow = {
  is_enabled: boolean;
};

type WarrantyCertificateRow = {
  id: string;
  certificate_no: string;
  customer_name: string;
  start_date: string;
  status: string;
  introducer_name: string | null;
  seller_name: string | null;
  created_at: string;
  warranty_certificate_items?: WarrantyCertificateItemRow[];
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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function statusLabel(status: string) {
  switch (status) {
    case "active":
      return "有効";
    case "expired":
      return "終了";
    case "cancelled":
      return "解約";
    case "invalid":
      return "無効";
    default:
      return status;
  }
}

function enabledItemCount(items: WarrantyCertificateItemRow[] | undefined) {
  if (!items || items.length === 0) return 0;
  return items.filter((item) => item.is_enabled).length;
}

export default async function WarrantyCertificatesPage() {
  let rows: WarrantyCertificateRow[] = [];
  let errorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_certificates")
      .select(
        "id, certificate_no, customer_name, start_date, status, introducer_name, seller_name, created_at, warranty_certificate_items(is_enabled)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      rows = (data || []) as WarrantyCertificateRow[];
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "一覧の取得に失敗しました";
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">保証書管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            保証書の一覧確認と新規作成を行います
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/warranty-certificates/new"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            新規作成
          </Link>
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
          一覧の取得に失敗しました: {errorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">保証書一覧</h2>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            まだ保証書は登録されていません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">保証書番号</th>
                  <th className="px-4 py-3 font-medium">施主名</th>
                  <th className="px-4 py-3 font-medium">保証開始日</th>
                  <th className="px-4 py-3 font-medium">対象機器数</th>
                  <th className="px-4 py-3 font-medium">紹介者</th>
                  <th className="px-4 py-3 font-medium">販売店名</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">登録日</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/warranty-certificates/detail?id=${row.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {row.certificate_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.customer_name}</td>
                    <td className="px-4 py-3">{formatDate(row.start_date)}</td>
                    <td className="px-4 py-3">
                      {enabledItemCount(row.warranty_certificate_items)}件
                    </td>
                    <td className="px-4 py-3">{row.introducer_name || "-"}</td>
                    <td className="px-4 py-3">{row.seller_name || "-"}</td>
                    <td className="px-4 py-3">{statusLabel(row.status)}</td>
                    <td className="px-4 py-3">{formatDate(row.created_at)}</td>
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