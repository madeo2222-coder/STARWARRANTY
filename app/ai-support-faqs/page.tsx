"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AiSupportFaq = {
  id: string;
  product_category: string;
  manufacturer: string | null;
  symptom_category: string | null;
  question: string;
  answer: string;
  troubleshooting_steps: string | null;
  video_title: string | null;
  video_url: string | null;
  danger_keywords: string | null;
  handoff_keywords: string | null;
  requires_staff: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

const productCategories = [
  "給湯器",
  "エコキュート",
  "エアコン",
  "コンロ",
  "換気扇",
  "インターホン",
  "温水洗浄便座",
  "システムバス",
  "システムキッチン",
  "食器洗い乾燥機",
  "浴室換気乾燥機",
  "床暖房",
  "電子錠",
  "照明",
  "その他",
];

const emptyForm = {
  id: "",
  product_category: "エコキュート",
  manufacturer: "",
  symptom_category: "",
  question: "",
  answer: "",
  troubleshooting_steps: "",
  video_title: "",
  video_url: "",
  danger_keywords: "水漏れ,焦げ臭い,煙,漏電,ガス臭い,ブレーカーが落ちる",
  handoff_keywords: "クレーム,補償,損害賠償,返金,対象外,有償,無料,責任",
  requires_staff: false,
  is_active: true,
  sort_order: 100,
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}

