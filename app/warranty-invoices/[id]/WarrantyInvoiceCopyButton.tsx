"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  invoiceId: string;
};

export default function WarrantyInvoiceCopyButton({ invoiceId }: Props) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");

  async function handleCopy() {
    try {
      setCopying(true);
      setMessage("");

      const response = await fetch("/api/warranty-invoice-copy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.invoice_id) {
        throw new Error(result.error || "コピー作成に失敗しました");
      }

      router.push(`/warranty-invoices/${result.invoice_id}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "コピー作成に失敗しました"
      );
    } finally {
      setCopying(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleCopy}
        disabled={copying}
        className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {copying ? "コピー中..." : "コピー作成"}
      </button>

      {message ? <p className="mt-2 text-xs text-red-600">{message}</p> : null}
    </div>
  );
}