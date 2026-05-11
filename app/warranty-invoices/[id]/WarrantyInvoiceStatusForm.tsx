"use client";

import { useState } from "react";

type Props = {
  invoiceId: string;
  currentStatus: string | null;
};

const STATUS_OPTIONS = [
  {
    value: "draft",
    label: "下書き",
  },
  {
    value: "issued",
    label: "発行済み",
  },
  {
    value: "unpaid",
    label: "未入金",
  },
  {
    value: "paid",
    label: "入金済み",
  },
  {
    value: "cancelled",
    label: "取消",
  },
];

export default function WarrantyInvoiceStatusForm({
  invoiceId,
  currentStatus,
}: Props) {
  const [status, setStatus] = useState(currentStatus || "draft");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/warranty-invoice-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          status,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "保存に失敗しました");
      }

      setMessage("保存しました");

      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "保存中にエラーが発生しました"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">入金ステータス管理</h2>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "保存中..." : "ステータス保存"}
        </button>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-gray-600">{message}</p>
      ) : null}
    </div>
  );
}