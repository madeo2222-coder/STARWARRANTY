"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRelation =
  | {
      name: string;
    }
  | {
      name: string;
    }[]
  | null;

type ContractRow = {
  id: string;
  contract_name: string;
  amount: number | null;
  cost: number | null;
  commission: number | null;
  contract_date: string | null;
  agency_id: string | null;
  customer_id: string | null;
  customers: CustomerRelation;
};

type AgencyRow = {
  id: string;
  name: string;
};

function formatYen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function getCustomerName(value: CustomerRelation): string {
  if (!value) return "-";
  if (Array.isArray(value)) return value[0]?.name || "-";
  return value.name || "-";
}

export default function AssignAgencyPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [agencies, setAgencies] = useState<AgencyRow[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setMessage("");

    try {
      const [
        { data: contractData, error: contractError },
        { data: agencyData, error: agencyError },
      ] = await Promise.all([
        supabase
          .from("contracts")
          .select(`
            id,
            contract_name,
            amount,
            cost,
            commission,
            contract_date,
            agency_id,
            customer_id,
            customers(name)
          `)
          .is("agency_id", null)
          .order("contract_date", { ascending: false }),
        supabase.from("agencies").select("id, name").order("name", { ascending: true }),
      ]);

      if (contractError) throw contractError;
      if (agencyError) throw agencyError;

      setContracts((contractData as ContractRow[]) || []);
      setAgencies((agencyData as AgencyRow[]) || []);
    } catch (err: any) {
      console.error("assign agency fetch error:", err);
      setMessage(err?.message || "データ取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll(checked: boolean, ids: string[]) {
    if (checked) {
      setSelectedIds(ids);
    } else {
      setSelectedIds([]);
    }
  }

  async function assignAgencyBulk() {
    if (!selectedAgencyId) {
      alert("代理店を選択してください");
      return;
    }

    if (selectedIds.length === 0) {
      alert("契約を選択してください");
      return;
    }

    const targetAgency = agencies.find((item) => item.id === selectedAgencyId);
    const ok = window.confirm(
      `選択した ${selectedIds.length} 件の契約を「${targetAgency?.name || "選択代理店"}」に設定しますか？`
    );
    if (!ok) return;

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("contracts")
        .update({ agency_id: selectedAgencyId })
        .in("id", selectedIds);

      if (error) throw error;

      setContracts((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
      setSelectedIds([]);
      setSelectedAgencyId("");
      setMessage("代理店を一括設定しました");
    } catch (err: any) {
      console.error("assign agency bulk error:", err);
      setMessage(err?.message || "一括設定に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const filteredContracts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return contracts;

    return contracts.filter((item) => {
      const contractName = item.contract_name?.toLowerCase() || "";
      const customerName = getCustomerName(item.customers).toLowerCase();
      return (
        contractName.includes(keyword) || customerName.includes(keyword)
      );
    });
  }, [contracts, search]);

  const filteredIds = filteredContracts.map((item) => item.id);
  const allChecked =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  const summary = useMemo(() => {
    return filteredContracts.reduce(
      (acc, item) => {
        const amount = Number(item.amount || 0);
        const cost = Number(item.cost || 0);
        const commission = Number(item.commission || 0);

        acc.count += 1;
        acc.totalSales += amount;
        acc.totalGrossProfit += amount - cost - commission;
        return acc;
      },
      {
        count: 0,
        totalSales: 0,
        totalGrossProfit: 0,
      }
    );
  }, [filteredContracts]);

  return (
    <div className="p-4 pb-24">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Link
            href="/contracts"
            className="mb-2 inline-block text-sm text-gray-500 hover:text-black"
          >
            ← 契約一覧へ戻る
          </Link>
          <h1 className="text-2xl font-bold">未設定契約の代理店一括設定</h1>
          <p className="mt-1 text-sm text-gray-500">
            agency_id が未設定の契約をまとめて代理店に紐づけます
          </p>
        </div>

        <button
          onClick={fetchData}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          再読み込み
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-2xl border bg-blue-50 p-4 text-sm text-blue-800">
          {message}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">未設定契約数</p>
          <p className="mt-2 text-xl font-bold">{summary.count}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">未設定契約 売上合計</p>
          <p className="mt-2 text-xl font-bold">{formatYen(summary.totalSales)}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">未設定契約 粗利合計</p>
          <p className="mt-2 text-xl font-bold">
            {formatYen(summary.totalGrossProfit)}
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_260px_180px]">
        <input
          type="text"
          placeholder="契約名・顧客名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
        />

        <select
          value={selectedAgencyId}
          onChange={(e) => setSelectedAgencyId(e.target.value)}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
        >
          <option value="">代理店を選択</option>
          {agencies.map((agency) => (
            <option key={agency.id} value={agency.id}>
              {agency.name}
            </option>
          ))}
        </select>

        <button
          onClick={assignAgencyBulk}
          disabled={saving || selectedIds.length === 0 || !selectedAgencyId}
          className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "更新中..." : `一括設定 (${selectedIds.length})`}
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          読み込み中...
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          未設定の契約はありません
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) =>
                  toggleSelectAll(e.target.checked, filteredIds)
                }
              />
              <span>表示中の契約をすべて選択</span>
            </label>

            <p className="text-sm text-gray-500">
              選択中: {selectedIds.length}件
            </p>
          </div>

          <div className="space-y-3">
            {filteredContracts.map((contract) => {
              const amount = Number(contract.amount || 0);
              const cost = Number(contract.cost || 0);
              const commission = Number(contract.commission || 0);
              const grossProfit = amount - cost - commission;
              const checked = selectedIds.includes(contract.id);

              return (
                <div
                  key={contract.id}
                  className="rounded-2xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(contract.id)}
                        className="mt-1"
                      />

                      <div>
                        <h2 className="text-lg font-semibold">
                          {contract.contract_name || "契約名なし"}
                        </h2>

                        <div className="mt-2 space-y-1 text-sm text-gray-600">
                          <p>顧客名: {getCustomerName(contract.customers)}</p>
                          <p>契約日: {contract.contract_date || "-"}</p>
                          <p>代理店: 未設定</p>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/contracts/${contract.id}`}
                      className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                    >
                      詳細
                    </Link>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">売上</p>
                      <p className="mt-1 font-semibold">{formatYen(amount)}</p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">原価</p>
                      <p className="mt-1 font-semibold">{formatYen(cost)}</p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">手数料</p>
                      <p className="mt-1 font-semibold">{formatYen(commission)}</p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">粗利</p>
                      <p className="mt-1 font-semibold">{formatYen(grossProfit)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}