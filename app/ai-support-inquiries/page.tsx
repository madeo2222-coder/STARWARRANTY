"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export default function AiSupportInquiriesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [inquiries, setInquiries] = useState<AiSupportInquiry[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [faqGroupFilter, setFaqGroupFilter] = useState("");

  useEffect(() => {
    void loadInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, faqGroupFilter]);

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

  async function loadInquiries() {
    setLoading(true);
    setErrorMessage("");

    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();

      if (filter === "needs_staff") {
        params.set("requires_staff", "true");
      }

      if (filter === "new") {
        params.set("status", "new");
      }

      if (faqGroupFilter) {
        params.set("faq_group", faqGroupFilter);
      }

      const url = params.toString()
        ? `/api/ai-support-inquiries?${params.toString()}`
        : "/api/ai-support-inquiries";

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "AI問い合わせ一覧の取得に失敗しました");
      }

      setInquiries(json.inquiries || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "AI問い合わせ一覧の取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  const totalCount = inquiries.length;
  const staffCount = inquiries.filter((item) => item.requires_staff).length;
  const highCount = inquiries.filter(
    (item) => item.urgency_level === "high"
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">AI一次受付管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            Webチャットから入った故障相談・問い合わせを確認します。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/support-chat"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            target="_blank"
          >
            公開フォームを開く
          </Link>

          <button
            type="button"
            onClick={() => void loadInquiries()}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">表示中の問い合わせ</div>
          <div className="mt-2 text-3xl font-bold">{totalCount}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">スタッフ対応が必要</div>
          <div className="mt-2 text-3xl font-bold text-orange-600">
            {staffCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">緊急判定</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {highCount}
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-4 py-2 text-sm ${
              filter === "all"
                ? "bg-black text-white"
                : "border bg-white hover:bg-gray-50"
            }`}
          >
            すべて
          </button>

          <button
            type="button"
            onClick={() => setFilter("needs_staff")}
            className={`rounded-lg px-4 py-2 text-sm ${
              filter === "needs_staff"
                ? "bg-black text-white"
                : "border bg-white hover:bg-gray-50"
            }`}
          >
            スタッフ対応のみ
          </button>

          <button
            type="button"
            onClick={() => setFilter("new")}
            className={`rounded-lg px-4 py-2 text-sm ${
              filter === "new"
                ? "bg-black text-white"
                : "border bg-white hover:bg-gray-50"
            }`}
          >
            新規のみ
          </button>
        </div>

        <div className="flex flex-col gap-2 md:max-w-sm">
          <label className="text-sm font-medium">機器区分</label>

          <select
            value={faqGroupFilter}
            onChange={(e) => setFaqGroupFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">すべての機器区分</option>
            <option value="housing">住宅設備</option>
            <option value="appliance">家電</option>
            <option value="solar">太陽光・蓄電池</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">読み込み中...</div>
        ) : inquiries.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            AI一次受付の問い合わせはまだありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1300px] w-full border-collapse text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="border-b px-4 py-3">受付日時</th>
                  <th className="border-b px-4 py-3">受付番号</th>
                  <th className="border-b px-4 py-3">機器区分</th>
                  <th className="border-b px-4 py-3">問い合わせ元</th>
                  <th className="border-b px-4 py-3">名前/会社名</th>
                  <th className="border-b px-4 py-3">製品</th>
                  <th className="border-b px-4 py-3">症状</th>
                  <th className="border-b px-4 py-3">緊急度</th>
                  <th className="border-b px-4 py-3">状態</th>
                  <th className="border-b px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {inquiries.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-gray-50">
                    <td className="border-b px-4 py-3 text-gray-600">
                      {formatDateTime(item.created_at)}
                    </td>

                    <td className="border-b px-4 py-3 font-medium">
                      <Link
                        href={`/ai-support-inquiries/${item.id}`}
                        className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
                      >
                        {item.inquiry_no}
                      </Link>
                    </td>

                    <td className="border-b px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs ${
                          item.faq_group === "appliance"
                            ? "bg-blue-100 text-blue-700"
                            : item.faq_group === "solar"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {getFaqGroupLabel(item.faq_group)}
                      </span>
                    </td>

                    <td className="border-b px-4 py-3">
                      {getContactTypeLabel(item.contact_type)}
                    </td>

                    <td className="border-b px-4 py-3">
                      <div className="font-medium">
                        {item.customer_name || "-"}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {item.phone || item.email || ""}
                      </div>
                    </td>

                    <td className="border-b px-4 py-3">
                      <div>{item.product_category || "-"}</div>

                      <div className="mt-1 text-xs text-gray-500">
                        {item.manufacturer || ""}
                        {item.model_no ? ` / ${item.model_no}` : ""}
                      </div>
                    </td>

                    <td className="border-b px-4 py-3">
                      <div className="max-w-[360px] whitespace-pre-wrap leading-6">
                        {item.symptom_detail}
                      </div>

                      {item.error_code ? (
                        <div className="mt-1 text-xs text-gray-500">
                          エラーコード：{item.error_code}
                        </div>
                      ) : null}

                      {item.guided_video_url ? (
                        <a
                          href={item.guided_video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs text-blue-600 underline"
                        >
                          案内動画を開く
                        </a>
                      ) : null}
                    </td>

                    <td className="border-b px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          item.urgency_level === "high"
                            ? "bg-red-100 text-red-700"
                            : item.urgency_level === "attention"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {getUrgencyLabel(item.urgency_level)}
                      </span>
                    </td>

                    <td className="border-b px-4 py-3">
                      <div
                        className={`inline-flex rounded-full px-2 py-1 text-xs ${
                          item.requires_staff
                            ? "bg-orange-100 text-orange-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {item.requires_staff
                          ? "スタッフ確認"
                          : "AI一次対応"}
                      </div>

                      <div className="mt-2 text-xs text-gray-500">
                        {getStatusLabel(item.staff_status)}
                      </div>
                    </td>

                    <td className="border-b px-4 py-3">
                      <Link
                        href={`/ai-support-inquiries/${item.id}`}
                        className="inline-block rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}