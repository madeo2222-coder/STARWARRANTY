"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  invoiceId: string;
};

export default function WarrantyInvoiceDeleteButton({ invoiceId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleDelete() {
    console.log("削除ボタン押された");

    const confirmed = window.confirm(
      "この請求書を削除します。明細・送信履歴も削除されます。本当に削除しますか？"
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      setMessage("");

      const response = await fetch("/api/warranty-invoice-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
        }),
      });

      console.log("削除APIレスポンス", response);

      const result = await response.json();

      console.log("削除API結果", result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || "請求書の削除に失敗しました");
      }

      router.push("/warranty-invoices");
      router.refresh();
    } catch (error) {
      console.error("削除エラー", error);

      setMessage(
        error instanceof Error ? error.message : "請求書の削除に失敗しました"
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "削除中..." : "削除"}
      </button>

      {message ? <p className="mt-2 text-xs text-red-600">{message}</p> : null}
    </div>
  );
}