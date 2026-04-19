"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import BillingActionsClient from "./BillingActionsClient";

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

type Billing = {
  id: string;
  customer_id: string | null;
  contract_id: string | null;
  amount: number | null;
  status: "pending" | "paid" | "failed" | null;
  billing_month: string | null;
  due_date: string | null;
  paid_date: string | null;
  created_at: string | null;
  customers?: {
    id?: string | null;
    agency_id?: string | null;
    name?: string | null;
    company_name?: string | null;
    store_name?: string | null;
    representative_name?: string | null;
  } | null;
  contracts?: {
    id?: string | null;
    agency_id?: string | null;
    contract_name?: string | null;
  } | null;
};

type ContractForFilter = {
  id: string;
  agency_id: string | null;
};

function isAppRole(value: unknown): value is AppRole {
  return (
    value === "headquarters" ||
    value === "agency" ||
    value === "sub_agency"
  );
}

export default function BillingsPage() {
  const [loading, setLoading] = useState(true);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchBillingsPageData();
  }, []);

  async function fetchBillingsPageData() {
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
      } else if (currentProfile.role === "agency") {
        const ownAgencyId = currentProfile.agency_id;

        if (!ownAgencyId) {
          alert("代理店情報が未設定のため請求一覧を取得できません");
          return;
        }

        const childAgencyIds = allAgencies
          .filter((agency) => agency.parent_agency_id === ownAgencyId)
          .map((agency) => agency.id);

        visibleAgencyIds = [ownAgencyId, ...childAgencyIds];
      } else {
        const ownAgencyId = currentProfile.agency_id;

        if (!ownAgencyId) {
          alert("代理店情報が未設定のため請求一覧を取得できません");
          return;
        }

        visibleAgencyIds = [ownAgencyId];
      }

      let visibleContractIds: string[] | null = null;

      if (currentProfile.role !== "headquarters") {
        const { data: contractsForFilter, error: contractsForFilterError } =
          await supabase
            .from("contracts")
            .select("id, agency_id")
            .in("agency_id", visibleAgencyIds);

        if (contractsForFilterError) {
          alert(
            `請求一覧用の契約取得に失敗しました: ${contractsForFilterError.message}`
          );
          return;
        }

        const contractRows = (contractsForFilter ?? []) as ContractForFilter[];
        visibleContractIds = contractRows
          .map((contract) => contract.id)
          .filter((id): id is string => Boolean(id));

        if (visibleContractIds.length === 0) {
          setBillings([]);
          return;
        }
      }

      let billingsQuery = supabase
        .from("billings")
        .select(
          `
          id,
          customer_id,
          contract_id,
          amount,
          status,
          billing_month,
          due_date,
          paid_date,
          created_at,
          customers:customer_id (
            id,
            agency_id,
            name,
            company_name,
            store_name,
            representative_name
          ),
          contracts:contract_id (
            id,
            agency_id,
            contract_name
          )
        `
        )
        .order("billing_month", { ascending: false });

      if (
        currentProfile.role !== "headquarters" &&
        visibleContractIds &&
        visibleContractIds.length > 0
      ) {
        billingsQuery = billingsQuery.in("contract_id", visibleContractIds);
      }

      const { data: billingsData, error: billingsError } = await billingsQuery;

      if (billingsError) {
        alert(`請求一覧の取得に失敗しました: ${billingsError.message}`);
        return;
      }

      const rawBillings = (billingsData ?? []) as Billing[];
      setBillings(rawBillings);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBilling(billing: Billing) {
    const label = getCustomerLabel(billing);

    const confirmed = window.confirm(
      `「${label} / ${billing.billing_month || "対象月未設定"}」の請求を削除しますか？\n\nこの操作は取り消せません。`
    );

    if (!confirmed) return;

    try {
      setDeletingId(billing.id);

      const { error } = await supabase
        .from("billings")
        .delete()
        .eq("id", billing.id);

      if (error) {
        alert(`請求削除に失敗しました: ${error.message}`);
        return;
      }

      alert("請求を削除しました");
      setBillings((prev) => prev.filter((item) => item.id !== billing.id));
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

  const filteredBillings = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return billings.filter((billing) => {
      const agencyName = billing.contracts?.agency_id
        ? agencyMap.get(billing.contracts.agency_id) || ""
        : "";

      const customerLabel = getCustomerLabel(billing);

      const matchesSearch =
        !keyword ||
        [
          customerLabel,
          agencyName,
          billing.contracts?.contract_name,
          billing.billing_month,
          billing.status,
          billing.due_date,
          billing.paid_date,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));

      const matchesStatus =
        !statusFilter || (billing.status || "") === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [billings, search, statusFilter, agencyMap]);

  const totalAmount = useMemo(() => {
    return filteredBillings.reduce(
      (sum, billing) => sum + Number(billing.amount ?? 0),
      0
    );
  }, [filteredBillings]);

  function getCustomerLabel(billing: Billing) {
    return (
      billing.customers?.company_name ||
      billing.customers?.name ||
      billing.customers?.store_name ||
      billing.customers?.representative_name ||
      "名称未設定"
    );
  }

  function getAgencyLabel(billing: Billing) {
    const contractAgencyId = billing.contracts?.agency_id ?? null;
    if (!contractAgencyId) return "-";
    return agencyMap.get(contractAgencyId) || "-";
  }

  function getStatusLabel(status: Billing["status"]) {
    if (status === "pending") return "未回収";
    if (status === "paid") return "入金済み";
    if (status === "failed") return "回収不能";
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
          <h1 className="text-2xl font-bold">請求一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            {profile?.role === "headquarters"
              ? "本部表示"
              : profile?.role === "agency"
              ? "一次代理店表示"
              : "二次代理店表示"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-gray-500">件数</div>
          <div className="mt-2 text-2xl font-bold">
            {filteredBillings.length}件
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-gray-500">請求合計</div>
          <div className="mt-2 text-2xl font-bold">
            ¥{totalAmount.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-gray-500">状態</div>
          <div className="mt-2 text-sm text-gray-700">
            絞り込みや検索ができます
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="mb-1 text-sm text-gray-500">検索</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="顧客名 / 代理店 / 契約名 / 請求月"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>

          <div>
            <div className="mb-1 text-sm text-gray-500">ステータス</div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            >
              <option value="">すべて</option>
              <option value="pending">未回収</option>
              <option value="paid">入金済み</option>
              <option value="failed">回収不能</option>
            </select>
          </div>
        </div>
      </div>

      {filteredBillings.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500">
          請求データがありません
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">顧客名</th>
                <th className="px-4 py-3">代理店</th>
                <th className="px-4 py-3">契約名</th>
                <th className="px-4 py-3">請求月</th>
                <th className="px-4 py-3">金額</th>
                <th className="px-4 py-3">状態</th>
                <th className="px-4 py-3">支払期限</th>
                <th className="px-4 py-3">入金日</th>
                <th className="px-4 py-3">帳票</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredBillings.map((billing) => (
                <tr key={billing.id} className="border-t">
                  <td className="px-4 py-3">{getCustomerLabel(billing)}</td>
                  <td className="px-4 py-3">{getAgencyLabel(billing)}</td>
                  <td className="px-4 py-3">
                    {billing.contracts?.contract_name || "-"}
                  </td>
                  <td className="px-4 py-3">{billing.billing_month || "-"}</td>
                  <td className="px-4 py-3">
                    ¥{Number(billing.amount ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{getStatusLabel(billing.status)}</td>
                  <td className="px-4 py-3">{billing.due_date || "-"}</td>
                  <td className="px-4 py-3">{billing.paid_date || "-"}</td>
                  <td className="px-4 py-3">
                    <BillingActionsClient
                      billingId={billing.id}
                      customerName={getCustomerLabel(billing)}
                      canReceipt={billing.status === "paid"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/billings/${billing.id}`}
                        className="inline-flex rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                      >
                        詳細
                      </Link>
                      <Link
                        href={`/billings/${billing.id}/edit`}
                        className="inline-flex rounded-lg bg-black px-3 py-1.5 text-xs text-white"
                      >
                        編集
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDeleteBilling(billing)}
                        disabled={deletingId === billing.id}
                        className="inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === billing.id ? "削除中..." : "削除"}
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
  );
}