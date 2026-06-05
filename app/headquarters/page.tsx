"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type HeadquartersSettings = {
  id: string;
  company_name: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  logo_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const MAX_LOGO_SIZE_MB = 5;

const HEADQUARTERS_ADMIN_EMAILS = [
  "madeo8888@gmail.com",
  "y.shimizu@st-w.jp",
  "s.hidaka@st-w.jp",
  "n.fukuda@st-w.jp",
  "t.hiraga@st-w.jp",
];

const managementCards = [
  {
    title: "保証書管理",
    description: "保証書の一覧確認・新規作成・PDF発行へ進みます",
    href: "/warranty-certificates",
  },
  {
    title: "修理受付管理",
    description: "お客様からの修理依頼を確認・対応管理します",
    href: "/repair-requests",
  },
  {
    title: "請求書管理",
    description: "請求書一覧・新規作成・PDF発行へ進みます",
    href: "/warranty-invoices",
  },
];

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isHeadquartersAdminEmail(email: string | null | undefined) {
  const normalizedEmail = normalizeEmail(email);
  return HEADQUARTERS_ADMIN_EMAILS.includes(normalizedEmail);
}

export default function HeadquartersPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [settingsId, setSettingsId] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [selectedLogoName, setSelectedLogoName] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canManageHeadquarters = isHeadquartersAdminEmail(loginEmail);

  useEffect(() => {
    void loadPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sanitizePostalCode(value: string) {
    return value.replace(/[^\d-]/g, "").slice(0, 8);
  }

  function applySettingsToState(settings: HeadquartersSettings) {
    setSettingsId(settings.id);
    setCompanyName(settings.company_name || "");
    setRepresentativeName(settings.representative_name || "");
    setEmail(settings.email || "");
    setPhone(settings.phone || "");
    setPostalCode(settings.postal_code || "");
    setAddress(settings.address || "");
    setNote(settings.note || "");
    setLogoUrl(settings.logo_url || "");
    setSelectedLogoName("");
  }

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

  async function loadPageData() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(userError.message);
      }

      if (!user) {
        throw new Error("ログイン情報が取得できませんでした");
      }

      const currentLoginEmail = normalizeEmail(user.email);
      setLoginEmail(currentLoginEmail);

      if (!isHeadquartersAdminEmail(currentLoginEmail)) {
        throw new Error("本部最高権限アカウントのみ利用できます");
      }

      const res = await fetchWithAuth("/api/headquarters-settings");

      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        settings?: HeadquartersSettings;
      };

      if (!res.ok || !json.success || !json.settings) {
        throw new Error(json.error || "本部設定の取得に失敗しました");
      }

      applySettingsToState(json.settings);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "データ取得に失敗しました";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogoUpload(file: File) {
    try {
      setUploadingLogo(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (!canManageHeadquarters) {
        throw new Error("本部最高権限アカウントのみ更新できます");
      }

      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("PNG / JPG / WEBP の画像を選択してください");
      }

      const maxBytes = MAX_LOGO_SIZE_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error(`画像サイズは ${MAX_LOGO_SIZE_MB}MB 以下にしてください`);
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetchWithAuth("/api/headquarters-logo", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        logo_url?: string | null;
        settings?: HeadquartersSettings;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error || "本部ロゴ更新に失敗しました");
      }

      if (json.settings) {
        applySettingsToState(json.settings);
      } else {
        setLogoUrl(json.logo_url || "");
      }

      setSelectedLogoName(file.name);
      setSuccessMessage("本部ロゴを更新しました");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ロゴ更新に失敗しました";
      setErrorMessage(message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    try {
      setUploadingLogo(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (!canManageHeadquarters) {
        throw new Error("本部最高権限アカウントのみ更新できます");
      }

      const res = await fetchWithAuth("/api/headquarters-logo", {
        method: "DELETE",
      });

      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        settings?: HeadquartersSettings;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error || "本部ロゴ削除に失敗しました");
      }

      if (json.settings) {
        applySettingsToState(json.settings);
      } else {
        setLogoUrl("");
        setSelectedLogoName("");
      }

      setSuccessMessage("本部ロゴを外しました");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ロゴ削除に失敗しました";
      setErrorMessage(message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (!canManageHeadquarters) {
        throw new Error("本部最高権限アカウントのみ更新できます");
      }

      if (!companyName.trim()) {
        throw new Error("会社名を入力してください");
      }

      const res = await fetchWithAuth("/api/headquarters-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          representative_name: representativeName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          postal_code: sanitizePostalCode(postalCode.trim()) || null,
          address: address.trim() || null,
          note: note.trim() || null,
          logo_url: logoUrl.trim() || null,
        }),
      });

      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        settings?: HeadquartersSettings;
      };

      if (!res.ok || !json.success || !json.settings) {
        throw new Error(json.error || "本部情報の更新に失敗しました");
      }

      applySettingsToState(json.settings);
      setSuccessMessage("本部情報を更新しました");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "更新に失敗しました";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border bg-white p-6">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY Headquarters</p>
          <h1 className="text-2xl font-bold">本部管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            保証管理の各機能と本部情報を管理できます
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            ダッシュボードへ
          </Link>
          <Link
            href="/agencies"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            紹介者 / 代理店一覧へ
          </Link>
        </div>
      </div>

      {canManageHeadquarters ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          本部最高権限アカウントとしてログイン中です。
        </div>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          本部最高権限アカウントのみ更新できます。
        </div>
      )}

      {settingsId ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          本部設定IDを取得済みです。
        </div>
      ) : null}

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
        {managementCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h2 className="text-lg font-bold">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {card.description}
            </p>
            <div className="mt-4 text-sm font-medium text-blue-600">
              開く →
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold">本部ロゴ</h2>
          <p className="mt-1 text-sm text-gray-500">
            PNG / JPG / WEBP、{MAX_LOGO_SIZE_MB}MB以下
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="flex items-center justify-center rounded-2xl border bg-gray-50 p-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="本部ロゴ"
                className="max-h-40 max-w-full rounded-lg object-contain"
              />
            ) : (
              <div className="text-center text-sm text-gray-400">
                ロゴ未設定
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="inline-flex cursor-pointer rounded-lg bg-black px-4 py-2 text-sm text-white">
              {uploadingLogo ? "アップロード中..." : "ロゴ画像を選択"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadingLogo || !canManageHeadquarters}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void handleLogoUpload(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <div className="text-sm text-gray-500">
              {selectedLogoName
                ? `選択画像: ${selectedLogoName}`
                : logoUrl
                ? "現在の本部ロゴを表示中"
                : "まだロゴ画像は登録されていません"}
            </div>

            {logoUrl ? (
              <button
                type="button"
                onClick={() => void handleRemoveLogo()}
                disabled={uploadingLogo || !canManageHeadquarters}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                ロゴ画像を外す
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold">本部情報</h2>
          <p className="mt-1 text-sm text-gray-500">
            請求書・保証書などに使用する本部情報を設定します
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">会社名</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="株式会社スター・ワランティ"
              disabled={!canManageHeadquarters}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">担当者名</label>
            <input
              type="text"
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="担当者名を入力"
              disabled={!canManageHeadquarters}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="example@example.com"
              disabled={!canManageHeadquarters}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">電話番号</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="0120-992-857"
              disabled={!canManageHeadquarters}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">郵便番号</label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(sanitizePostalCode(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="101-0048"
              disabled={!canManageHeadquarters}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">住所</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="住所を入力"
              disabled={!canManageHeadquarters}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">備考</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[100px] w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="備考を入力"
              disabled={!canManageHeadquarters}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || !canManageHeadquarters}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "更新中..." : "更新する"}
          </button>

          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            戻る
          </Link>
        </div>
      </form>
    </div>
  );
}