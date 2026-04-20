"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AppRole = "headquarters" | "agency" | "sub_agency";

type Profile = {
  role: AppRole;
  agency_id: string | null;
};

type Agency = {
  id: string;
  agency_name: string | null;
  name: string | null;
  parent_agency_id: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  contact_person: string | null;
  memo: string | null;
  logo_url: string | null;
  created_at?: string | null;
};

const LOGO_BUCKET = "agency-logos";
const MAX_LOGO_SIZE_MB = 5;

export default function AgencyEditPage() {
  const params = useParams();
  const supabase = useMemo(() => createClient(), []);
  const agencyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);

  const [agencyName, setAgencyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [memo, setMemo] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [selectedLogoName, setSelectedLogoName] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!agencyId) return;
    void loadPageData();
  }, [agencyId]);

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

      if (!currentProfile.agency_id) {
        throw new Error("代理店情報がプロフィールに紐づいていません");
      }

      if (
        currentProfile.role !== "headquarters" &&
        currentProfile.agency_id !== agencyId
      ) {
        throw new Error("自店以外のマイページは開けません");
      }

      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select(
          `
          id,
          agency_name,
          name,
          parent_agency_id,
          representative_name,
          email,
          phone,
          postal_code,
          address,
          note,
          contact_person,
          memo,
          logo_url,
          created_at
        `
        )
        .eq("id", agencyId)
        .single();

      if (agencyError || !agencyData) {
        throw new Error(
          agencyError?.message || "代理店情報の取得に失敗しました"
        );
      }

      const currentAgency = agencyData as Agency;
      setAgency(currentAgency);

      setAgencyName(currentAgency.agency_name || "");
      setDisplayName(currentAgency.name || "");
      setRepresentativeName(currentAgency.representative_name || "");
      setContactPerson(currentAgency.contact_person || "");
      setEmail(currentAgency.email || "");
      setPhone(currentAgency.phone || "");
      setPostalCode(currentAgency.postal_code || "");
      setAddress(currentAgency.address || "");
      setNote(currentAgency.note || "");
      setMemo(currentAgency.memo || "");
      setLogoUrl(currentAgency.logo_url || "");
      setSelectedLogoName("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "データ取得に失敗しました";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  function sanitizePostalCode(value: string) {
    return value.replace(/[^\d-]/g, "").slice(0, 8);
  }

  function sanitizeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  function getFileExtension(fileName: string) {
    const parts = fileName.split(".");
    if (parts.length < 2) return "";
    return parts[parts.length - 1].toLowerCase();
  }

  async function handleLogoUpload(file: File) {
    try {
      setUploadingLogo(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (!profile?.agency_id) {
        throw new Error("代理店情報がプロフィールに紐づいていません");
      }

      if (profile.role !== "headquarters" && profile.agency_id !== agencyId) {
        throw new Error("自店以外のロゴは更新できません");
      }

      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("PNG / JPG / WEBP の画像を選択してください");
      }

      const maxBytes = MAX_LOGO_SIZE_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error(`画像サイズは ${MAX_LOGO_SIZE_MB}MB 以下にしてください`);
      }

      const extension = getFileExtension(file.name) || "png";
      const safeFileName = sanitizeFileName(file.name);
      const filePath = `${agencyId}/${Date.now()}-${safeFileName || `logo.${extension}`}`;

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
        .from("agencies")
        .update({
          logo_url: publicUrl,
        })
        .eq("id", agencyId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setLogoUrl(publicUrl);
      setSelectedLogoName(file.name);
      setAgency((prev) =>
        prev
          ? {
              ...prev,
              logo_url: publicUrl,
            }
          : prev
      );
      setSuccessMessage("ロゴ画像を更新しました");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ロゴ画像の更新に失敗しました";
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

      if (!profile?.agency_id) {
        throw new Error("代理店情報がプロフィールに紐づいていません");
      }

      if (profile.role !== "headquarters" && profile.agency_id !== agencyId) {
        throw new Error("自店以外のロゴは更新できません");
      }

      const { error } = await supabase
        .from("agencies")
        .update({
          logo_url: null,
        })
        .eq("id", agencyId);

      if (error) {
        throw new Error(error.message);
      }

      setLogoUrl("");
      setSelectedLogoName("");
      setAgency((prev) =>
        prev
          ? {
              ...prev,
              logo_url: null,
            }
          : prev
      );
      setSuccessMessage("ロゴ画像を外しました");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ロゴ画像の削除に失敗しました";
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
      if (!profile?.agency_id) {
        throw new Error("代理店情報がプロフィールに紐づいていません");
      }

      if (profile.role !== "headquarters" && profile.agency_id !== agencyId) {
        throw new Error("自店以外は更新できません");
      }

      if (!agencyName.trim()) {
        throw new Error("代理店名を入力してください");
      }

      const normalizedPostalCode = sanitizePostalCode(postalCode.trim());

      const { error } = await supabase
        .from("agencies")
        .update({
          agency_name: agencyName.trim(),
          name: displayName.trim() || null,
          representative_name: representativeName.trim() || null,
          contact_person: contactPerson.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          postal_code: normalizedPostalCode || null,
          address: address.trim() || null,
          note: note.trim() || null,
          memo: memo.trim() || null,
          logo_url: logoUrl.trim() || null,
        })
        .eq("id", agencyId);

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage("自店情報を更新しました");

      setAgency((prev) =>
        prev
          ? {
              ...prev,
              agency_name: agencyName.trim(),
              name: displayName.trim() || null,
              representative_name: representativeName.trim() || null,
              contact_person: contactPerson.trim() || null,
              email: email.trim() || null,
              phone: phone.trim() || null,
              postal_code: normalizedPostalCode || null,
              address: address.trim() || null,
              note: note.trim() || null,
              memo: memo.trim() || null,
              logo_url: logoUrl.trim() || null,
            }
          : prev
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "更新に失敗しました";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  const roleLabel = useMemo(() => {
    if (profile?.role === "headquarters") return "本部";
    if (profile?.role === "agency") return "一次代理店";
    if (profile?.role === "sub_agency") return "二次代理店";
    return "-";
  }, [profile]);

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
          <p className="text-sm text-gray-500">My Page</p>
          <h1 className="text-2xl font-bold">自店情報変更</h1>
          <p className="mt-1 text-sm text-gray-500">
            自店の基本情報とロゴ画像を変更できます
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
            代理店管理へ
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">ロール</div>
          <div className="mt-2 text-lg font-bold">{roleLabel}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">代理店ID</div>
          <div className="mt-2 break-all text-sm font-medium text-gray-800">
            {agency?.id || "-"}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">親代理店ID</div>
          <div className="mt-2 break-all text-sm font-medium text-gray-800">
            {agency?.parent_agency_id || "-"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold">ロゴ画像</h2>
          <p className="mt-1 text-sm text-gray-500">
            PNG / JPG / WEBP、{MAX_LOGO_SIZE_MB}MB以下
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="flex items-center justify-center rounded-2xl border bg-gray-50 p-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="代理店ロゴ"
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
                ? "現在のロゴ画像を表示中"
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
            <label className="text-sm font-medium text-gray-700">
              代理店名
            </label>
            <input
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="代理店名を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              表示名
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="表示名を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              担当者名
            </label>
            <input
              type="text"
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="担当者名を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              連絡担当
            </label>
            <input
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="連絡担当を入力"
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
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              電話番号
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="09012345678"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              郵便番号
            </label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(sanitizePostalCode(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="810-0022"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">
              住所
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="住所を入力"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">
              備考
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[90px] w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="備考を入力"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">
              メモ
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="min-h-[90px] w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="メモを入力"
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