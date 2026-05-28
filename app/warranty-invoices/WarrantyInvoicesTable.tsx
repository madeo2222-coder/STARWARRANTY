"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type WarrantyInvoiceRow = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  subject: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
  paid_at: string | null;
  status: string | null;
  created_at: string | null;
  last_invoice_sent_at: string | null;
  last_reminder_sent_at: string | null;
};

type Props = {
  invoices: WarrantyInvoiceRow[];
};

function formatYen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "draft":
      return "下書き";
    case "issued":
      return "発行済み";
    case "unpaid":
      return "未入金";
    case "overdue":
      return "期限超過";
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
    case "overdue":
      return "border-red-200 bg-red-50 text-red-700";
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

function isUnpaid(status: string | null | undefined) {
  return ["issued", "unpaid", "overdue", "draft", null, undefined].includes(status);
}

function isOverdue(invoice: WarrantyInvoiceRow) {
  if (!isUnpaid(invoice.status)) return false;
  if (invoice.status === "overdue") return true;
  if (!invoice.payment_due_date) return false;

  return new Date(invoice.payment_due_date).getTime() < new Date().getTime();
}

export default function WarrantyInvoicesTable({ invoices }: Props) {
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [remindingInvoiceId, setRemindingInvoiceId] = useState<string | null>(
    null
  );
  const [markingPaidInvoiceId, setMarkingPaidInvoiceId] = useState<
    string | null
  >(null);

  const filteredInvoices = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const searchableText = [
        invoice.invoice_no,
        invoice.bill_to_company_name,
        invoice.bill_to_name,
        invoice.subject,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedKeyword || searchableText.includes(normalizedKeyword)) &&
        (statusFilter === "all" || invoice.status === statusFilter) &&
        (!overdueOnly || isOverdue(invoice))
      );
    });
  }, [invoices, keyword, statusFilter, overdueOnly]);

  const handleOpenPdf = async (invoiceId: string) => {
    try {
      const res = await fetch("/api/generate-warranty-invoice-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });

      if (!res.ok) {
        alert("PDF生成に失敗しました");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      alert("PDF表示エラー");
    }
  };

  const handleSendInvoice = async (invoice: WarrantyInvoiceRow) => {
    const toEmail = window.prompt("請求書を送信するメールアドレスを入力してください");
    if (!toEmail || !toEmail.trim()) return;

    if (!window.confirm(`${toEmail.trim()} に請求書PDFを送信します。よろしいですか？`)) return;

    try {
      setSendingInvoiceId(invoice.id);

      const res = await fetch("/api/send-warranty-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          to_email: toEmail.trim(),
          subject: "【株式会社スター・ワランティ】請求書送付のご案内",
        }),
      });

      const result = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !result.success) {
        alert(result.error || "請求書メール送信に失敗しました");
        return;
      }

      alert("請求書メールを送信しました。");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("請求書メール送信中にエラーが発生しました");
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const handleSendReminder = async (invoice: WarrantyInvoiceRow) => {
    const toEmail = window.prompt("督促メールを送信するメールアドレスを入力してください");
    if (!toEmail || !toEmail.trim()) return;

    if (!window.confirm(`${toEmail.trim()} に督促メールを送信します。よろしいですか？`)) return;

    try {
      setRemindingInvoiceId(invoice.id);

      const res = await fetch("/api/send-warranty-invoice-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          to_email: toEmail.trim(),
          subject: "【株式会社スター・ワランティ】請求書ご確認のお願い",
        }),
      });

      const result = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !result.success) {
        alert(result.error || "督促メール送信に失敗しました");
        return;
      }

      alert("督促メールを送信しました。");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("督促メール送信中にエラーが発生しました");
    } finally {
      setRemindingInvoiceId(null);
    }
  };

  const handleMarkPaid = async (invoice: WarrantyInvoiceRow) => {
    const ok = window.confirm(
      `${invoice.invoice_no || "この請求書"} を入金済みにします。よろしいですか？`
    );

    if (!ok) return;

    try {
      setMarkingPaidInvoiceId(invoice.id);

      const res = await fetch("/api/mark-warranty-invoice-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });

      const result = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !result.success) {
        alert(result.error || "入金処理に失敗しました");
        return;
      }

      alert("入金済みに更新しました。");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("入金処理中にエラーが発生しました");
    } finally {
      setMarkingPaidInvoiceId(null);
    }
  };

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">請求書一覧</h2>
        <p className="mt-1 text-sm text-gray-500">
          作成済みの請求書を検索・絞り込みできます。
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_160px]">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="請求書番号・宛先・件名で検索"
            className="rounded-lg border px-3 py-2 text-sm outline-none"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm outline-none"
          >
            <option value="all">全ステータス</option>
            <option value="draft">下書き</option>
            <option value="issued">発行済み</option>
            <option value="unpaid">未入金</option>
            <option value="overdue">期限超過</option>
            <option value="paid">入金済み</option>
            <option value="cancelled">取消</option>
          </select>

          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            期限超過のみ
          </label>
        </div>

        <p className="mt-3 text-sm text-gray-500">
          表示件数：{filteredInvoices.length}件 / 全{invoices.length}件
        </p>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="p-6 text-sm text-gray-500">
          条件に一致する請求書はありません。
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
                <th className="px-4 py-3 font-medium">入金日</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium">送信履歴</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((invoice) => {
                const billTo =
                  invoice.bill_to_company_name || invoice.bill_to_name || "未設定";

                const overdue = isOverdue(invoice);
                const isSending = sendingInvoiceId === invoice.id;
                const isReminding = remindingInvoiceId === invoice.id;
                const isMarkingPaid = markingPaidInvoiceId === invoice.id;
                const isBusy = isSending || isReminding || isMarkingPaid;

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
                      {formatDateTime(invoice.paid_at)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                          invoice.status
                        )}`}
                      >
                        {statusLabel(invoice.status)}
                      </span>

                      {overdue && invoice.status !== "overdue" ? (
                        <span className="ml-2 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700">
                          期限超過
                        </span>
                      ) : null}
                    </td>

                    <td className="min-w-[180px] whitespace-nowrap px-4 py-3 text-xs">
                      <div className="space-y-1">
                        <div>
                          <span className="font-medium text-blue-700">
                            請求送信：
                          </span>
                          {formatDateTime(invoice.last_invoice_sent_at)}
                        </div>
                        <div>
                          <span className="font-medium text-red-700">
                            督促：
                          </span>
                          {formatDateTime(invoice.last_reminder_sent_at)}
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/warranty-invoices/${invoice.id}`}
                          className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                        >
                          詳細
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleOpenPdf(invoice.id)}
                          className="rounded-lg border bg-black px-3 py-2 text-xs text-white hover:bg-gray-800"
                        >
                          PDF
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendInvoice(invoice)}
                          disabled={isBusy}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSending
                            ? "送信中"
                            : invoice.last_invoice_sent_at
                              ? "再送信"
                              : "送信"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendReminder(invoice)}
                          disabled={isBusy || invoice.status === "paid"}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isReminding
                            ? "送信中"
                            : invoice.last_reminder_sent_at
                              ? "再督促"
                              : "督促"}
                        </button>

                        {invoice.status !== "paid" ? (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(invoice)}
                            disabled={isBusy}
                            className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isMarkingPaid ? "処理中" : "入金済み"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}