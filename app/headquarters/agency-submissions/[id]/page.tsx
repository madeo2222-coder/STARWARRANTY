"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SubmissionFile = {
  id: string;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_at: string;
  download_url: string | null;
};

type SubmissionBatch = {
  id: string;
  batch_no: string;
  partner_id: string;
  partner_name: string;
  partner_type: string | null;
  target_month: string;
  source_type: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  revision_no: number;
  parse_status: string;
  duplicate_status: string;
  parsed_at: string | null;
  parse_error: string | null;
  duplicate_of_batch_id: string | null;
  total_count: number;
  success_count: number;
  error_count: number;
  files: SubmissionFile[];
};

type SubmissionRow = {
  id: string;
  sheet_name: string;
  row_number: number;
  customer_name: string | null;
  address_full: string | null;
  warranty_start_date: string | null;
  plan_code: string | null;
  manufacturer: string | null;
  model_number: string | null;
  warranty_fee: number | null;
  validation_status: string;
  duplicate_status: string;
};

type SubmissionEvent = {
  id: string;
  event_type: string;
  actor_label: string | null;
  previous_status: string | null;
  next_status: string | null;
  note: string | null;
  created_at: string;
};

type DetailResponse = {
  success: boolean;
  error?: string;
  can_update?: boolean;
  batch?: SubmissionBatch;
  rows?: SubmissionRow[];
  events?: SubmissionEvent[];
};

const workflowTransitions: Record<string, string[]> = {
  submitted: ["reviewing"],
  reviewing: ["approved", "returned"],
  returned: ["reviewing"],
  approved: ["processing"],
  processing: ["warranty_created"],
  warranty_created: ["printed"],
  printed: ["mailed"],
  mailed: ["completed"],
  completed: [],
};

const statusLabels: Record<string, string> = {
  pending: "未処理",
  parsed: "解析完了",
  warning: "警告あり",
  failed: "解析失敗",
  unchecked: "未判定",
  unique: "重複なし",
  duplicate: "重複あり",
  needs_review: "要確認",
  valid: "正常",
  error: "エラー",
  submitted: "受付済",
  reviewing: "確認中",
  returned: "差戻し",
  approved: "受付完了",
  processing: "処理中",
  warranty_created: "保証書作成済",
  printed: "印刷済",
  mailed: "郵送済",
  completed: "処理完了",
};

function formatStatus(value: string | null | undefined) {
  if (!value) return "-";
  return statusLabels[value] || value;
}

function statusClass(value: string | null | undefined) {
  if (["failed", "error", "duplicate", "returned"].includes(value || "")) {
    return "bg-red-100 text-red-700";
  }

  if (["warning", "needs_review", "unchecked"].includes(value || "")) {
    return "bg-yellow-100 text-yellow-700";
  }

  if (["parsed", "valid", "unique", "completed"].includes(value || "")) {
    return "bg-green-100 text-green-700";
  }

  return "bg-gray-100 text-gray-700";
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${statusClass(
        value
      )}`}
    >
      {formatStatus(value)}
    </span>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

function formatTargetMonth(value: string | null | undefined) {
  if (!value) return "-";

  const [year, month] = value.slice(0, 7).split("-");
  return year && month ? `${year}年${Number(month)}月` : value;
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatYen(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("ja-JP")}円`;
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-gray-900">
        {children}
      </div>
    </div>
  );
}

