"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
};

type Customer = {
  id: string;
  name: string | null;
  company_name: string | null;
  representative_name: string | null;
  contact_name: string | null;
  store_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  service_name: string | null;
  payment_method: "card" | "bank" | null;
  monthly_amount: number | null;
  start_date: string | null;
  management_id: string | null;
  status: "active" | "cancelled" | null;
  cancel_date: string | null;
  cancel_reason: string | null;
  agency_id: string | null;
  created_at?: string | null;
};

function isAppRole(value: unknown): value is AppRole {
  return (
    value === "headquarters" ||
    value === "agency" ||
    value === "sub_agency"
  );
}

export default function CustomersPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchCustomersPageData();
  }, []);

  async function fetchCustomersPageData() {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        alert("ログイン状態を確認できませんでした。再ログインしてください。");
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

      const currentProfile: Profile = {
        role: profileData.role,
        agency_id: profileData.agency_id ?? null,
      };

      setProfile(currentProfile);

      const { data: agenciesData, error: agenciesError } = await supabase
        .from("agencies")
        .select("id, agency_name, name, parent_agency_id")
        .order("created_at", { ascending: false });

      if (agenciesError) {
        alert("代理店一覧の取得に失敗しました");
        return;
      }

      const allAgencies = (agenciesData ?? []) as Agency[];
      setAgencies(allAgencies);

      let visibleAgencyIds: string[] = [];

      if (currentProfile.role === "headquarters") {
        visibleAgencyIds = allAgencies.map((agency) => agency.id);
      } else {
        const ownAgencyId = currentProfile.agency_id;

        if (!ownAgencyId) {
          alert("代理店情報が未設定のため顧客一覧を取得できません");
          return;
        }

        const childAgencyIds = allAgencies
          .filter((agency) => agency.parent_agency_id === ownAgencyId)
          .map((agency) => agency.id);

        visibleAgencyIds = [ownAgencyId, ...childAgencyIds];
      }

      if (visibleAgencyIds.length === 0) {
        setCustomers([]);
        return;
      }

      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select(
          `
          id,
          name,
          company_name,
          representative_name,
          contact_name,
          store_name,
          email,
          phone,
          postal_code,
          address,
          service_name,
          payment_method,
          monthly_amount,
          start_date,
          management_id,
          status,
          cancel_date,
          cancel_reason,
          agency_id,
          created_at
        `
        )
        .in("agency_id", visibleAgencyIds)
        .order("created_at", { ascending: false });

      if (customersError) {
        alert(`顧客一覧の取得に失敗しました: ${customersError.message}`);
        return;
      }

      setCustomers((customersData ?? []) as Customer[]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCustomer(customer: Customer) {
    const customerLabel =
      customer.name ||
      customer.company_name ||
      customer.store_name ||
      customer.representative_name ||
      "名称未設定";

    const confirmed = window.confirm(
      `「${customerLabel}」を削除しますか？\n\n請求・契約・口振ファイルが紐づく顧客は削除できません。`
    );

    if (!confirmed) return;

    try {
      setDeletingId(customer.id);

      const { data: billingRows, error: billingError } = await supabase
        .from("billings")
        .select("id")
        .eq("customer_id", customer.id)
        .limit(1);

      if (billingError) {
        alert(`請求確認に失敗しました: ${billingError.message}`);
        return;
      }

      if (billingRows && billingRows.length > 0) {
        alert("この顧客には請求データが紐づいているため削除できません");
        return;
      }

      const { data: contractRows, error: contractError } = await supabase
        .from("contracts")
        .select("id")
        .eq("customer_id", customer.id)
        .limit(1);

      if (contractError) {
        alert(`契約確認に失敗しました: ${contractError.message}`);
        return;
      }

      if (contractRows && contractRows.length > 0) {
        alert("この顧客には契約データが紐づいているため削除できません");
        return;
      }

      const { data: documentRows, error: documentError } = await supabase
        .from("bank_transfer_documents")
        .select("id")
        .eq("customer_id", customer.id)
        .limit(1);

      if (documentError) {
        alert(`口振ファイル確認に失敗しました: ${documentError.message}`);
        return;
      }

      if (documentRows && documentRows.length > 0) {
        alert("この顧客には口座振替用紙が紐づいているため削除できません");
        return;
      }

      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customer.id);

      if (error) {
        alert(`削除に失敗しました: ${error.message}`);
        return;
      }

      alert("顧客を削除しました");
      setCustomers((prev) => prev.filter((item) => item.id !== customer.id));
    } finally {
      setDeletingId(null);
    }
  }

  const agencyMap = useMemo(() => {
    return new Map(
      agencies.map((agency) => [
        agency.id,
        agency.agency_name || agency.name || "名称未設定",
      ])
    );
  }, [agencies]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return customers;

    return customers.filter((customer) => {
      const agencyName = customer.agency_id
        ? agencyMap.get(customer.agency_id) || ""
        : "";

      return [
        customer.name,
        customer.company_name,
        customer.store_name,
        customer.representative_name,
        customer.contact_name,
        customer.email,
        customer.phone,
        customer.service_name,
        customer.management_id,
        agencyName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [customers, search, agencyMap]);

  function getCustomerDisplayName(customer: Customer) {
    return (
      customer.name ||
      customer.company_name ||
      customer.store_name ||
      customer.representative_name ||
      "名称未設定"
    );
  }

  function getPaymentMethodLabel(paymentMethod: Customer["payment_method"]) {
    if (paymentMethod === "card") return "カード";
    if (paymentMethod === "bank") return "口座振替";
    return "-";
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border bg-white p-6">読込中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">顧客一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            {profile?.role === "headquarters"
              ? "本部表示"
              : profile?.role === "agency"
              ? "一次代理店表示"
              : "二次代理店表示"}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/customers/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            顧客新規登録
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <label className="mb-2 block text-sm font-medium">検索</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="会社名・店舗名・担当者名・代理店名など"
          className="w-full rounded-lg border px-3 py-2"
        />
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 text-sm text-gray-600">
          件数: {filteredCustomers.length}件
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">顧客データがありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">顧客名</th>
                  <th className="px-4 py-3 font-medium">会社名</th>
                  <th className="px-4 py-3 font-medium">店舗名</th>
                  <th className="px-4 py-3 font-medium">代理店</th>
                  <th className="px-4 py-3 font-medium">サービス名</th>
                  <th className="px-4 py-3 font-medium">決済方法</th>
                  <th className="px-4 py-3 font-medium">月額</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">管理ID</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-t">
                    <td className="px-4 py-3">{getCustomerDisplayName(customer)}</td>
                    <td className="px-4 py-3">{customer.company_name || "-"}</td>
                    <td className="px-4 py-3">{customer.store_name || "-"}</td>
                    <td className="px-4 py-3">
                      {customer.agency_id
                        ? agencyMap.get(customer.agency_id) || "名称未設定"
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{customer.service_name || "-"}</td>
                    <td className="px-4 py-3">
                      {getPaymentMethodLabel(customer.payment_method)}
                    </td>
                    <td className="px-4 py-3">
                      {customer.monthly_amount != null
                        ? `¥${customer.monthly_amount.toLocaleString()}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{customer.status || "-"}</td>
                    <td className="px-4 py-3">{customer.management_id || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="inline-flex rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                        >
                          顧客詳細
                        </Link>
                        <Link
                          href={`/customers/${customer.id}/edit`}
                          className="inline-flex rounded-lg bg-black px-3 py-1.5 text-xs text-white"
                        >
                          編集
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCustomer(customer)}
                          disabled={deletingId === customer.id}
                          className="inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === customer.id ? "削除中..." : "削除"}
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