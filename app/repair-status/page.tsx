"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type RepairStatusResult = {
  request: {
    request_no: string;
    customer_name: string;
    product_name: string;
    status: string;
    status_label: string;
    assigned_to: string | null;
    created_at: string;
  };
  histories: {
    id: string;
    action_type: string;
    title: string;
    detail: string | null;
    created_at: string;
  }[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function RepairStatusContent() {
  const searchParams = useSearchParams();

  const initialRequestNo = useMemo(
    () => searchParams.get("request_no") || "",
    [searchParams]
  );

  const [requestNo, setRequestNo] = useState(initialRequestNo);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<RepairStatusResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setErrorMessage("");
    setResult(null);

    try {
      const params = new URLSearchParams({
        request_no: requestNo.trim(),
        phone: phone.trim(),
      });

      const res = await fetch(`/api/repair-status?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "受付状況の確認に失敗しました");
      }

      setResult({
        request: json.request,
        histories: json.histories || [],
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "受付状況の確認に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">STAR WARRANTY</p>
        <h1 className="mt-1 text-2xl font-bold">修理受付状況の確認</h1>
        <p className="mt-2 text-sm text-gray-500">
          受付番号と電話番号を入力すると、現在の対応状況を確認できます。
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">受付番号</label>
          <input
            type="text"
            value={requestNo}
            onChange={(e) => setRequestNo(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="例：RR-20260428-123456"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">電話番号</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="受付時に入力した電話番号"
          />
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black px-4 py-3 text-sm text-white disabled:opacity-50"
        >
          {loading ? "確認中..." : "受付状況を確認する"}
        </button>
      </form>

      {result ? (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">現在の受付状況</h2>

            <div className="mt-4 rounded-xl border bg-gray-50 p-4">
              <div className="text-sm text-gray-500">現在のステータス</div>
              <div className="mt-1 text-2xl font-bold">
                {result.request.status_label}
              </div>
            </div>

            <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              <div>
                <div className="text-gray-500">受付番号</div>
                <div className="mt-1 font-medium">
                  {result.request.request_no}
                </div>
              </div>

              <div>
                <div className="text-gray-500">対象機器</div>
                <div className="mt-1 font-medium">
                  {result.request.product_name}
                </div>
              </div>

              <div>
                <div className="text-gray-500">受付日時</div>
                <div className="mt-1 font-medium">
                  {formatDateTime(result.request.created_at)}
                </div>
              </div>

              <div>
                <div className="text-gray-500">担当</div>
                <div className="mt-1 font-medium">
                  {result.request.assigned_to || "確認中"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">対応履歴</h2>

            {result.histories.length > 0 ? (
              <div className="mt-4 space-y-4">
                {result.histories.map((history) => (
                  <div key={history.id} className="rounded-xl border p-4">
                    <div className="font-medium">{history.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatDateTime(history.created_at)}
                    </div>

                    {history.detail ? (
                      <div className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                        {history.detail}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
                まだ表示できる対応履歴はありません。
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-gray-50 p-4 text-xs text-gray-500">
            表示内容は受付状況の確認用です。詳細確認が必要な場合は、担当者からの連絡をお待ちください。
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function RepairStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl p-4 md:p-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            読み込み中...
          </div>
        </div>
      }
    >
      <RepairStatusContent />
    </Suspense>
  );
}