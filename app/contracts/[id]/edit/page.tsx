"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ContractEdit = {
  id: string;
  contract_name: string | null;
  amount: number | null;
  cost: number | null;
  commission: number | null;
  contract_date: string | null;
  customer_id: string | null;
};

export default function ContractEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [contractName, setContractName] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [commission, setCommission] = useState("");
  const [contractDate, setContractDate] = useState("");

  useEffect(() => {
    if (!id) return;
    void fetchContract();
  }, [id]);

  async function fetchContract() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, contract_name, amount, cost, commission, contract_date, customer_id")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("contract fetch error:", error);
        setErrorMsg("契約情報の取得に失敗しました");
        return;
      }

      const contract = data as ContractEdit;

      setContractName(contract.contract_name || "");
      setAmount(
        contract.amount !== null && contract.amount !== undefined
          ? String(contract.amount)
          : ""
      );
      setCost(
        contract.cost !== null && contract.cost !== undefined
          ? String(contract.cost)
          : ""
      );
      setCommission(
        contract.commission !== null && contract.commission !== undefined
          ? String(contract.commission)
          : ""
      );
      setContractDate(contract.contract_date || "");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    const payload = {
      contract_name: contractName.trim() || null,
      amount: amount ? Number(amount) : 0,
      cost: cost ? Number(cost) : 0,
      commission: commission ? Number(commission) : 0,
      contract_date: contractDate || null,
    };

    const { error } = await supabase
      .from("contracts")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("contract update error:", error);
      setErrorMsg(`更新に失敗しました: ${error.message}`);
      setSaving(false);
      return;
    }

    alert("契約情報を更新しました");
    router.push(`/contracts/${id}`);
    router.refresh();
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "この契約を削除しますか？\n\n請求データがある契約は削除できません。"
    );

    if (!confirmed) return;

    try {
      setDeleting(true);

      const { data: billingRows, error: billingError } = await supabase
        .from("billings")
        .select("id")
        .eq("contract_id", id)
        .limit(1);

      if (billingError) {
        alert(`請求確認に失敗しました: ${billingError.message}`);
        return;
      }

      if (billingRows && billingRows.length > 0) {
        alert("この契約には請求データが紐づいているため削除できません");
        return;
      }

      const { error } = await supabase
        .from("contracts")
        .delete()
        .eq("id", id);

      if (error) {
        alert(`契約削除に失敗しました: ${error.message}`);
        return;
      }

      alert("契約を削除しました");
      router.push("/contracts");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const summary = useMemo(
    () => ({
      amountText: `¥${Number(amount || 0).toLocaleString()}`,
      costText: `¥${Number(cost || 0).toLocaleString()}`,
      commissionText: `¥${Number(commission || 0).toLocaleString()}`,
    }),
    [amount, cost, commission]
  );

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Contract Edit</p>
          <h1 className="text-2xl font-bold">契約編集</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/contracts/${id}`}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            契約詳細へ戻る
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">契約金額</div>
          <div className="mt-2 text-2xl font-bold">{summary.amountText}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">原価</div>
          <div className="mt-2 text-2xl font-bold">{summary.costText}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">手数料</div>
          <div className="mt-2 text-2xl font-bold">{summary.commissionText}</div>
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-xl bg-red-100 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-4 shadow-sm md:p-6"
      >
        <div>
          <h2 className="text-lg font-bold">編集内容</h2>
          <p className="mt-1 text-sm text-gray-500">
            契約名、金額、原価、手数料、契約日を更新できます
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="契約名">
            <input
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </Field>

          <Field label="契約日">
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </Field>

          <Field label="契約金額">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </Field>

          <Field label="原価">
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </Field>

          <Field label="手数料">
            <input
              type="number"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "更新中..." : "更新する"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}