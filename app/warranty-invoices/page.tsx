import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import WarrantyInvoicesTable from "./WarrantyInvoicesTable";

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

function isConfirmedInvoice(status: string | null | undefined) {
  return status === "issued" || status === "unpaid" || status === "paid";
}

function isUnpaid(status: string | null | undefined) {
  return status === "unpaid";
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

  const confirmedInvoices = invoices.filter((invoice) =>
    isConfirmedInvoice(invoice.status)
  );

  const unpaidInvoices = invoices.filter((invoice) =>
    isUnpaid(invoice.status)
  );

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");

  const now = new Date();

  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  const currentMonthTotal = confirmedInvoices
    .filter((invoice) => (invoice.invoice_date || "").startsWith(currentMonth))
    .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);

  const unpaidTotal = unpaidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount || 0),
    0
  );

  const overdueInvoices = unpaidInvoices.filter((invoice) => {
    if (!invoice.payment_due_date) return false;

    const dueDate = new Date(invoice.payment_due_date);

    return dueDate.getTime() < now.getTime();
  });

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
            href="/api/warranty-invoices-csv"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            CSV出力
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

      <div className="grid gap-4 md:grid-cols-6">
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
          <div className="text-sm text-gray-500">今月確定請求額</div>
          <div className="mt-2 text-2xl font-bold">
            {formatYen(currentMonthTotal)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未入金合計</div>
          <div className="mt-2 text-2xl font-bold text-red-600">
            {formatYen(unpaidTotal)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">期限超過</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {overdueInvoices.length}
          </div>
        </div>
      </div>

      <WarrantyInvoicesTable invoices={invoices} />

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">次の実装</h2>
          <p className="mt-1 text-sm text-gray-500">
            請求書管理で追加していく機能です。
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 className="font-semibold">ダッシュボード連携</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              未入金・期限超過・今月請求額をホーム画面にも表示できるようにします。
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="font-semibold">自動リマインド</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              支払期限超過の請求書に対して、案内メール送信を行えるようにします。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}