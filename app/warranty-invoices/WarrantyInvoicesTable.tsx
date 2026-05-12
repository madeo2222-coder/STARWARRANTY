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
  status: string | null;
  created_at: string | null;
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

function isUnpaid(status: string | null | undefined) {
  return ["issued", "unpaid", "draft", null, undefined].includes(status);
}

function isOverdue(invoice: WarrantyInvoiceRow) {
  if (!isUnpaid(invoice.status)) return false;
  if (!invoice.payment_due_date) return false;

  const now = new Date();
  const dueDate = new Date(invoice.payment_due_date);

  return dueDate.getTime() < now.getTime();
}

export default function WarrantyInvoicesTable({ invoices }: Props) {
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

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

      const matchesKeyword =
        !normalizedKeyword || searchableText.includes(normalizedKeyword);

      const matchesStatus =
        statusFilter === "all" || invoice.status === statusFilter;

      const matchesOverdue = !overdueOnly || isOverdue(invoice);

      return matchesKeyword && matchesStatus && matchesOverdue;
    });
  }, [invoices, keyword, statusFilter, overdueOnly]);

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
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((invoice) => {
                const billTo =
                  invoice.bill_to_company_name ||
                  invoice.bill_to_name ||
                  "未設定";

                const overdue = isOverdue(invoice);

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

                      {overdue ? (
                        <span className="ml-2 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700">
                          期限超過
                        </span>
                      ) : null}
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
  );
}