export default function AiSupportFaqsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [faqs, setFaqs] = useState<AiSupportFaq[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [form, setForm] = useState(emptyForm);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isEditing = Boolean(form.id);

  useEffect(() => {
    void loadFaqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory]);

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

  async function fetchWithAuth(url: string, init?: RequestInit) {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
  }

  async function loadFaqs() {
    setLoading(true);
    setErrorMessage("");

    try {
      const params = new URLSearchParams();

      if (filterCategory) {
        params.set("product_category", filterCategory);
      }

      const url = params.toString()
        ? `/api/ai-support-faqs?${params.toString()}`
        : "/api/ai-support-faqs";

      const res = await fetchWithAuth(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "FAQ一覧の取得に失敗しました");
      }

      setFaqs(json.faqs || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "FAQ一覧の取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function startEdit(faq: AiSupportFaq) {
    setForm({
      id: faq.id,
      product_category: faq.product_category || "その他",
      manufacturer: faq.manufacturer || "",
      symptom_category: faq.symptom_category || "",
      question: faq.question || "",
      answer: faq.answer || "",
      troubleshooting_steps: faq.troubleshooting_steps || "",
      video_title: faq.video_title || "",
      video_url: faq.video_url || "",
      danger_keywords: faq.danger_keywords || "",
      handoff_keywords: faq.handoff_keywords || "",
      requires_staff: Boolean(faq.requires_staff),
      is_active: faq.is_active !== false,
      sort_order: faq.sort_order || 100,
    });

    setErrorMessage("");
    setSuccessMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (!form.product_category.trim()) {
        throw new Error("製品カテゴリを入力してください");
      }

      if (!form.question.trim()) {
        throw new Error("質問を入力してください");
      }

      if (!form.answer.trim()) {
        throw new Error("回答を入力してください");
      }

      const payload = {
        id: form.id || undefined,
        product_category: form.product_category.trim(),
        manufacturer: form.manufacturer.trim() || null,
        symptom_category: form.symptom_category.trim() || null,
        question: form.question.trim(),
        answer: form.answer.trim(),
        troubleshooting_steps: form.troubleshooting_steps.trim() || null,
        video_title: form.video_title.trim() || null,
        video_url: form.video_url.trim() || null,
        danger_keywords: form.danger_keywords.trim() || null,
        handoff_keywords: form.handoff_keywords.trim() || null,
        requires_staff: form.requires_staff,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 100,
      };

      const res = await fetchWithAuth("/api/ai-support-faqs", {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json.error || (isEditing ? "FAQの更新に失敗しました" : "FAQの登録に失敗しました")
        );
      }

      setSuccessMessage(isEditing ? "FAQを更新しました" : "FAQを登録しました");
      setForm(emptyForm);
      await loadFaqs();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : isEditing
          ? "FAQの更新に失敗しました"
          : "FAQの登録に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(faq: AiSupportFaq) {
    const ok = window.confirm(
      `FAQ「${faq.question}」を削除します。よろしいですか？`
    );

    if (!ok) return;

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const res = await fetchWithAuth(
        `/api/ai-support-faqs?id=${encodeURIComponent(faq.id)}`,
        {
          method: "DELETE",
        }
      );

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "FAQの削除に失敗しました");
      }

      setSuccessMessage("FAQを削除しました");
      await loadFaqs();

      if (form.id === faq.id) {
        setForm(emptyForm);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "FAQの削除に失敗しました"
      );
    }
  }

  const activeCount = faqs.filter((faq) => faq.is_active).length;
  const videoCount = faqs.filter((faq) => faq.video_url).length;
  const staffCount = faqs.filter((faq) => faq.requires_staff).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">AI一次受付 FAQ管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            よくある質問・復旧手順・動画URLを登録します。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/support-chat"
            target="_blank"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            公開フォームを開く
          </Link>
          <Link
            href="/ai-support-inquiries"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            問い合わせ管理へ
          </Link>
          <button
            type="button"
            onClick={() => void loadFaqs()}
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

      {successMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">有効FAQ</div>
          <div className="mt-2 text-3xl font-bold">{activeCount}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">動画URLあり</div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {videoCount}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">スタッフ対応前提</div>
          <div className="mt-2 text-3xl font-bold text-orange-600">
            {staffCount}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {isEditing ? "FAQを編集" : "FAQを新規登録"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              平賀さん・福田さんから集めたよくある質問や復旧方法を登録します。
            </p>
          </div>

          {isEditing ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              新規登録に戻る
            </button>
          ) : null}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">製品カテゴリ</label>
            <select
              value={form.product_category}
              onChange={(e) =>
                setForm({ ...form, product_category: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2"
            >
              {productCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">メーカー</label>
            <input
              type="text"
              value={form.manufacturer}
              onChange={(e) =>
                setForm({ ...form, manufacturer: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2"
              placeholder="メーカー名。未指定でもOK"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">症状区分</label>
            <input
              type="text"
              value={form.symptom_category}
              onChange={(e) =>
                setForm({ ...form, symptom_category: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：お湯が出ない / 電源が入らない"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">表示順</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) =>
                setForm({ ...form, sort_order: Number(e.target.value) })
              }
              className="w-full rounded-lg border px-3 py-2"
              placeholder="100"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">質問</label>
            <input
              type="text"
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：エコキュートのお湯が出ません。どうしたらいいですか？"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">回答</label>
            <textarea
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              className="min-h-[120px] w-full rounded-lg border px-3 py-2"
              placeholder="お客様に案内する基本回答を入力"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">復旧手順</label>
            <textarea
              value={form.troubleshooting_steps}
              onChange={(e) =>
                setForm({ ...form, troubleshooting_steps: e.target.value })
              }
              className="min-h-[120px] w-full rounded-lg border px-3 py-2"
              placeholder={"例：\n1. リモコンにエラーコードがないか確認\n2. ブレーカーを確認\n3. 本体まわりの水漏れを確認"}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">動画タイトル</label>
            <input
              type="text"
              value={form.video_title}
              onChange={(e) =>
                setForm({ ...form, video_title: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：エラーコードの確認方法"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">動画URL</label>
            <input
              type="url"
              value={form.video_url}
              onChange={(e) => setForm({ ...form, video_url: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="https://youtube.com/..."
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">危険ワード</label>
            <input
              type="text"
              value={form.danger_keywords}
              onChange={(e) =>
                setForm({ ...form, danger_keywords: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2"
              placeholder="水漏れ,焦げ臭い,煙,漏電"
            />
            <p className="text-xs text-gray-500">
              カンマ区切りで入力。該当する場合はスタッフ対応に回す候補になります。
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">スタッフ引き継ぎワード</label>
            <input
              type="text"
              value={form.handoff_keywords}
              onChange={(e) =>
                setForm({ ...form, handoff_keywords: e.target.value })
              }
              className="w-full rounded-lg border px-3 py-2"
              placeholder="クレーム,補償,返金,対象外,責任"
            />
          </div>

          <div className="flex flex-wrap gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requires_staff}
                onChange={(e) =>
                  setForm({ ...form, requires_staff: e.target.checked })
                }
              />
              このFAQはスタッフ対応前提にする
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              有効にする
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving
              ? "保存中..."
              : isEditing
              ? "FAQを更新する"
              : "FAQを登録する"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            入力をクリア
          </button>
        </div>
      </form>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">FAQ一覧</h2>
            <p className="mt-1 text-sm text-gray-500">
              登録済みのFAQ・復旧手順・動画URLを確認できます。
            </p>
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">すべての製品カテゴリ</option>
            {productCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">読み込み中...</div>
        ) : faqs.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            FAQはまだ登録されていません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full border-collapse text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="border-b px-4 py-3">カテゴリ</th>
                  <th className="border-b px-4 py-3">症状</th>
                  <th className="border-b px-4 py-3">質問/回答</th>
                  <th className="border-b px-4 py-3">動画</th>
                  <th className="border-b px-4 py-3">状態</th>
                  <th className="border-b px-4 py-3">更新日</th>
                  <th className="border-b px-4 py-3">操作</th>
                </tr>
              </thead>

              <tbody>
                {faqs.map((faq) => (
                  <tr key={faq.id} className="align-top hover:bg-gray-50">
                    <td className="border-b px-4 py-3">
                      <div className="font-medium">{faq.product_category}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {faq.manufacturer || "メーカー未指定"}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        表示順：{faq.sort_order}
                      </div>
                    </td>

                    <td className="border-b px-4 py-3">
                      {faq.symptom_category || "-"}
                    </td>

                    <td className="border-b px-4 py-3">
                      <div className="max-w-[460px]">
                        <div className="font-medium">{faq.question}</div>
                        <div className="mt-2 whitespace-pre-wrap leading-6 text-gray-600">
                          {faq.answer}
                        </div>
                        {faq.troubleshooting_steps ? (
                          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs leading-6 text-gray-600">
                            <div className="mb-1 font-medium text-gray-700">
                              復旧手順
                            </div>
                            <div className="whitespace-pre-wrap">
                              {faq.troubleshooting_steps}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td className="border-b px-4 py-3">
                      {faq.video_url ? (
                        <a
                          href={faq.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline"
                        >
                          {faq.video_title || "動画を開く"}
                        </a>
                      ) : (
                        <span className="text-gray-400">なし</span>
                      )}
                    </td>

                    <td className="border-b px-4 py-3">
                      <div
                        className={`inline-flex rounded-full px-2 py-1 text-xs ${
                          faq.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {faq.is_active ? "有効" : "無効"}
                      </div>

                      {faq.requires_staff ? (
                        <div className="mt-2 inline-flex rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-700">
                          スタッフ対応
                        </div>
                      ) : null}
                    </td>

                    <td className="border-b px-4 py-3 text-gray-500">
                      {formatDateTime(faq.updated_at || faq.created_at)}
                    </td>

                    <td className="border-b px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(faq)}
                          className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(faq)}
                          className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                        >
                          削除
                        </button>
                      </div>
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