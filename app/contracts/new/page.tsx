"use client";

import { useEffect, useMemo, useState } from "react";
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
  agency_id: string | null;
  name: string | null;
  company_name: string | null;
  store_name: string | null;
  representative_name: string | null;
};

function isAppRole(value: unknown): value is AppRole {
  return (
    value === "headquarters" ||
    value === "agency" ||
    value === "sub_agency"
  );
}

function getCustomerLabel(customer: Customer) {
  return (
    customer.company_name ||
    customer.name ||
    customer.store_name ||
    customer.representative_name ||
    "名称未設定"
  );
}

function toBillingMonth(contractDate: string) {
  if (!contractDate) return "";
  return contractDate.slice(0, 7);
}

export default function NewContractPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [contractName, setContractName] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [commission, setCommission] = useState("");
  const [contractDate, setContractDate] = useState("");

  useEffect(() => {
    void fetchInitialData();
  }, []);

  async function fetchInitialData() {
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
        alert("プロフィール取得に失敗しました。");
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
          alert("代理店情報が未設定です。");
          return;
        }

        const childAgencyIds = allAgencies
          .filter((agency) => agency.parent_agency_id === ownAgencyId)
          .map((agency) => agency.id);

        visibleAgencyIds = [ownAgencyId, ...childAgencyIds];
        setAgencyId(ownAgencyId);
      } else {
        const ownAgencyId = currentProfile.agency_id;

        if (!ownAgencyId) {
          alert("代理店情報が未設定です。");
          return;
        }

        visibleAgencyIds = [ownAgencyId];
        setAgencyId(ownAgencyId);
      }

      let customersQuery = supabase
        .from("customers")
        .select("id, agency_id, name, company_name, store_name, representative_name")
        .order("created_at", { ascending: false });

      if (currentProfile.role !== "headquarters") {
        customersQuery = customersQuery.in("agency_id", visibleAgencyIds);
      }

      const { data: customersData, error: customersError } = await customersQuery;

      if (customersError) {
        alert(`顧客一覧の取得に失敗しました: ${customersError.message}`);
        return;
      }

      setCustomers((customersData ?? []) as Customer[]);
    } finally {
      setLoading(false);
    }
  }

  const visibleAgencies = useMemo(() => {
    if (!profile) return [];

    if (profile.role === "headquarters") {
      return agencies;
    }

    if (profile.role === "agency") {
      const ownAgencyId = profile.agency_id;
      return agencies.filter(
        (agency) =>
          agency.id === ownAgencyId || agency.parent_agency_id === ownAgencyId
      );
    }

    return agencies.filter((agency) => agency.id === profile.agency_id);
  }, [agencies, profile]);

  const filteredCustomers = useMemo(() => {
    if (!agencyId) return customers;
    return customers.filter((customer) => customer.agency_id === agencyId);
  }, [customers, agencyId]);

  useEffect(() => {
    if (!customerId) return;

    const exists = filteredCustomers.some((customer) => customer.id === customerId);
    if (!exists) {
      setCustomerId("");
    }
  }, [filteredCustomers, customerId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!customerId) {
      alert("顧客を選択してください。");
      return;
    }

    if (!agencyId) {
      alert("代理店を選択してください。");
      return;
    }

    if (!contractName.trim()) {
      alert("契約名を入力してください。");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      alert("金額を正しく入力してください。");
      return;
    }

    if (!contractDate) {
      alert("契約日を入力してください。");
      return;
    }

    try {
      setSaving(true);

      const amountNumber = Number(amount);
      const costNumber = Number(cost || 0);
      const commissionNumber = Number(commission || 0);
      const profitNumber = amountNumber - costNumber - commissionNumber;
      const billingMonth = toBillingMonth(contractDate);

      const { data: insertedContract, error: contractError } = await supabase
        .from("contracts")
        .insert({
          customer_id: customerId,
          agency_id: agencyId,
          contract_name: contractName.trim(),
          amount: amountNumber,
          cost: costNumber,
          commission: commissionNumber,
          profit: profitNumber,
          contract_date: contractDate,
        })
        .select("id, customer_id, agency_id, contract_name, amount, contract_date")
        .single();

      if (contractError || !insertedContract) {
        alert(`契約登録に失敗しました: ${contractError?.message ?? "unknown error"}`);
        return;
      }

      const { error: billingError } = await supabase.from("billings").insert({
        contract_id: insertedContract.id,
        customer_id: customerId,
        billing_month: billingMonth,
        amount: amountNumber,
        status: "pending",
        due_date: null,
        paid_date: null,
      });

      if (billingError) {
        await supabase.from("contracts").delete().eq("id", insertedContract.id);

        alert(`請求自動作成に失敗したため契約登録を取り消しました: ${billingError.message}`);
        return;
      }

      alert("契約登録と請求作成が完了しました。");
      router.push("/contracts");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border bg-white p-6">読込中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">新規契約登録</h1>
        <p className="mt-2 text-sm text-gray-500">
          契約登録時に初回請求を自動作成します
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">代理店</label>
            <select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              disabled={profile?.role !== "headquarters"}
              className="w-full rounded-lg border px-3 py-2 outline-none disabled:bg-gray-100"
            >
              <option value="">選択してください</option>
              {visibleAgencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.agency_name || agency.name || "名称未設定"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">顧客</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
            >
              <option value="">選択してください</option>
              {filteredCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {getCustomerLabel(customer)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">契約名</label>
            <input
              type="text"
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="例: サイナップ"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">金額</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="5000"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">原価</label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="2000"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">手数料</label>
              <input
                type="number"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="3000"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">契約日</label>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
            />
          </div>

          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            <div>請求月: {contractDate ? toBillingMonth(contractDate) : "-"}</div>
            <div className="mt-1">
              登録時に `billings` へ `pending` の初回請求を1件作成します
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {saving ? "登録中..." : "登録する"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/contracts")}
              className="rounded-lg border px-4 py-2"
            >
              戻る
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}