export default function AgencySubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [batch, setBatch] = useState<SubmissionBatch | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [events, setEvents] = useState<SubmissionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [canUpdate, setCanUpdate] = useState(false);
  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [updating, setUpdating] = useState(false);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("ログイン情報が取得できませんでした");
    }

    return session.access_token;
  }, [supabase]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/submission-batches/${id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const json = (await response.json()) as DetailResponse;

      if (!response.ok || !json.success || !json.batch) {
        throw new Error(json.error || "受付詳細の取得に失敗しました");
      }

      setBatch(json.batch);
      setRows(json.rows || []);
      setEvents(json.events || []);
      setCanUpdate(Boolean(json.can_update));
      setNextStatus(workflowTransitions[json.batch.status]?.[0] || "");
      setNote("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "受付詳細の取得に失敗しました"
      );
      setBatch(null);
      setRows([]);
      setEvents([]);
      setCanUpdate(false);
      setNextStatus("");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const allowedNextStatuses = batch
    ? workflowTransitions[batch.status] || []
    : [];

  async function handleStatusUpdate() {
    if (!batch || !canUpdate || !nextStatus) {
      return;
    }

    if (nextStatus === "returned" && !note.trim()) {
      setErrorMessage("差戻し理由を入力してください");
      return;
    }

    setUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/submission-batches/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus,
          note: note.trim(),
        }),
      });

      const json = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok || !json.success) {
        throw new Error(json.error || "状態の更新に失敗しました");
      }

      setSuccessMessage("状態を更新しました");
      await loadDetail();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "状態の更新に失敗しました"
      );
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
        <Link
          href="/headquarters/agency-submissions"
          className="inline-flex rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          提出一覧へ戻る
        </Link>

        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage || "受付情報が見つかりません"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Submission Center</p>
          <h1 className="mt-1 text-2xl font-bold">受付詳細</h1>
          <p className="mt-2 font-mono text-sm text-blue-700">
            {batch.batch_no}
          </p>
        </div>

        <Link
          href="/headquarters/agency-submissions"
          className="inline-flex rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          提出一覧へ戻る
        </Link>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">受付情報</h2>
          <p className="mt-1 text-sm text-gray-500">
            提出元、解析結果、取込件数を確認できます。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="受付番号">{batch.batch_no}</DetailItem>
          <DetailItem label="提出元">{batch.partner_name}</DetailItem>
          <DetailItem label="対象月">
            {formatTargetMonth(batch.target_month)}
          </DetailItem>
          <DetailItem label="受付日時">
            {formatDateTime(batch.submitted_at)}
          </DetailItem>
          <DetailItem label="parse_status">
            <StatusBadge value={batch.parse_status} />
          </DetailItem>
          <DetailItem label="duplicate_status">
            <StatusBadge value={batch.duplicate_status} />
          </DetailItem>
          <DetailItem label="total_count">{batch.total_count}</DetailItem>
          <DetailItem label="success_count">{batch.success_count}</DetailItem>
          <DetailItem label="error_count">{batch.error_count}</DetailItem>
          <DetailItem label="処理状況">
            <StatusBadge value={batch.status} />
          </DetailItem>
        </div>

        {batch.parse_error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="font-medium">解析エラー</div>
            <div className="mt-2 whitespace-pre-wrap break-words">
              {batch.parse_error}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">状態変更</h2>
          <p className="mt-1 text-sm text-gray-500">
            現在の状態から許可されている次の状態へ進めます。
          </p>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4">
          <div className="text-xs text-gray-500">現在状態</div>
          <div className="mt-2">
            <StatusBadge value={batch.status} />
          </div>
        </div>

        {canUpdate ? (
          allowedNextStatuses.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  変更後の状態
                </label>
                <select
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value)}
                  disabled={updating}
                  className="w-full rounded-lg border bg-white px-3 py-2"
                >
                  {allowedNextStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  備考
                  {nextStatus === "returned" ? (
                    <span className="ml-2 text-red-600">必須</span>
                  ) : null}
                </label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={updating}
                  className="min-h-[100px] w-full rounded-lg border px-3 py-2"
                  placeholder={
                    nextStatus === "returned"
                      ? "差戻し理由を入力してください"
                      : "必要に応じて備考を入力してください"
                  }
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => void handleStatusUpdate()}
                  disabled={
                    updating ||
                    !nextStatus ||
                    (nextStatus === "returned" && !note.trim())
                  }
                  className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {updating ? "更新中..." : "状態を更新"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-600">
              この受付は最終状態です。
            </div>
          )
        ) : (
          <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-600">
            状態変更は本部担当者のみ実行できます。
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">元Excel</h2>
          <p className="mt-1 text-sm text-gray-500">
            受付時に保存された元ファイルです。
          </p>
        </div>

        {batch.files.length === 0 ? (
          <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
            元ファイルは登録されていません。
          </div>
        ) : (
          <div className="space-y-3">
            {batch.files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {file.original_filename}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatFileSize(file.size_bytes)}・
                    {formatDateTime(file.uploaded_at)}
                  </div>
                </div>

                {file.download_url ? (
                  <a
                    href={file.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg border px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
                  >
                    元Excelを開く
                  </a>
                ) : (
                  <span className="text-sm text-gray-500">取得できません</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="p-5">
          <h2 className="text-lg font-bold">解析行</h2>
          <p className="mt-1 text-sm text-gray-500">
            submission_rows：{rows.length.toLocaleString("ja-JP")}件
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="border-t p-8 text-center text-sm text-gray-500">
            解析行はありません。
          </div>
        ) : (
          <div className="overflow-x-auto border-t">
            <table className="min-w-[1500px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">シート名</th>
                  <th className="whitespace-nowrap px-4 py-3">行番号</th>
                  <th className="whitespace-nowrap px-4 py-3">顧客名</th>
                  <th className="px-4 py-3">住所</th>
                  <th className="whitespace-nowrap px-4 py-3">保証開始日</th>
                  <th className="whitespace-nowrap px-4 py-3">プラン</th>
                  <th className="whitespace-nowrap px-4 py-3">メーカー</th>
                  <th className="whitespace-nowrap px-4 py-3">型番</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">保証料</th>
                  <th className="whitespace-nowrap px-4 py-3">validation_status</th>
                  <th className="whitespace-nowrap px-4 py-3">duplicate_status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.sheet_name || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.row_number}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {row.customer_name || "-"}
                    </td>
                    <td className="max-w-[360px] px-4 py-3">
                      {row.address_full || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.warranty_start_date || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.plan_code || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.manufacturer || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.model_number || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {formatYen(row.warranty_fee)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge value={row.validation_status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge value={row.duplicate_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">処理履歴</h2>
          <p className="mt-1 text-sm text-gray-500">submission_events</p>
        </div>

        {events.length === 0 ? (
          <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
            処理履歴はありません。
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {event.event_type}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {event.actor_label || "システム"}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDateTime(event.created_at)}
                  </div>
                </div>

                {event.previous_status || event.next_status ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge value={event.previous_status} />
                    <span className="text-gray-400">→</span>
                    <StatusBadge value={event.next_status} />
                  </div>
                ) : null}

                {event.note ? (
                  <div className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                    {event.note}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
