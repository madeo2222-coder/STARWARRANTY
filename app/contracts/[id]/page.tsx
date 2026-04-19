"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ContractDetail = {
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
    name?: string | null;
    company_name?: string | null;
    store_name?: string | null;
    representative_name?: string | null;
  } | null;
  agencies?: {
    id?: string | null;
    agency_name?: string | null;
    name?: string | null;
  } | null;
};

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    void fetchPageData();
  }, [id]);

  async function fetchPageData() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("contracts")
        .select(
          `
          id,
          customer_id,
          agency_id,
          contract_name,
          amount,
          cost,
          commission,
          contract_date,
          created_at,
          customers:customer_id (
            id,
            name,
            company_name,
            store_name,
            representative_name
          ),
          agencies:agency_id (
            id,
            agency_name,
            name
          )
        `
        )
        .eq("id", id)
        .single();

      if (error) {
        console.error("contract detail fetch error:", error);
        alert("契約詳細の取得に失敗しました");
        return;
      }

      setContract((data ?? null) as ContractDetail | null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!contract) return;

    const confirmed = window.confirm(
      `「${contract.contract_name || "この契約"}」を削除しますか？\n\n請求データが紐づいている契約は削除できません。`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);

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
      router.push("/contracts");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  function getCustomerLabel() {
    if (!contract?.customers) return "-";

    return (
      contract.customers.company_name ||
      contract.customers.name ||
      contract.customers.store_name ||
      contract.customers.representative_name ||
      "-"
    );
  }

  function getAgencyLabel() {
    if (!contract?.agencies) return "-";
    return contract.agencies.agency_name || contract.agencies.name || "-";
  }

  function formatMoney(value: number | null) {
    return `¥${Number(value || 0).toLocaleString()}`;
  }

  function formatDate(value: string | null) {
    return value || "-";
  }

  const summaryCards = useMemo(
    () => [
      { label: "契約日", value: formatDate(contract?.contract_date ?? null) },
      { label: "契約金額", value: formatMoney(contract?.amount ?? 0) },
      { label: "原価", value: formatMoney(contract?.cost ?? 0) },
      { label: "手数料", value: formatMoney(contract?.commission ?? 0) },
    ],
    [contract]
  );

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (!contract) {
    return <div className="p-6">契約情報が見つかりません</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Contract Detail</p>
          <h1 className="text-2xl font-bold">契約詳細</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/contracts"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            契約一覧へ戻る
          </Link>
          <Link
            href={`/contracts/${contract.id}/edit`}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
          >
            編集する
          </Link>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "削除中..." : "削除"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{card.label}</div>
            <div className="mt-2 text-xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold">基本情報</h2>
          <p className="mt-1 text-sm text-gray-500">
            契約内容と紐づく顧客・代理店情報を確認できます
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="契約名" value={contract.contract_name} />
          <Info label="顧客" value={getCustomerLabel()} />
          <Info label="代理店" value={getAgencyLabel()} />
          <Info label="契約日" value={contract.contract_date} />
          <Info label="契約金額" value={formatMoney(contract.amount)} />
          <Info label="原価" value={formatMoney(contract.cost)} />
          <Info label="手数料" value={formatMoney(contract.commission)} />
          <Info label="契約ID" value={contract.id} />
          <Info label="作成日時" value={contract.created_at || "-"} />
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div>
      <p className="mb-1 text-sm text-gray-500">{label}</p>
      <div className="flex min-h-[44px] items-center rounded-xl border bg-gray-50 px-3 py-2">
        {value || "-"}
      </div>
    </div>
  );
}