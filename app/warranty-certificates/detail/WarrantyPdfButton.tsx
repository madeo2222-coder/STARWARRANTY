"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function WarrantyPdfButton({
  certificateId,
}: {
  certificateId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function openPdf() {
    if (loading) return;
    setLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session?.access_token) {
        throw new Error("ログイン情報が取得できませんでした");
      }

      const response = await fetch(
        `/api/generate-warranty-pdf?id=${encodeURIComponent(certificateId)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(json?.error || "保証書PDFの取得に失敗しました");
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "保証書PDFの取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void openPdf()}
        disabled={loading}
        className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "PDF取得中..." : "保証書印刷表示"}
      </button>
      {errorMessage ? (
        <p className="max-w-xs text-xs text-red-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
