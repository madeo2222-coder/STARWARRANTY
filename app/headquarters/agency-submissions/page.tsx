"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SubmissionStatus =
  | "submitted"
  | "reviewing"
  | "returned"
  | "approved"
  | "processing"
  | "warranty_created"
  | "printed"
  | "mailed"
  | "completed";

type PartnerRow = {
  id: string;
  partner_code: string | null;
  partner_type: string;
  company_name: string;
  representative_name: string | null;
  contact_name: string | null;
  status: string;
};

type SubmissionFileRow = {
  id: string;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_at: string;
};

type SubmissionBatchRow = {
  id: string;
  batch_no: string;
  partner_id: string;
  partner_name: string;
  partner_type: string | null;
  target_month: string;
  source_type: string;
  status: SubmissionStatus;
  total_count: number;
  success_count: number;
  error_count: number;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  revision_no: number;
  files: SubmissionFileRow[];
};

const statusLabels: Record<SubmissionStatus, string> = {
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

const statusClasses: Record<SubmissionStatus, string> = {
  submitted: "bg-blue-100 text-blue-700",
  reviewing: "bg-yellow-100 text-yellow-700",
  returned: "bg-red-100 text-red-700",
  approved: "bg-green-100 text-green-700",
  processing: "bg-purple-100 text-purple-700",
  warranty_created: "bg-indigo-100 text-indigo-700",
  printed: "bg-orange-100 text-orange-700",
  mailed: "bg-cyan-100 text-cyan-700",
  completed: "bg-gray-100 text-gray-700",
};

const partnerTypeLabels: Record<string, string> = {
  agency: "代理店",
  sub_agency: "二次代理店",
  builder: "施工店・工務店",
  dealer: "販売店",
  shop: "店舗",
  manufacturer: "メーカー",
  other: "その他",
};

function getCurrentMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function formatTargetMonth(value: string) {
  if (!value) return "-";

  const normalized = value.slice(0, 7);
  const [year, month] = normalized.split("-");

  if (!year || !month) return value;

  return `${year}年${Number(month)}月`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.ceil(sizeBytes / 1024).toLocaleString("ja-JP")} KB`;
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function countByStatus(
  batches: SubmissionBatchRow[],
  statuses: SubmissionStatus[]
) {
  return batches.filter((batch) => statuses.includes(batch.status)).length;
}

export default function HeadquartersAgencySubmissionsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [batches, setBatches] = useState<SubmissionBatchRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [partnerId, setPartnerId] = useState("");
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth());
  const [note, setNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("ログイン情報が取得できませんでした");
    }

    return session.access_token;
  }, [supabase]);

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers || {});

      headers.set("Authorization", `Bearer ${token}`);

      return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [getAccessToken]
  );

  const loadPartners = useCallback(async () => {
    const response = await fetchWithAuth("/api/submission-partners");

    const json = (await response.json()) as {
      success: boolean;
      error?: string;
      partners?: PartnerRow[];
    };

    if (!response.ok || !json.success) {
      throw new Error(json.error || "提出元一覧の取得に失敗しました");
    }

    const nextPartners = json.partners || [];

    setPartners(nextPartners);

    if (!partnerId && nextPartners.length === 1) {
      setPartnerId(nextPartners[0].id);
    }
  }, [fetchWithAuth, partnerId]);

  const loadBatches = useCallback(async () => {
    const params = new URLSearchParams();

    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }

    if (monthFilter) {
      params.set("target_month", monthFilter);
    }

    const queryString = params.toString();
    const url = queryString
      ? `/api/submission-batches?${queryString}`
      : "/api/submission-batches";

    const response = await fetchWithAuth(url);

    const json = (await response.json()) as {
      success: boolean;
      error?: string;
      batches?: SubmissionBatchRow[];
    };

    if (!response.ok || !json.success) {
      throw new Error(json.error || "提出履歴の取得に失敗しました");
    }

    setBatches(json.batches || []);
  }, [fetchWithAuth, monthFilter, statusFilter]);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      await Promise.all([loadPartners(), loadBatches()]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "画面の読み込みに失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }, [loadBatches, loadPartners]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (!partnerId) {
        throw new Error("提出元の代理店・施工店を選択してください");
      }

      if (!targetMonth) {
        throw new Error("対象月を選択してください");
      }

      if (!selectedFile) {
        throw new Error("提出するExcelまたはCSVを選択してください");
      }

      const formData = new FormData();

      formData.append("partner_id", partnerId);
      formData.append("target_month", targetMonth);
      formData.append("source_type", "headquarters_proxy");
      formData.append("file", selectedFile);

      if (note.trim()) {
        formData.append("note", note.trim());
      }

      const response = await fetchWithAuth("/api/submission-batches", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as {
        success: boolean;
        error?: string;
        message?: string;
        batch?: {
          id: string;
          batch_no: string;
        };
      };

      if (!response.ok || !json.success) {
        throw new Error(json.error || "加入データの提出に失敗しました");
      }

      setSuccessMessage(
        json.batch?.batch_no
          ? `加入データを受け付けました。受付番号：${json.batch.batch_no}`
          : json.message || "加入データを受け付けました"
      );

      setNote("");
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);

      await loadBatches();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "加入データの提出に失敗しました"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const submittedCount = countByStatus(batches, ["submitted"]);
  const reviewingCount = countByStatus(batches, ["reviewing"]);
  const returnedCount = countByStatus(batches, ["returned"]);
  const processingCount = countByStatus(batches, [
    "approved",
    "processing",
    "warranty_created",
    "printed",
    "mailed",
  ]);
  const completedCount = countByStatus(batches, ["completed"]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">
            STAR WARRANTY Headquarters
          </p>

          <h1 className="text-2xl font-bold">代理店提出センター</h1>

          <p className="mt-1 text-sm text-gray-500">
            メールで受領した加入データを代理登録し、受付状況を管理します。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/headquarters"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            本部管理へ戻る
          </Link>

          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            ホームへ
          </Link>
        </div>
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

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-bold">加入データ代理登録</h2>
          <p className="mt-1 text-sm text-gray-500">
            現在メールで届いているExcelを、最初は本部スタッフが登録します。
          </p>
        </div>

        {partners.length === 0 ? (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
            登録可能な代理店・施工店がありません。先にpartnersへ取引先を登録してください。
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              提出元
            </label>

            <select
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2"
              disabled={submitting || partners.length === 0}
            >
              <option value="">選択してください</option>

              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.company_name}
                  {partnerTypeLabels[partner.partner_type]
                    ? `（${partnerTypeLabels[partner.partner_type]}）`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              対象月
            </label>

            <input
              type="month"
              value={targetMonth}
              onChange={(event) => setTargetMonth(event.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">
              加入データファイル
            </label>

            <input
              key={fileInputKey}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] || null)
              }
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
              disabled={submitting}
            />

            <p className="text-xs text-gray-500">
              Excel（.xlsx / .xls）またはCSV、10MB以下
            </p>

            {selectedFile ? (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                選択中：{selectedFile.name}（
                {formatFileSize(selectedFile.size)}）
              </div>
            ) : null}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">
              備考
            </label>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[90px] w-full rounded-lg border px-3 py-2"
              placeholder="メール本文や確認事項などがあれば入力してください"
              maxLength={2000}
              disabled={submitting}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={
            submitting ||
            partners.length === 0 ||
            !partnerId ||
            !targetMonth ||
            !selectedFile
          }
          className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "提出中..." : "加入データを登録する"}
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">受付済</div>
          <div className="mt-2 text-3xl font-bold text-blue-700">
            {submittedCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">確認中</div>
          <div className="mt-2 text-3xl font-bold text-yellow-700">
            {reviewingCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">差戻し</div>
          <div className="mt-2 text-3xl font-bold text-red-700">
            {returnedCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">処理中</div>
          <div className="mt-2 text-3xl font-bold text-purple-700">
            {processingCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">処理完了</div>
          <div className="mt-2 text-3xl font-bold text-green-700">
            {completedCount}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">提出履歴</h2>

              <p className="mt-1 text-sm text-gray-500">
                受付番号・提出元・対象月・ファイル・処理状況を確認します。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border bg-white px-3 py-2 text-sm"
              >
                <option value="all">全ステータス</option>
                <option value="submitted">受付済</option>
                <option value="reviewing">確認中</option>
                <option value="returned">差戻し</option>
                <option value="approved">受付完了</option>
                <option value="processing">処理中</option>
                <option value="warranty_created">保証書作成済</option>
                <option value="printed">印刷済</option>
                <option value="mailed">郵送済</option>
                <option value="completed">処理完了</option>
              </select>

              <input
                type="month"
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
              />

              <button
                type="button"
                onClick={() => void loadBatches()}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                再読込
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setMonthFilter("");
                }}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                絞り込み解除
              </button>
            </div>
          </div>
        </div>

        {batches.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-lg font-bold text-gray-700">
              まだ提出データはありません
            </div>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              上の登録フォームから、メールで受け取った加入データを登録してください。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">受付番号</th>
                  <th className="whitespace-nowrap px-4 py-3">提出元</th>
                  <th className="whitespace-nowrap px-4 py-3">対象月</th>
                  <th className="whitespace-nowrap px-4 py-3">ファイル</th>
                  <th className="whitespace-nowrap px-4 py-3">提出日時</th>
                  <th className="whitespace-nowrap px-4 py-3">状態</th>
                  <th className="whitespace-nowrap px-4 py-3">備考</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {batches.map((batch) => {
                  const firstFile = batch.files?.[0];

                  return (
                    <tr key={batch.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {batch.batch_no}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {batch.partner_name}
                        </div>

                        {batch.partner_type ? (
                          <div className="mt-1 text-xs text-gray-500">
                            {partnerTypeLabels[batch.partner_type] ||
                              batch.partner_type}
                          </div>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatTargetMonth(batch.target_month)}
                      </td>

                      <td className="max-w-[260px] px-4 py-3">
                        {firstFile ? (
                          <>
                            <div className="truncate font-medium text-gray-800">
                              {firstFile.original_filename}
                            </div>

                            <div className="mt-1 text-xs text-gray-500">
                              {formatFileSize(firstFile.size_bytes)}
                            </div>
                          </>
                        ) : (
                          <span className="text-red-600">ファイル未登録</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatDateTime(batch.submitted_at)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            statusClasses[batch.status] ||
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {statusLabels[batch.status] || batch.status}
                        </span>
                      </td>

                      <td className="max-w-[260px] px-4 py-3 text-gray-600">
                        {batch.review_note || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
        保証書はスター・ワランティ本部で印刷し、お客様住所へ郵送します。
        代理店・施工店には、今後「保証書作成済」「印刷済」「郵送済」などの
        進捗だけを表示します。
      </div>
    </div>
  );
}