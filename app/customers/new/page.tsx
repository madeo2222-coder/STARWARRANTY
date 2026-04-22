"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AppRole = "headquarters" | "agency" | "sub_agency";

type CurrentProfile = {
  userId: string;
  role: AppRole;
  agency_id: string | null;
};

type Agency = {
  id: string;
  agency_name: string | null;
  name: string | null;
};

function isAppRole(value: unknown): value is AppRole {
  return (
    value === "headquarters" ||
    value === "agency" ||
    value === "sub_agency"
  );
}

export default function NewCustomerPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyId, setAgencyId] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [contactName, setContactName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [managementId, setManagementId] = useState("");
  const [status, setStatus] = useState<"active" | "cancelled">("active");
  const [cancelDate, setCancelDate] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    void initializePage();
  }, []);

  async function initializePage() {
    try {
      setProfileLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        alert("ログイン状態を確認できませんでした。再ログインしてください。");
        router.push("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role, agency_id")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profileData || !isAppRole(profileData.role)) {
        alert("プロフィール情報の取得に失敗しました");
        return;
      }

      const currentProfile: CurrentProfile = {
        userId: user.id,
        role: profileData.role,
        agency_id: profileData.agency_id ?? null,
      };

      setProfile(currentProfile);

      if (currentProfile.role === "headquarters") {
        const { data, error } = await supabase
          .from("agencies")
          .select("id, agency_name, name, created_at")
          .order("created_at", { ascending: false });

        if (error) {
          alert("代理店一覧の取得に失敗しました");
          return;
        }

        setAgencies((data ?? []) as Agency[]);
        setAgencyId("");
        return;
      }

      if (!currentProfile.agency_id) {
        alert("代理店情報が未設定のため登録できません");
        return;
      }

      const { data, error } = await supabase
        .from("agencies")
        .select("id, agency_name, name")
        .eq("id", currentProfile.agency_id);

      if (error) {
        alert("代理店情報の取得に失敗しました");
        return;
      }

      setAgencies((data ?? []) as Agency[]);
      setAgencyId(currentProfile.agency_id);
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!profile) {
      alert("プロフィール情報が未取得です");
      return;
    }

    const resolvedAgencyId =
      profile.role === "headquarters"
        ? agencyId || null
        : profile.agency_id || null;

    if (profile.role !== "headquarters" && !resolvedAgencyId) {
      alert("代理店を選択してください");
      return;
    }

    const resolvedName =
      companyName.trim() ||
      storeName.trim() ||
      representativeName.trim() ||
      "名称未設定";

    try {
      setLoading(true);

      const payload = {
        name: resolvedName,
        company_name: companyName || null,
        representative_name: representativeName || null,
        contact_name: contactName || null,
        store_name: storeName || null,
        email: email || null,
        phone: phone || null,
        postal_code: postalCode || null,
        address: address || null,
        service_name: serviceName || null,
        payment_method: paymentMethod,
        monthly_amount: monthlyAmount ? Number(monthlyAmount) : null,
        start_date: startDate || null,
        management_id: managementId || null,
        status,
        cancel_date: cancelDate || null,
        cancel_reason: cancelReason || null,
        agency_id: resolvedAgencyId,
      };

      const { error } = await supabase.from("customers").insert([payload]);

      if (error) {
        alert(`顧客登録に失敗しました: ${error.message}`);
        return;
      }

      alert("顧客を登録しました");
      router.push("/customers");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const isAgencyFixed =
    profile?.role === "agency" || profile?.role === "sub_agency";

  const isHeadquarters = profile?.role === "headquarters";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">顧客新規登録</h1>
        <Link
          href="/customers"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          顧客一覧へ戻る
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-6"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">会社名</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">代表者名</label>
            <input
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">担当者名</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">店舗名</label>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">メール</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">電話番号</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">郵便番号</label>
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">住所</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">サービス名</label>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">決済方法</label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as "card" | "bank")
              }
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="card">カード</option>
              <option value="bank">口座振替</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">月額</label>
            <input
              type="number"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">開始日</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">管理ID</label>
            <input
              value={managementId}
              onChange={(e) => setManagementId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">状態</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "active" | "cancelled")
              }
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="active">active</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">解約日</label>
            <input
              type="date"
              value={cancelDate}
              onChange={(e) => setCancelDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium">解約理由</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium">代理店</label>
            <select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              disabled={profileLoading || isAgencyFixed}
              className="w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
            >
              {isHeadquarters ? (
                <option value="">
                  {profileLoading ? "読込中..." : "本部直契約（代理店なし）"}
                </option>
              ) : (
                <option value="">
                  {profileLoading ? "読込中..." : "選択してください"}
                </option>
              )}

              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.agency_name || agency.name || "名称未設定"}
                </option>
              ))}
            </select>

            {isAgencyFixed ? (
              <p className="mt-2 text-xs text-gray-500">
                あなたの権限では代理店は自動固定です
              </p>
            ) : null}

            {isHeadquarters ? (
              <p className="mt-2 text-xs text-gray-500">
                本部直契約のときは代理店を選ばず、そのまま登録できます
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || profileLoading}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "登録中..." : "登録する"}
          </button>
        </div>
      </form>
    </div>
  );
}