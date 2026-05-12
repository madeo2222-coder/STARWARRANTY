"use client";

import { useState } from "react";

type Props = {
  invoiceId: string;
  defaultSubject: string;
};

export default function WarrantyInvoiceReminderForm({
  invoiceId,
  defaultSubject,
}: Props) {
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState(defaultSubject);

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        "/api/send-warranty-invoice-reminder",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            invoice_id: invoiceId,
            to_email: toEmail,
            subject,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            "督促メール送信に失敗しました"
        );
      }

      setMessage("督促メールを送信しました。");
      setToEmail("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "送信に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">
        督促メール送信
      </h2>

      <form
        onSubmit={handleSubmit}
        className="mt-4 space-y-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">
            送信先メール
          </label>

          <input
            type="email"
            required
            value={toEmail}
            onChange={(e) =>
              setToEmail(e.target.value)
            }
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            placeholder="example@example.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            件名
          </label>

          <input
            type="text"
            required
            value={subject}
            onChange={(e) =>
              setSubject(e.target.value)
            }
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading
            ? "送信中..."
            : "督促メール送信"}
        </button>

        {message ? (
          <p className="text-sm text-gray-600">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}