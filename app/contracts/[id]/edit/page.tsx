"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Contract = {
  id: string;
  customer_id: string | null;
  agency_id: string | null;
  contract_name: string | null;
  amount: number | null;
  cost: number | null;
  commission: number | null;
  contract_date: string | null;
};

type Customer = {
  id: string;
  name: string;
};

type Agency = {
  id: string;
  name: string;
};

type Billing = {
  id: string;
  contract_id: string;
};

export default function EditContractPage() {
  const supabase = createClient();

  const params = useParams();
  const router = useRouter();
  const contractId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [contractExists, setContractExists] = useState(true);

  const [customerId, setCustomerId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [contractName, setContractName] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [commission, setCommission] = useState("");
  const [contractDate, setContractDate] = useState("");

  useEffect(() => {
    if (!contractId) return;
    fetchData();
  }, [contractId]);

  async function fetchData() {
    setLoading(true);

    const [contractRes, customersRes, agenciesRes, billingsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select(
          "id, customer_id, agency_id, contract_name, amount, cost, commission, contract_date"
        )
        .eq("id", contractId)
        .single(),
      supabase.from("customers").select("id, name").order("name", { ascending: true }),
      supabase.from("agencies").select("id, name").order("name", { ascending: true }),
      supabase.from("billings").select("id, contract_id").eq("contract_id", contractId),
    ]);

    if (customersRes.error) {
      console.error("customers error:", customersRes.error);
    }
    if (agenciesRes.error) {
      console.error("agencies error:", agenciesRes.error);
    }
    if (billingsRes.error) {
      console.error("billings error:", billingsRes.error);
    }

    setCustomers((customersRes.data || []) as Customer[]);
    setAgencies((agenciesRes.data || []) as Agency[]);
    setBillings((billingsRes.data || []) as Billing[]);

    if (contractRes.error || !contractRes.data) {
      console.error("contract error:", contractRes.error);
      setContractExists(false);
      setLoading(false);
      return;
    }

    const contract = contractRes.data as Contract;

    setCustomerId(contract.customer_id || "");
    setAgencyId(contract.agency_id || "");
    setContractName(contract.contract_name || "");
    setAmount(contract.amount != null ? String(contract.amount) : "");
    setCost(contract.cost != null ? String(contract.cost) : "");
    setCommission(contract.commission != null ? String(contract.commission) : "");
    setContractDate(contract.contract_date || "");

    setContractExists(true);
    setLoading(false);
  }

  const linkedBillingCount = useMemo(() => {
    return billings.length;
  }, [billings]);

  const canDelete = linkedBillingCount === 0;

  function parseNumber(value: string) {
    if (value.trim() === "") return 0;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? NaN : parsed;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const trimmedContractName = contractName.trim();
  const parsedAmount = parseNumber(amount);
  const parsedCost = parseNumber(cost);
  const parsedCommission = parseNumber(commission);

  if (!customerId) {
    setErrorMessage("顧客を選択してください");
    return;
  }

  if (!trimmedContractName) {
    setErrorMessage("契約名を入力してください");
    return;
  }

  if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
    setErrorMessage("売上金額を正しく入力してください");
    return;
  }

  if (Number.isNaN(parsedCost) || parsedCost < 0) {
    setErrorMessage("原価を正しく入力してください");
    return;
  }

  if (Number.isNaN(parsedCommission) || parsedCommission < 0) {
    setErrorMessage("手数料を正しく入力してください");
    return;
  }

  setSaving(true);
  setErrorMessage("");

  const { error } = await supabase
    .from("contracts")
    .update({
      customer_id: customerId,
      agency_id: agencyId || null,
      contract_name: trimmedContractName,
      amount: parsedAmount,
      cost: parsedCost,
      commission: parsedCommission,
      contract_date: contractDate || null,
    })
    .eq("id", contractId);

  if (error) {
    console.error("update contract error:", error);
    setErrorMessage("契約情報の更新に失敗しました");
    setSaving(false);
    return;
  }

   setSaving(false);
  router.push(`/contracts/${contractId}`);
}

  async function handleDelete() {
    if (!canDelete) {
      alert("この契約には請求が紐づいているため削除できません");
      return;
    }

    const label = contractName.trim() || "この契約";
    const ok = window.confirm(
      `契約「${label}」を削除します。\nこの操作は元に戻せません。よろしいですか？`
    );

    if (!ok) return;

    setDeleting(true);
    setErrorMessage("");

    const { error } = await supabase.from("contracts").delete().eq("id", contractId);

    if (error) {
      console.error("delete contract error:", error);
      setErrorMessage("契約の削除に失敗しました");
      setDeleting(false);
      return;
    }

    router.push("/contracts");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            読み込み中...
          </div>
        </div>
      </div>
    );
  }

  if (!contractExists) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Link
            href="/contracts"
            className="inline-flex rounded-2xl bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-200"
          >
            契約一覧へ戻る
          </Link>
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            契約情報が見つかりません
          </div>
        </div>
      </div>
    );
  }

  const grossProfit =
    (Number(amount || 0) || 0) -
    (Number(cost || 0) || 0) -
    (Number(commission || 0) || 0);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Link
                href="/contracts"
                className="inline-flex rounded-2xl bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200"
              >
                ← 契約一覧へ戻る
              </Link>
              <Link
                href={`/contracts/${contractId}`}
                className="inline-flex rounded-2xl bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200"
              >
                詳細へ戻る
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">契約編集</h1>
            <p className="mt-1 text-sm text-gray-500">
              契約情報・顧客・代理店・金額を更新します
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 p-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  顧客 <span className="text-red-500">*</span>
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
                >
                  <option value="">選択してください</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  代理店
                </label>
                <select
                  value={agencyId}
                  onChange={(e) => setAgencyId(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
                >
                  <option value="">未設定</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  契約名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contractName}
                  onChange={(e) => setContractName(e.target.value)}
                  placeholder="例：AIO運用プラン"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
                />
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  売上金額
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
                />
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  原価
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
                />
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  手数料
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
                />
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  契約日
                </label>
                <input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
                />
              </div>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-700">想定粗利</p>
              <p className="mt-2 text-xl font-bold text-blue-900">
                ¥{grossProfit.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                売上 - 原価 - 手数料 で計算
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">紐づき請求件数</p>
              <p className="mt-2 text-lg font-bold text-gray-900">
                {linkedBillingCount.toLocaleString()}件
              </p>
              <p className="mt-2 text-xs text-gray-500">
                請求が1件でも紐づいている場合、この契約は削除できません
              </p>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving || deleting}
                className="rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "更新中..." : "更新する"}
              </button>

              <Link
                href={`/contracts/${contractId}`}
                className="rounded-2xl bg-white px-5 py-3 text-center text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200"
              >
                キャンセル
              </Link>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-red-700">削除</h2>
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            <p>・削除できるのは、請求が1件も紐づいていない契約のみです</p>
            <p>・削除すると元に戻せません</p>
            <p>・安全のため、確認ダイアログを表示します</p>
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || deleting || saving}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "削除中..." : "契約を削除する"}
            </button>
          </div>

          {!canDelete ? (
            <p className="mt-3 text-xs text-red-600">
              この契約には請求が紐づいているため削除できません
            </p>
          ) : (
            <p className="mt-3 text-xs text-gray-500">
              現在は請求紐づきがないため削除可能です
            </p>
          )}
        </div>
      </div>
    </div>
  );
}