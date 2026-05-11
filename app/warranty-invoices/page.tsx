import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type WarrantyInvoiceRow = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  subject: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
  status: string | null;
  created_at: string | null;
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

function formatYen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value;
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "draft":
      return "下書き";
    case "issued":
      return "発行済み";
    case "unpaid":
      return "未入金";
    case "paid":
      return "入金済み";
    case "cancelled":
      return "取消";
    default:
      return status || "未設定";
  }
}

function statusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case "paid":
      return "border-green-200 bg-green-50 text-green-700";
    case "unpaid":
    case "issued":
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    case "cancelled":
      return "border-red-200 bg-red-50 text-red-700";
    case "draft":
      return "border-gray-200 bg-gray-50 text-gray-700";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

export default async function WarrantyInvoicesPage() {
  let invoices: WarrantyInvoiceRow[] = [];
  let errorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_invoices")
      .select(
        "id, invoice_no, invoice_date, subject, bill_to_company_name, bill_to_name, total_amount, payment_due_date, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      invoices = (data || []) as WarrantyInvoiceRow[];
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "請求書一覧の取得に失敗しました";
  }

  const unpaidInvoices = invoices.filter((invoice) =>
    ["issued", "unpaid", "draft", null, undefined].includes(invoice.status)
  );
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  const currentMonthTotal = invoices
    .filter((invoice) => (invoice.invoice_date || "").startsWith(currentMonth))
    .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);

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

          <Link
            href="/warranty-invoices/new"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            新規作成
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          請求書一覧の取得に失敗しました: {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">全請求書</div>
          <div className="mt-2 text-3xl font-bold">{invoices.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未入金</div>
          <div className="mt-2 text-3xl font-bold">{unpaidInvoices.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">入金済み</div>
          <div className="mt-2 text-3xl font-bold">{paidInvoices.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">今月請求額</div>
          <div className="mt-2 text-3xl font-bold">
            {formatYen(currentMonthTotal)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">請求書一覧</h2>
          <p className="mt-1 text-sm text-gray-500">
            作成済みの請求書を一覧で確認できます。
          </p>
        </div>

        {invoices.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            まだ請求書データはありません。右上の新規作成から請求書を作成できます。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">請求書番号</th>
                  <th className="px-4 py-3 font-medium">請求日</th>
                  <th className="px-4 py-3 font-medium">宛先</th>
                  <th className="px-4 py-3 font-medium">件名</th>
                  <th className="px-4 py-3 font-medium">請求額</th>
                  <th className="px-4 py-3 font-medium">支払期限</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>

              <tbody>
                {invoices.map((invoice) => {
                  const billTo =
                    invoice.bill_to_company_name ||
                    invoice.bill_to_name ||
                    "未設定";

                  return (
                    <tr key={invoice.id} className="border-t hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {invoice.invoice_no || "-"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatDate(invoice.invoice_date)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">{billTo}</td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {invoice.subject || "-"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        {formatYen(invoice.total_amount)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatDate(invoice.payment_due_date)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                            invoice.status
                          )}`}
                        >
                          {statusLabel(invoice.status)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/warranty-invoices/${invoice.id}`}
                          className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                        >
                          詳細を見る
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">次の実装</h2>
          <p className="mt-1 text-sm text-gray-500">
            請求書管理で追加していく機能です。
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 className="font-semibold">PDF発行</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              登録済み請求書をPDFとして出力できるようにします。
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="font-semibold">入金ステータス変更</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              未入金・入金済み・取消などの状態を管理できるようにします。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}