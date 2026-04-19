"use client";

type Props = {
  billingId: string;
  customerName?: string;
  canReceipt: boolean;
};

function buildPreviewHtml(documentHtml: string) {
  return `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>帳票プレビュー</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #f5f5f5;
      font-family: Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: rgba(255,255,255,0.95);
      border: 1px solid #ddd;
      border-radius: 12px;
    }
    .toolbar button {
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 14px;
      cursor: pointer;
      background: #111827;
      color: white;
    }
    .sheet {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .toolbar {
        display: none !important;
      }
      .sheet {
        max-width: none;
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
  <script>
    function goBackToBillings() {
      try {
        if (window.opener && !window.opener.closed) {
          window.close();
          return;
        }

        if (window.history.length > 1) {
          window.history.back();

          setTimeout(function () {
            window.location.href = "/billings";
          }, 400);

          return;
        }

        window.location.href = "/billings";
      } catch (e) {
        window.location.href = "/billings";
      }
    }
  </script>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">印刷 / PDF保存</button>
    <button onclick="goBackToBillings()">戻る</button>
  </div>
  <div class="sheet">
    ${documentHtml}
  </div>
</body>
</html>
  `.trim();
}

async function parseJsonSafely(res: Response) {
  const rawText = await res.text();

  try {
    return JSON.parse(rawText);
  } catch {
    return {
      success: false,
      error:
        rawText.startsWith("<!DOCTYPE") || rawText.startsWith("<html")
          ? "APIがHTMLエラーを返しました。/api/generate-document 側でエラーが出ています。"
          : rawText || "不明なレスポンスです",
    };
  }
}

export default function BillingActionsClient({
  billingId,
  customerName,
  canReceipt,
}: Props) {
  const label = customerName?.trim() || "お客様";

  async function openDocument(documentType: "invoice" | "receipt") {
    try {
      const res = await fetch("/api/generate-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_type: documentType,
          billing_id: billingId,
        }),
      });

      const json = await parseJsonSafely(res);

      if (!res.ok || !json.success) {
        alert(json.error || "帳票生成に失敗しました");
        return;
      }

      const html = buildPreviewHtml(String(json.html || ""));
      const previewWindow = window.open("", "_blank");

      if (previewWindow) {
        previewWindow.document.open();
        previewWindow.document.write(html);
        previewWindow.document.close();
        return;
      }

      document.open();
      document.write(html);
      document.close();
    } catch (error) {
      console.error(error);
      alert("帳票生成でエラーが発生しました");
    }
  }

  async function sendDocumentByEmail(documentType: "invoice" | "receipt") {
    try {
      const email = window.prompt("送信先メールアドレスを入力してください");
      if (!email) return;

      const generateRes = await fetch("/api/generate-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_type: documentType,
          billing_id: billingId,
        }),
      });

      const generateJson = await parseJsonSafely(generateRes);

      if (!generateRes.ok || !generateJson.success) {
        alert(generateJson.error || "帳票生成に失敗しました");
        return;
      }

      const sendRes = await fetch("/api/send-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_email: email,
          subject:
            documentType === "invoice"
              ? `請求書送付（${label}）`
              : `領収書送付（${label}）`,
          html: generateJson.html,
        }),
      });

      const sendJson = await parseJsonSafely(sendRes);

      if (!sendRes.ok || !sendJson.success) {
        alert(sendJson.error || "メール送信に失敗しました");
        return;
      }

      alert("送信しました");
    } catch (error) {
      console.error(error);
      alert("メール送信でエラーが発生しました");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void openDocument("invoice")}
        className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white"
      >
        請求書出力
      </button>

      <button
        type="button"
        onClick={() => void openDocument("receipt")}
        disabled={!canReceipt}
        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        領収書出力
      </button>

      <button
        type="button"
        onClick={() => void sendDocumentByEmail("invoice")}
        className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white"
      >
        請求書メール送信
      </button>

      <button
        type="button"
        onClick={() => void sendDocumentByEmail("receipt")}
        disabled={!canReceipt}
        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        領収書メール送信
      </button>
    </div>
  );
}