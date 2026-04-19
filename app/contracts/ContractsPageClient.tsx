"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { CurrentProfile } from "@/lib/auth/getCurrentProfile";

type ContractRow = {
  id: string;
  customer_id: string | null;
  agency_id: string | null;
  contract_name: string | null;
  amount: number | null;
  cost: number | null;
  commission: number | null;
  contract_date: string | null;
  created_at?: string | null;
  customers?: {
    id?: string | null;
    company_name: string | null;
    agency_id: string | null;
  } | null;
  agencies?: {
    id?: string | null;
    agency_name?: string | null;
    name?: string | null;
    parent_agency_id: string | null;
  } | null;
};

type AgencyRow = {
  id: string;
  agency_name?: string | null;
  name?: string | null;
  parent_agency_id: string | null;
};

type BillingRow = {
  id: string;
  contract_id: string | null;
};

type Props = {
  initialProfile: CurrentProfile | null;
};

function toContracts(value: unknown): ContractRow[] {
  if (!Array.isArray(value)) return [];
  return value as ContractRow[];
}

function toBillingMonth(contractDate: string | null) {
  if (!contractDate) return "";
  return contractDate.slice(0, 7);
}

export default function ContractsPageClient({ initialProfile }: Props) {
  const [profile] = useState<CurrentProfile | null>(initialProfile);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [visibleAgencyIds, setVisibleAgencyIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyLoading, setAgencyLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingBillingId, setCreatingBillingId] = useState<string | null>(null);
  const [billingContractIds, setBillingContractIds] = useState<string[]>([]);

  const canLoad = useMemo(() => {
    if (!profile) return false;
    if (profile.role === "headquarters") return true;
    if (!profile.agency_id) return false;
    return true;
  }, [profile]);

  const resolveVisibleAgencyIds = useCallback(async () => {
    if (!profile) {
      setVisibleAgencyIds([]);
      setAgencyLoading(false);
      return;
    }

    if (profile.role === "headquarters") {
      setVisibleAgencyIds([]);
      setAgencyLoading(false);
      return;
    }

    if (!profile.agency_id) {
      setVisibleAgencyIds([]);
      setAgencyLoading(false);
      return;
    }

    try {
      setAgencyLoading(true);
      setError("");

      if (profile.role === "sub_agency") {
        setVisibleAgencyIds([profile.agency_id]);
        return;
      }

      if (profile.role === "agency") {
        const { data, error } = await supabase
          .from("agencies")
          .select("id, agency_name, name, parent_agency_id")
          .eq("parent_agency_id", profile.agency_id);

        if (error) throw error;

        const children = (Array.isArray(data) ? data : []) as AgencyRow[];
        const ids = [profile.agency_id, ...children.map((row) => row.id)];
        setVisibleAgencyIds(ids);
        return;
      }

      setVisibleAgencyIds([]);
    } catch (e) {
      console.error(e);
      setError("代理店取得エラー");
    } finally {
      setAgencyLoading(false);
    }
  }, [profile]);

  const loadContracts = useCallback(async () => {
    if (!profile || !canLoad) {
      setContracts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      let query = supabase
        .from("contracts")
        .select(
          `
          *,
          customers:customer_id (
            id,
            company_name,
            agency_id
          ),
          agencies:agency_id (
            id,
            agency_name,
            name,
            parent_agency_id
          )
        `
        )
        .order("contract_date", { ascending: false });

      if (profile.role !== "headquarters") {
        if (visibleAgencyIds.length === 0) {
          setContracts([]);
          setLoading(false);
          return;
        }

        query = query.in("agency_id", visibleAgencyIds);
      }

      const { data, error } = await query;

      if (error) throw error;

      setContracts(toContracts(data));
    } catch (e) {
      console.error(e);
      setError("契約取得エラー");
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [profile, canLoad, visibleAgencyIds]);

  const loadBillingContractIds = useCallback(async (rows: ContractRow[]) => {
    const contractIds = rows
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));

    if (contractIds.length === 0) {
      setBillingContractIds([]);
      return;
    }

    const { data, error } = await supabase
      .from("billings")
      .select("id, contract_id")
      .in("contract_id", contractIds);

    if (error) {
      console.error(error);
      setError("請求紐づき確認エラー");
      setBillingContractIds([]);
      return;
    }

    const ids = ((data ?? []) as BillingRow[])
      .map((row) => row.contract_id)
      .filter((id): id is string => Boolean(id));

    setBillingContractIds(ids);
  }, []);

  useEffect(() => {
    void resolveVisibleAgencyIds();
  }, [resolveVisibleAgencyIds]);

  useEffect(() => {
    if (!profile) return;

    if (profile.role === "headquarters") {
      void loadContracts();
      return;
    }

    if (!agencyLoading) {
      void loadContracts();
    }
  }, [profile, agencyLoading, loadContracts]);

  useEffect(() => {
    void loadBillingContractIds(contracts);
  }, [contracts, loadBillingContractIds]);

  async function handleDeleteContract(contract: ContractRow) {
    const contractLabel = contract.contract_name || "名称未設定契約";

    const confirmed = window.confirm(
      `「${contractLabel}」を削除しますか？\n\n請求データが紐づいている契約は削除できません。`
    );

    if (!confirmed) return;

    try {
      setDeletingId(contract.id);

      const { data: billingRows, error: billingError } = await supabase
        .from("billings")
        .select("id")
        .eq("contract_id", contract.id)
        .limit(1);

      if (billingError) {
        alert(`請求確認に失敗しました: ${billingError.message}`);
        return;
      }

      if (billingRows && billingRows.length > 0) {
        alert("この契約には請求データが紐づいているため削除できません");
        return;
      }

      const { error: deleteError } = await supabase
        .from("contracts")
        .delete()
        .eq("id", contract.id);

      if (deleteError) {
        alert(`契約削除に失敗しました: ${deleteError.message}`);
        return;
      }

      alert("契約を削除しました");
      setContracts((prev) => prev.filter((item) => item.id !== contract.id));
      setBillingContractIds((prev) => prev.filter((id) => id !== contract.id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreateMissingBilling(contract: ContractRow) {
    const contractLabel = contract.contract_name || "名称未設定契約";

    if (!contract.customer_id) {
      alert("この契約は customer_id が無いため請求を作成できません");
      return;
    }

    const billingMonth = toBillingMonth(contract.contract_date);
    if (!billingMonth) {
      alert("この契約は契約日が無いため請求月を作れません");
      return;
    }

    const confirmed = window.confirm(
      `「${contractLabel}」の不足請求を1件作成しますか？`
    );

    if (!confirmed) return;

    try {
      setCreatingBillingId(contract.id);

      const { data: existingBilling, error: existingBillingError } = await supabase
        .from("billings")
        .select("id")
        .eq("contract_id", contract.id)
        .limit(1);

      if (existingBillingError) {
        alert(`既存請求確認に失敗しました: ${existingBillingError.message}`);
        return;
      }

      if (existingBilling && existingBilling.length > 0) {
        alert("この契約にはすでに請求データがあります");
        setBillingContractIds((prev) =>
          prev.includes(contract.id) ? prev : [...prev, contract.id]
        );
        return;
      }

      const { error: insertError } = await supabase.from("billings").insert({
        contract_id: contract.id,
        customer_id: contract.customer_id,
        billing_month: billingMonth,
        amount: Number(contract.amount ?? 0),
        status: "pending",
        due_date: null,
        paid_date: null,
      });

      if (insertError) {
        alert(`請求作成に失敗しました: ${insertError.message}`);
        return;
      }

      alert("不足していた請求を作成しました");
      setBillingContractIds((prev) =>
        prev.includes(contract.id) ? prev : [...prev, contract.id]
      );
    } finally {
      setCreatingBillingId(null);
    }
  }

  const total = useMemo(() => {
    return contracts.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  }, [contracts]);

  function getAgencyLabel(contract: ContractRow) {
    return contract.agencies?.agency_name || contract.agencies?.name || "-";
  }

  function hasBilling(contractId: string) {
    return billingContractIds.includes(contractId);
  }

  if (!profile) {
    return <div className="p-4 pb-24">ログインエラー</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">契約一覧</h1>
        <Link
          href="/contracts/new"
          className="rounded-lg bg-black px-4 py-2 text-sm text-white"
        >
          新規契約登録
        </Link>
      </div>

      <div className="mb-4">総売上: ¥{total.toLocaleString()}</div>

      {error ? (
        <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div>読み込み中...</div>
      ) : contracts.length === 0 ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
          契約データがありません
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">契約名</th>
                <th className="px-4 py-3">顧客</th>
                <th className="px-4 py-3">金額</th>
                <th className="px-4 py-3">原価</th>
                <th className="px-4 py-3">手数料</th>
                <th className="px-4 py-3">契約日</th>
                <th className="px-4 py-3">代理店</th>
                <th className="px-4 py-3">請求</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const billingExists = hasBilling(c.id);

                return (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-3">{c.contract_name || "-"}</td>
                    <td className="px-4 py-3">{c.customers?.company_name || "-"}</td>
                    <td className="px-4 py-3">
                      ¥{Number(c.amount ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      ¥{Number(c.cost ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      ¥{Number(c.commission ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{c.contract_date || "-"}</td>
                    <td className="px-4 py-3">{getAgencyLabel(c)}</td>
                    <td className="px-4 py-3">
                      {billingExists ? (
                        <span className="inline-flex rounded-lg bg-green-100 px-3 py-1.5 text-xs text-green-700">
                          作成済み
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleCreateMissingBilling(c)}
                          disabled={creatingBillingId === c.id}
                          className="inline-flex rounded-lg border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {creatingBillingId === c.id ? "作成中..." : "請求作成"}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/contracts/${c.id}`}
                          className="inline-flex rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                        >
                          詳細
                        </Link>
                        <Link
                          href={`/contracts/${c.id}/edit`}
                          className="inline-flex rounded-lg bg-black px-3 py-1.5 text-xs text-white"
                        >
                          編集
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContract(c)}
                          disabled={deletingId === c.id}
                          className="inline-flex rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === c.id ? "削除中..." : "削除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}