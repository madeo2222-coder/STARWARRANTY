"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type FaqGroup = "housing" | "appliance" | "solar";

type AiSupportInquiry = {
  id: string;
  inquiry_no: string;
  source_type: string | null;
  faq_group: FaqGroup | null;
  contact_type: string | null;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  certificate_no: string | null;
  product_category: string | null;
  manufacturer: string | null;
  model_no: string | null;
  symptom_category: string | null;
  symptom_detail: string;
  error_code: string | null;
  is_usable: boolean | null;
  urgency_level: string;
  requires_staff: boolean;
  staff_status: string;
  ai_status: string;
  ai_summary: string | null;
  guided_video_title: string | null;
  guided_video_url: string | null;
  converted_repair_request_id: string | null;
  converted_repair_request_no: string | null;
  memo: string | null;
  created_at: string;
};

type AiSupportMessage = {
  id: string;
  inquiry_id: string;
  sender_type: string;
  message: string;
  created_at: string;
};

type DetailApiResponse = {
  success?: boolean;
  error?: string;
  inquiry?: AiSupportInquiry;
  messages?: AiSupportMessage[];
};

type ConvertApiResponse = {
  success?: boolean;
  error?: string;
  already_converted?: boolean;
  inquiry?: AiSupportInquiry;
  repair_request?: {
    id: string;
    request_no: string;
  };
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}

function getFaqGroupLabel(value: FaqGroup | null) {
  switch (value) {
    case "appliance":
      return "家電";
    case "solar":
      return "太陽光・蓄電池";
    case "housing":
    default:
      return "住宅設備";
  }
}

function getContactTypeLabel(value: string | null) {
  switch (value) {
    case "customer":
      return "お客様";
    case "builder":
      return "工務店";
    case "seller":
      return "販売店";
    case "agency":
      return "代理店";
    case "other":
      return "その他";
    default:
      return "-";
  }
}

function getUrgencyLabel(value: string) {
  switch (value) {
    case "high":
      return "緊急";
    case "attention":
      return "要注意";
    case "normal":
      return "通常";
    default:
      return value || "-";
  }
}

function getStatusLabel(value: string) {
  switch (value) {
    case "new":
      return "新規";
    case "needs_staff":
      return "スタッフ対応";
    case "in_progress":
      return "対応中";
    case "closed":
      return "完了";
    default:
      return value || "-";
  }
}

function getUsableLabel(value: boolean | null) {
  if (value === true) return "使用可能";
  if (value === false) return "使用不可";
  return "未確認";
}

function getSenderLabel(value: string) {
  switch (value) {
    case "user":
      return "問い合わせ者";
    case "assistant":
      return "AI一次回答";
    case "staff":
      return "スタッフ";
    default:
      return value || "-";
  }
}

