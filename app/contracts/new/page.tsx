"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  store_name: string | null;
  representative_name: string | null;
  agency_id: string | null;
};

function isAppRole(value: unknown): value is AppRole {
  return (
    value === "headquarters" ||
    value === "agency" ||
    value === "sub_agency"
  );
}

export default function NewContractPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [contractName, setContractName] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [commission, setCommission] = useState("");
  const [contractDate, setContractDate] = useState("");

  useEffect(() => {
    void initializePage();
  }, []);

  async function initializePage() {
    try {
      setLoading(true);

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
        alert(`代理店一覧の取得に失敗しました: ${agenciesError.message}`);
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
          alert("代理店情報が未設定のため契約登録を開始できません");
          return;
        }

        const childAgencyIds = allAgencies
          .filter((agency) => agency.parent_agency_id === ownAgencyId)
          .map((agency) => agency.id);

        visibleAgencyIds = [ownAgencyId, ...childAgencyIds];
      } else {
        const ownAgencyId = currentProfile.agency_id;

        if (!ownAgencyId) {
          alert("代理店情報が未設定のため契約登録を開始できません");
          return;
        }

        visibleAgencyIds = [ownAgencyId];
      }

      if (visibleAgencyIds.length === 0) {
        setCustomers([]);
        return;
      }

      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id, name, company_name, store_name, representative_name, agency_id")
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

  const agencyMap = useMemo(() => {
    return new Map(
      agencies.map((agency) => [
        agency.id,
        agency.agency_name || agency.name || "名称未設定",
      ])
    );
  }, [agencies]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === customerId) ?? null;
  }, [customers, customerId]);

  const selectedAgencyName = useMemo(() => {
    if (!selectedCustomer?.agency_id) return "";
    return agencyMap.get(selectedCustomer.agency_id) || "名称未設定";
  }, [selectedCustomer, agencyMap]);

  function getCustomerLabel(customer: Customer) {
    const displayName =
      customer.name ||
      customer.company_name ||
      customer.store_name ||
      customer.representative_name ||
      "名称未設定";

    const agencyName = customer.agency_id
      ? agencyMap.get(customer.agency_id) || "名称未設定"
      : "代理店未設定";

    return `${displayName} / ${agencyName}`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!profile) {
      alert("プロフィール情報が未取得です");
      return;
    }

    if (!customerId) {
      alert("顧客を選択してください");
      return;
    }

    if (!selectedCustomer) {
      alert("選択した顧客情報が見つかりません");
      return;
    }

    if (!selectedCustomer.agency_id) {
      alert("選択した顧客に代理店が紐づいていません");
      return;
    }

    if (!contractName.trim()) {
      alert("契約名を入力してください");
      return;
    }

    const payload = {
      customer_id: selectedCustomer.id,
      agency_id: selectedCustomer.agency_id,
      contract_name: contractName.trim(),
      amount: amount ? Number(amount) : 0,
      cost: cost ? Number(cost) : 0,
      commission: commission ? Number(commission) : 0,
      contract_date: contractDate || null,
    };

    try {
      setSaving(true);

      const { error } = await supabase.from("contracts").insert([payload]);

      if (error) {
        alert(`契約登録に失敗しました: ${error.message}`);
        return;
      }

      alert("契約を登録しました");
      router.push("/contracts");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 pb-24">
        <h1 className="mb-4 text-2xl font-bold">新規契約登録</h1>
        <div className="rounded border bg-white p-4">読込中...</div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">新規契約登録</h1>
        <Link
          href="/contracts"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          契約一覧へ戻る
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-6"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium">顧客</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">選択してください</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {getCustomerLabel(customer)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              表示される顧客は、あなたの権限で見える範囲のみに絞っています
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">代理店</label>
            <input
              value={selectedAgencyName}
              readOnly
              className="w-full rounded-lg border bg-gray-50 px-3 py-2"
              placeholder="顧客を選択すると自動表示"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">契約名</label>
            <input
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：月額集金代行プラン"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">契約金額</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：5000"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">原価</label>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：1000"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">手数料</label>
            <input
              type="number"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">契約日</label>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "登録中..." : "登録する"}
          </button>
        </div>
      </form>
    </div>
  );
}