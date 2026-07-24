"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

function getFallbackPdfError(status: number) {
  switch (status) {
    case 401:
      return "ログイン情報が無効です。再度ログインしてください。";
    case 403:
      return "保証書PDFを表示する権限がありません。";
    case 404:
      return "対象の保証書が見つかりませんでした。";
    case 500:
      return "保証書PDFの生成中にエラーが発生しました。";
    default:
      return "保証書PDFの取得に失敗しました。";
  }
}

async function readErrorMessage(response: Response) {
  const fallbackMessage = getFallbackPdfError(response.status);
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as
      | {
          error?: string;
          message?: string;
        }
      | null;

    return json?.error || json?.message || fallbackMessage;
  }

  const text = await response.text().catch(() => "");
  return text.trim() || fallbackMessage;
}

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

    // ユーザーのクリック操作と同じタイミングで先にタブを確保する。
    const pdfWindow = window.open("", "_blank");

    if (!pdfWindow) {
      setErrorMessage(
        "PDF表示がブラウザにブロックされました。ポップアップを許可して、もう一度お試しください。"
      );
      setLoading(false);
      return;
    }

    try {
      pdfWindow.opener = null;
      pdfWindow.document.title = "保証書PDFを準備しています";
      pdfWindow.document.body.innerHTML =
        '<p style="font-family:sans-serif;padding:24px;">保証書PDFを準備しています...</p>';

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        throw new Error(
          "ログイン情報が取得できませんでした。再度ログインしてください。"
        );
      }

      const response = await fetch(
        `/api/generate-warranty-pdf?id=${encodeURIComponent(certificateId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("application/pdf")) {
        throw new Error(
          await readErrorMessage(response).catch(
            () => "PDF以外のレスポンスが返されました。"
          )
        );
      }

      const pdfBlob = await response.blob();

      if (pdfBlob.size === 0) {
        throw new Error("生成された保証書PDFが空でした。");
      }

      const objectUrl = URL.createObjectURL(pdfBlob);

      pdfWindow.location.replace(objectUrl);

      // PDFビューアーがBlobを読み終える前に解放しないよう、十分に待つ。
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 5 * 60 * 1000);
    } catch (error) {
      if (!pdfWindow.closed) {
        pdfWindow.close();
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "保証書PDFの取得中に通信エラーが発生しました。"
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