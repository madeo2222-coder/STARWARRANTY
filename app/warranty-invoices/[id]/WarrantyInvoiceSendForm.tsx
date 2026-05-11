"use client";

import { useState } from "react";

type Props = {
  invoiceId: string;
  defaultSubject: string;
};

export default function WarrantyInvoiceSendForm({
  invoiceId,
  defaultSubject,
}: Props) {
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSend() {
    try {
      if (!toEmail.trim()) {
        setMessage("送信先メールアドレスを入力してください");
        return;
      }

      setLoading(true);
      setMessage("");

      const response = await fetch("/api/send-warranty-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          to_email: toEmail,
          subject,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "メール送信に失敗しました");
      }

      setMessage("請求書メールを送信しました");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "送信中にエラーが発生しました"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">請求書メール送信</h2>

      <div className="mt-4 grid gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            送信先メールアドレス
          </label>

          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="example@company.com"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            件名
          </label>

          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "送信中..." : "請求書メール送信"}
        </button>

        {message ? (
          <p className="text-sm text-gray-600">{message}</p>
        ) : null}
      </div>
    </div>
  );
}