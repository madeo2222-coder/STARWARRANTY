import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import WarrantyInvoiceSendForm from "./WarrantyInvoiceSendForm";
import WarrantyInvoiceStatusForm from "./WarrantyInvoiceStatusForm";
import WarrantyInvoiceCopyButton from "./WarrantyInvoiceCopyButton";
import WarrantyInvoiceReminderForm from "./WarrantyInvoiceReminderForm";
import WarrantyInvoiceDeleteButton from "./WarrantyInvoiceDeleteButton";

export const dynamic = "force-dynamic";

type WarrantyInvoice = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  payment_due_date: string | null;
  subject: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  status: string | null;
  note: string | null;
  created_at: string | null;
  paid_at: string | null;
};

type WarrantyInvoiceItem = {
  id: string;
  invoice_id: string;
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  sort_order: number | null;
  created_at: string | null;
};

type WarrantyInvoiceSendLog = {
  id: string;
  to_email: string | null;
  subject: string | null;
  sent_at: string | null;
  send_type?: string | null;
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

export default async function WarrantyInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getAdminClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("warranty_invoices")
    .select(
      "id, invoice_no, invoice_date, payment_due_date, subject, bill_to_company_name, bill_to_name, bill_to_email, subtotal, tax_rate, tax_amount, total_amount, status, note, created_at, paid_at"
    )
    .eq("id", id)
    .single();

  if (invoiceError || !invoice) {
    notFound();
  }

  const { data: items, error: itemsError } = await supabase
    .from("warranty_invoice_items")
    .select(
      "id, invoice_id, item_name, description, quantity, unit_price, amount, sort_order, created_at"
    )
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true });

  const { data: sendLogs } = await supabase
    .from("warranty_invoice_send_logs")
    .select("id, to_email, subject, sent_at, send_type")
    .eq("invoice_id", id)
    .order("sent_at", {
      ascending: false,
    });

  const invoiceData = invoice as WarrantyInvoice;
  const itemRows = (items || []) as WarrantyInvoiceItem[];
  const sendLogRows = (sendLogs || []) as WarrantyInvoiceSendLog[];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">請求書詳細</h1>
          <p className="mt-1 text-sm text-gray-500">
            作成済み請求書の内容を確認できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/warranty-invoices"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            請求書一覧へ戻る
          </Link>

          <Link
            href={`/warranty-invoices/${invoiceData.id}/edit`}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            編集
          </Link>

          <WarrantyInvoiceCopyButton invoiceId={invoiceData.id} />

          <WarrantyInvoiceDeleteButton invoiceId={invoiceData.id} />

          <form
            action="/api/generate-warranty-invoice-pdf"
            method="POST"
            target="_blank"
          >
            <input type="hidden" name="invoice_id" value={invoiceData.id} />

            <button
              type="submit"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
            >
              PDF発行
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-gray-500">請求書番号</p>
            <h2 className="mt-1 text-xl font-bold">
              {invoiceData.invoice_no || "-"}
            </h2>
          </div>

          <span
            className={`inline-flex w-fit rounded-full border px-3 py-1 text-sm font-medium ${statusBadgeClass(
              invoiceData.status
            )}`}
          >
            {statusLabel(invoiceData.status)}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-gray-50 p-4">
            <p className="text-sm text-gray-500">請求日</p>
            <p className="mt-1 font-semibold">
              {formatDate(invoiceData.invoice_date)}
            </p>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4">
            <p className="text-sm text-gray-500">支払期限</p>
            <p className="mt-1 font-semibold">
              {formatDate(invoiceData.payment_due_date)}
            </p>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4">
            <p className="text-sm text-gray-500">請求額</p>
            <p className="mt-1 font-semibold">
              {formatYen(invoiceData.total_amount)}
            </p>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4">
            <p className="text-sm text-gray-500">入金日</p>
            <p className="mt-1 font-semibold">
              {formatDate(invoiceData.paid_at)}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm text-gray-500">件名</p>
          <p className="mt-1 text-lg font-semibold">
            {invoiceData.subject || "-"}
          </p>
        </div>
      </div>

      <WarrantyInvoiceStatusForm
        invoiceId={invoiceData.id}
        currentStatus={invoiceData.status}
      />

      <WarrantyInvoiceSendForm
        invoiceId={invoiceData.id}
        defaultSubject={`【株式会社スター・ワランティ】請求書送付のご案内 (${
          invoiceData.invoice_no || ""
        })`}
      />

      <WarrantyInvoiceReminderForm
        invoiceId={invoiceData.id}
        defaultSubject={`【株式会社スター・ワランティ】請求書ご確認のお願い (${
          invoiceData.invoice_no || ""
        })`}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">宛先情報</h2>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-gray-500">会社名</p>
              <p className="mt-1 font-medium">
                {invoiceData.bill_to_company_name || "-"}
              </p>
            </div>

            <div>
              <p className="text-gray-500">担当者名</p>
              <p className="mt-1 font-medium">
                {invoiceData.bill_to_name || "-"}
              </p>
            </div>

            <div>
              <p className="text-gray-500">請求先メールアドレス</p>
              <p className="mt-1 font-medium">
                {invoiceData.bill_to_email || "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">金額情報</h2>

          <div className="mt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">小計</span>
              <span className="font-medium">
                {formatYen(invoiceData.subtotal)}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-500">消費税</span>
              <span className="font-medium">
                {formatYen(invoiceData.tax_amount)}
              </span>
            </div>

            <div className="flex justify-between border-t pt-3 text-lg font-bold">
              <span>合計</span>
              <span>{formatYen(invoiceData.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">請求明細</h2>
          <p className="mt-1 text-sm text-gray-500">
            登録された請求明細を表示します。
          </p>
        </div>

        {itemsError ? (
          <div className="p-5 text-sm text-red-600">
            明細の取得に失敗しました: {itemsError.message}
          </div>
        ) : itemRows.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">
            明細データがありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">明細名</th>
                  <th className="px-4 py-3 font-medium">説明</th>
                  <th className="px-4 py-3 text-right font-medium">数量</th>
                  <th className="px-4 py-3 text-right font-medium">単価</th>
                  <th className="px-4 py-3 text-right font-medium">金額</th>
                </tr>
              </thead>

              <tbody>
                {itemRows.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {item.item_name || "-"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {item.description || "-"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {Number(item.quantity || 0).toLocaleString("ja-JP")}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {formatYen(item.unit_price)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {formatYen(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">メール送信履歴</h2>

        {sendLogRows.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">送信履歴はありません。</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">送信日時</th>
                  <th className="px-4 py-3 font-medium">送信先</th>
                  <th className="px-4 py-3 font-medium">種別</th>
                  <th className="px-4 py-3 font-medium">件名</th>
                </tr>
              </thead>

              <tbody>
                {sendLogRows.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(log.sent_at)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {log.to_email || "-"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {log.send_type === "reminder" ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                          督促
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                          通常
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">{log.subject || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">備考</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
          {invoiceData.note || "備考はありません。"}
        </p>
      </div>
    </div>
  );
}