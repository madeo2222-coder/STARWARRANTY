"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "headquarters" | "agency" | "sub_agency";

type Profile = {
  role: AppRole;
  agency_id: string | null;
};

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

const LOGO_BUCKET = "agency-logos";
const MAX_LOGO_SIZE_MB = 5;

export default function HeadquartersPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
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

  useEffect(() => {
    void loadPageData();
  }, []);

  function sanitizePostalCode(value: string) {
    return value.replace(/[^\d-]/g, "").slice(0, 8);
  }

  function sanitizeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
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

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role, agency_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (!profileData) {
        throw new Error("プロフィールが見つかりません");
      }

      const currentProfile = profileData as Profile;
      setProfile(currentProfile);

      if (currentProfile.role !== "headquarters") {
        throw new Error("本部アカウントのみ利用できます");
      }

      const { data: rows, error: settingsError } = await supabase
        .from("headquarters_settings")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1);

      if (settingsError) {
        throw new Error(settingsError.message);
      }

      let currentSettings = (rows?.[0] ?? null) as HeadquartersSettings | null;

      if (!currentSettings) {
        const { data: inserted, error: insertError } = await supabase
          .from("headquarters_settings")
          .insert({
            company_name: "StarRevenue株式会社",
            representative_name: null,
            email: null,
            phone: null,
            postal_code: null,
            address: null,
            note: null,
            logo_url: null,
          })
          .select("*")
          .single();

        if (insertError || !inserted) {
          throw new Error(insertError?.message || "本部設定の初期作成に失敗しました");
        }

        currentSettings = inserted as HeadquartersSettings;
      }

      setSettingsId(currentSettings.id);
      setCompanyName(currentSettings.company_name || "");
      setRepresentativeName(currentSettings.representative_name || "");
      setEmail(currentSettings.email || "");
      setPhone(currentSettings.phone || "");
      setPostalCode(currentSettings.postal_code || "");
      setAddress(currentSettings.address || "");
      setNote(currentSettings.note || "");
      setLogoUrl(currentSettings.logo_url || "");
      setSelectedLogoName("");
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

      if (profile?.role !== "headquarters") {
        throw new Error("本部アカウントのみ更新できます");
      }

      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("PNG / JPG / WEBP の画像を選択してください");
      }

      const maxBytes = MAX_LOGO_SIZE_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error(`画像サイズは ${MAX_LOGO_SIZE_MB}MB 以下にしてください`);
      }

      if (!settingsId) {
        throw new Error("本部設定IDが取得できていません");
      }

      const safeFileName = sanitizeFileName(file.name);
      const filePath = `headquarters/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("headquarters_settings")
        .update({
          logo_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingsId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setLogoUrl(publicUrl);
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

      if (!settingsId) {
        throw new Error("本部設定IDが取得できていません");
      }

      const { error } = await supabase
        .from("headquarters_settings")
        .update({
          logo_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingsId);

      if (error) {
        throw new Error(error.message);
      }

      setLogoUrl("");
      setSelectedLogoName("");
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
      if (profile?.role !== "headquarters") {
        throw new Error("本部アカウントのみ更新できます");
      }

      if (!settingsId) {
        throw new Error("本部設定IDが取得できていません");
      }

      if (!companyName.trim()) {
        throw new Error("会社名を入力してください");
      }

      const { error } = await supabase
        .from("headquarters_settings")
        .update({
          company_name: companyName.trim(),
          representative_name: representativeName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          postal_code: sanitizePostalCode(postalCode.trim()) || null,
          address: address.trim() || null,
          note: note.trim() || null,
          logo_url: logoUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingsId);

      if (error) {
        throw new Error(error.message);
      }

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
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border bg-white p-6">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Headquarters My Page</p>
          <h1 className="text-2xl font-bold">本部情報変更</h1>
          <p className="mt-1 text-sm text-gray-500">
            本部の会社情報・ロゴを変更できます
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
            代理店一覧へ
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
                disabled={uploadingLogo}
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
                disabled={uploadingLogo}
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
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">会社名</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="会社名を入力"
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
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="example@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">電話番号</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="09012345678"
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
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">備考</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[100px] w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="備考を入力"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
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