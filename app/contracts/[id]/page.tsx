"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
  status: "pending" | "paid" | "failed" | string;
  amount: number | null;
  due_date: string | null;
  paid_date: string | null;
};

function formatYen(value: number | null | undefined) {
  return `¥${(value ?? 0).toLocaleString("ja-JP")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ja-JP");
}

function formatStatus(status: string) {
  if (status === "pending") return "未回収";
  if (status === "paid") return "入金済み";
  if (status === "failed") return "回収不能";
  return status;
}

function statusBadge(status: string) {
  if (status === "paid") {
    return (
      <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
        入金済み
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">
        回収不能
      </span>
    );
  }
  return (
    <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
      未回収
    </span>
  );
}

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = String(params?.id || "");

  const [contract, setContract] = useState<Contract | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!contractId) return;
    void fetchData();
  }, [contractId]);

  async function fetchData() {
    setLoading(true);
    setErrorMessage("");

    const { data: contractData, error: contractError } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError) {
      setErrorMessage("契約データの取得に失敗しました");
      setLoading(false);
      return;
    }

    if (!contractData) {
      setErrorMessage("契約データが見つかりません");
      setLoading(false);
      return;
    }

    setContract(contractData as Contract);

    const [customerRes, agencyRes, billingsRes] = await Promise.all([
      contractData.customer_id
        ? supabase
            .from("customers")
            .select("*")
            .eq("id", contractData.customer_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      contractData.agency_id
        ? supabase
            .from("agencies")
            .select("*")
            .eq("id", contractData.agency_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("billings")
        .select("*")
        .eq("contract_id", contractId)
        .order("due_date", { ascending: false }),
    ]);

    setCustomer((customerRes.data as Customer | null) ?? null);
    setAgency((agencyRes.data as Agency | null) ?? null);
    setBillings((billingsRes.data as Billing[]) ?? []);
    setLoading(false);
  }

  async function handleMarkAsPaid(billingId: string) {
    const ok = window.confirm("入金済みにしますか？");
    if (!ok) return;

    setUpdatingId(billingId);

    const today = new Date().toISOString().split("T")[0];

    const { error } = await supabase
      .from("billings")
      .update({
        status: "paid",
        paid_date: today,
      })
      .eq("id", billingId);

    if (error) {
      alert("更新失敗");
      setUpdatingId(null);
      return;
    }

    await fetchData();
    setUpdatingId(null);
  }

  async function handleDeleteContract() {
    if (!contractId) return;

    if (billings.length > 0) {
      alert("請求が紐づいているため削除できません");
      return;
    }

    const ok = window.confirm(
      "この契約を削除しますか？\nこの操作は元に戻せません。"
    );
    if (!ok) return;

    setDeleting(true);

    const { error } = await supabase
      .from("contracts")
      .delete()
      .eq("id", contractId);

    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      setDeleting(false);
      return;
    }

    router.push("/contracts");
  }

  const unpaid = useMemo(() => {
    return billings
      .filter((b) => b.status === "pending")
      .reduce((sum, b) => sum + (b.amount || 0), 0);
  }, [billings]);

  const totalAmount = useMemo(() => {
    return billings.reduce((sum, b) => sum + (b.amount || 0), 0);
  }, [billings]);

  const paidAmount = useMemo(() => {
    return billings
      .filter((b) => b.status === "paid")
      .reduce((sum, b) => sum + (b.amount || 0), 0);
  }, [billings]);

  const collectionRate = useMemo(() => {
    if (billings.length === 0) return 0;
    const paidCount = billings.filter((b) => b.status === "paid").length;
    return Math.round((paidCount / billings.length) * 1000) / 10;
  }, [billings]);

  const grossProfit = useMemo(() => {
    return (
      (contract?.amount || 0) -
      (contract?.cost || 0) -
      (contract?.commission || 0)
    );
  }, [contract]);

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (errorMessage) {
    return (
      <div className="space-y-4 p-6">
        <Link href="/contracts" className="text-blue-600 hover:underline">
          ← 一覧へ戻る
        </Link>
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-700">
          {errorMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link href="/contracts" className="text-blue-600 hover:underline">
          ← 一覧へ戻る
        </Link>

        <div className="flex gap-2">
          <Link
            href={`/contracts/${contractId}/edit`}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
          >
            編集
          </Link>
          <button
            onClick={handleDeleteContract}
            disabled={deleting}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? "削除中..." : "削除"}
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-bold">
        {contract?.contract_name ?? "契約詳細"}
      </h1>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-gray-500">契約金額</div>
          <div className="mt-1 text-xl font-semibold">
            {formatYen(contract?.amount)}
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-sm text-gray-500">粗利</div>
          <div className="mt-1 text-xl font-semibold">{formatYen(grossProfit)}</div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-sm text-gray-500">総請求額</div>
          <div className="mt-1 text-xl font-semibold">{formatYen(totalAmount)}</div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-sm text-gray-500">入金済み</div>
          <div className="mt-1 text-xl font-semibold">{formatYen(paidAmount)}</div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-sm text-gray-500">未回収額</div>
          <div className="mt-1 text-xl font-semibold">{formatYen(unpaid)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-gray-500">回収率</div>
          <div className="mt-1 text-xl font-semibold">{collectionRate}%</div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-sm text-gray-500">請求件数</div>
          <div className="mt-1 text-xl font-semibold">
            {billings.length.toLocaleString()}件
          </div>
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-4 text-lg font-bold">契約情報</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm text-gray-500">契約名</div>
            <div>{contract?.contract_name ?? "-"}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">契約日</div>
            <div>{formatDate(contract?.contract_date)}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">顧客</div>
            <div>{customer?.name ?? "-"}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">代理店</div>
            <div>{agency?.name ?? "-"}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">金額</div>
            <div>{formatYen(contract?.amount)}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">原価</div>
            <div>{formatYen(contract?.cost)}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">手数料</div>
            <div>{formatYen(contract?.commission)}</div>
          </div>
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-bold">請求一覧</h2>

        {billings.length === 0 ? (
          <div className="text-sm text-gray-500">請求データがありません</div>
        ) : (
          <div className="space-y-2">
            {billings.map((b) => (
              <div
                key={b.id}
                className="flex flex-col gap-3 rounded border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {statusBadge(b.status)}
                    <span className="font-medium">{formatYen(b.amount)}</span>
                  </div>

                  <div className="text-sm text-gray-500">
                    請求日: {formatDate(b.due_date)} / 入金日: {formatDate(b.paid_date)}
                  </div>

                  <div className="text-sm text-gray-500">
                    ステータス: {formatStatus(b.status)}
                  </div>
                </div>

                <div className="flex gap-2">
                  {b.status === "pending" && (
                    <button
                      onClick={() => handleMarkAsPaid(b.id)}
                      disabled={updatingId === b.id}
                      className="rounded bg-green-600 px-3 py-1 text-sm text-white"
                    >
                      {updatingId === b.id ? "更新中..." : "入金"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}