export default function AiSupportInquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const inquiryId = Array.isArray(params.id) ? params.id[0] : params.id;

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  const [inquiry, setInquiry] = useState<AiSupportInquiry | null>(null);
  const [messages, setMessages] = useState<AiSupportMessage[]>([]);

  const [staffStatus, setStaffStatus] = useState("new");
  const [memo, setMemo] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!inquiryId) return;

    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryId]);

  async function getAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("ログイン情報が取得できませんでした");
    }

    return session.access_token;
  }

  async function loadDetail() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = await getAccessToken();

      const response = await fetch(
        `/api/ai-support-inquiries?id=${encodeURIComponent(inquiryId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as DetailApiResponse;

      if (!response.ok || !result.success || !result.inquiry) {
        throw new Error(result.error || "問い合わせ詳細の取得に失敗しました");
      }

      setInquiry(result.inquiry);
      setMessages(result.messages || []);
      setStaffStatus(result.inquiry.staff_status || "new");
      setMemo(result.inquiry.memo || "");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "問い合わせ詳細の取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!inquiry) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = await getAccessToken();

      const response = await fetch("/api/ai-support-inquiries", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: inquiry.id,
          staff_status: staffStatus,
          memo,
        }),
      });

      const result = (await response.json()) as DetailApiResponse;

      if (!response.ok || !result.success || !result.inquiry) {
        throw new Error(result.error || "問い合わせの更新に失敗しました");
      }

      setInquiry(result.inquiry);
      setStaffStatus(result.inquiry.staff_status || "new");
      setMemo(result.inquiry.memo || "");
      setSuccessMessage("対応状況とメモを更新しました");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "問い合わせの更新に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertToRepairRequest() {
    if (!inquiry) return;

    if (inquiry.converted_repair_request_id) {
      router.push(
        `/repair-requests/detail?request_no=${encodeURIComponent(
          inquiry.converted_repair_request_no || ""
        )}`
      );
      return;
    }

    const missingFields: string[] = [];

    if (!inquiry.customer_name?.trim()) {
      missingFields.push("お名前・会社名");
    }

    if (!inquiry.phone?.trim()) {
      missingFields.push("電話番号");
    }

    if (!inquiry.product_category?.trim()) {
      missingFields.push("対象機器");
    }

    if (!inquiry.symptom_detail?.trim()) {
      missingFields.push("症状・問い合わせ内容");
    }

    if (missingFields.length > 0) {
      setErrorMessage(
        `修理受付へ変換するには、${missingFields.join(
          "、"
        )}が必要です。AI問い合わせ内容を確認してください。`
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const confirmed = window.confirm(
      [
        "このAI問い合わせを修理受付へ変換します。",
        "",
        `お名前・会社名：${inquiry.customer_name}`,
        `電話番号：${inquiry.phone}`,
        `対象機器：${inquiry.product_category}`,
        "",
        "変換後は修理受付詳細画面へ移動します。",
        "よろしいですか？",
      ].join("\n")
    );

    if (!confirmed) return;

    setConverting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = await getAccessToken();

      const response = await fetch("/api/ai-support-convert-repair", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inquiry_id: inquiry.id,
        }),
      });

      const result = (await response.json()) as ConvertApiResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.repair_request?.request_no
      ) {
        throw new Error(result.error || "修理受付への変換に失敗しました");
      }

      if (result.inquiry) {
        setInquiry(result.inquiry);
        setStaffStatus(result.inquiry.staff_status || "in_progress");
      }

      setSuccessMessage(
        result.already_converted
          ? "すでに修理受付へ変換されています"
          : `修理受付 ${result.repair_request.request_no} を作成しました`
      );

      router.push(
        `/repair-requests/detail?request_no=${encodeURIComponent(
          result.repair_request.request_no
        )}`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "修理受付への変換に失敗しました"
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setConverting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {errorMessage || "問い合わせが見つかりませんでした。"}
        </div>

        <Link
          href="/ai-support-inquiries"
          className="inline-block rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">AI一次受付詳細</h1>
          <p className="mt-1 text-sm text-gray-500">
            受付内容・AI回答・スタッフ対応状況を確認します。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/ai-support-inquiries"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            一覧へ戻る
          </Link>

          <button
            type="button"
            onClick={() => void loadDetail()}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            再読み込み
          </button>
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

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">受付番号</div>
          <div className="mt-2 break-all font-semibold">
            {inquiry.inquiry_no}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">受付日時</div>
          <div className="mt-2 font-semibold">
            {formatDateTime(inquiry.created_at)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">機器区分</div>
          <div className="mt-2 font-semibold">
            {getFaqGroupLabel(inquiry.faq_group)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">緊急度</div>
          <div
            className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
              inquiry.urgency_level === "high"
                ? "bg-red-100 text-red-700"
                : inquiry.urgency_level === "attention"
                ? "bg-orange-100 text-orange-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {getUrgencyLabel(inquiry.urgency_level)}
          </div>
        </div>
      </div>

      {inquiry.converted_repair_request_id ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-green-800">
                修理受付へ変換済み
              </h2>
              <p className="mt-2 text-sm text-green-700">
                修理受付番号：
                <span className="ml-1 font-semibold">
                  {inquiry.converted_repair_request_no || "-"}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleConvertToRepairRequest()}
              className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm text-green-800 hover:bg-green-100"
            >
              修理受付詳細を開く
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-blue-900">
                修理受付への変換
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-800">
                このAI問い合わせの内容を引き継いで、修理受付を作成します。
                AI要約とスタッフメモも修理受付へ引き継がれます。
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleConvertToRepairRequest()}
              disabled={converting}
              className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {converting ? "変換中..." : "修理受付へ変換"}
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">問い合わせ者情報</h2>

          <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-gray-500">問い合わせ元</dt>
              <dd className="mt-1 font-medium">
                {getContactTypeLabel(inquiry.contact_type)}
              </dd>
            </div>

            <div>
              <dt className="text-gray-500">お名前・会社名</dt>
              <dd className="mt-1 font-medium">
                {inquiry.customer_name || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-gray-500">電話番号</dt>
              <dd className="mt-1 font-medium">{inquiry.phone || "-"}</dd>
            </div>

            <div>
              <dt className="text-gray-500">メールアドレス</dt>
              <dd className="mt-1 break-all font-medium">
                {inquiry.email || "-"}
              </dd>
            </div>

            <div className="md:col-span-2">
              <dt className="text-gray-500">保証書番号</dt>
              <dd className="mt-1 font-medium">
                {inquiry.certificate_no || "-"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">製品情報</h2>

          <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-gray-500">製品カテゴリ</dt>
              <dd className="mt-1 font-medium">
                {inquiry.product_category || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-gray-500">メーカー</dt>
              <dd className="mt-1 font-medium">
                {inquiry.manufacturer || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-gray-500">型番</dt>
              <dd className="mt-1 font-medium">
                {inquiry.model_no || "-"}
              </dd>
            </div>

            <div>
              <dt className="text-gray-500">現在使用できるか</dt>
              <dd className="mt-1 font-medium">
                {getUsableLabel(inquiry.is_usable)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">症状・問い合わせ内容</h2>

        <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-gray-500">症状区分</div>
            <div className="mt-1 font-medium">
              {inquiry.symptom_category || "-"}
            </div>
          </div>

          <div>
            <div className="text-gray-500">エラーコード</div>
            <div className="mt-1 font-medium">
              {inquiry.error_code || "-"}
            </div>
          </div>
        </div>

        <div className="mt-5 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-800">
          {inquiry.symptom_detail}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">AI判定</h2>
            <p className="mt-1 text-sm text-gray-500">
              AI一次受付による要約とスタッフ対応判定です。
            </p>
          </div>

          <div
            className={`inline-flex rounded-full px-3 py-2 text-sm font-medium ${
              inquiry.requires_staff
                ? "bg-orange-100 text-orange-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {inquiry.requires_staff
              ? "スタッフ確認が必要"
              : "AI一次対応"}
          </div>
        </div>

        <div className="mt-5 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-800">
          {inquiry.ai_summary || "AI要約はありません。"}
        </div>

        {inquiry.guided_video_url ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-sm font-medium text-blue-800">
              案内済み動画
            </div>

            <a
              href={inquiry.guided_video_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block break-all text-sm text-blue-700 underline"
            >
              {inquiry.guided_video_title || inquiry.guided_video_url}
            </a>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">会話履歴</h2>

        {messages.length === 0 ? (
          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
            会話履歴はありません。
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl border p-4 ${
                  message.sender_type === "assistant"
                    ? "border-blue-200 bg-blue-50"
                    : message.sender_type === "staff"
                    ? "border-orange-200 bg-orange-50"
                    : "bg-white"
                }`}
              >
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm font-semibold">
                    {getSenderLabel(message.sender_type)}
                  </div>

                  <div className="text-xs text-gray-500">
                    {formatDateTime(message.created_at)}
                  </div>
                </div>

                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-800">
                  {message.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">スタッフ対応管理</h2>

        <div className="mt-5 grid gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">対応ステータス</label>

            <select
              value={staffStatus}
              onChange={(e) => setStaffStatus(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 md:max-w-sm"
            >
              <option value="new">{getStatusLabel("new")}</option>
              <option value="needs_staff">
                {getStatusLabel("needs_staff")}
              </option>
              <option value="in_progress">
                {getStatusLabel("in_progress")}
              </option>
              <option value="closed">{getStatusLabel("closed")}</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">スタッフメモ</label>

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="min-h-[160px] w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="電話対応内容、確認事項、引き継ぎ内容などを入力してください。"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-black px-5 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "保存中..." : "対応状況を保存"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}