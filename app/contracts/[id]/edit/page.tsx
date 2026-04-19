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

type BillingRow = {
  id: string;
  contract_id: string | null;
  customer_id: string | null;
  billing_month: string | null;
};

function toBillingMonth(contractDate: string | null) {
  if (!contractDate) return null;
  return contractDate.slice(0, 7);
}

export default function ContractEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [customerId, setCustomerId] = useState<string | null>(null);
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
    setErrorMsg("");

    try {
      const { data, error } = await supabase
        .from("contracts")
        .select(
          "id, contract_name, amount, cost, commission, contract_date, customer_id"
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("contract fetch error:", error);
        setErrorMsg("契約情報の取得に失敗しました");
        return;
      }

      const contract = data as ContractEdit;

      setCustomerId(contract.customer_id ?? null);
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

    const amountNumber = amount ? Number(amount) : 0;
    const costNumber = cost ? Number(cost) : 0;
    const commissionNumber = commission ? Number(commission) : 0;
    const profitNumber = amountNumber - costNumber - commissionNumber;
    const nextContractDate = contractDate || null;
    const nextBillingMonth = toBillingMonth(nextContractDate);

    try {
      const { data: currentBillings, error: currentBillingsError } = await supabase
        .from("billings")
        .select("id, contract_id, customer_id, billing_month")
        .eq("contract_id", id);

      if (currentBillingsError) {
        console.error("current billings fetch error:", currentBillingsError);
        setErrorMsg(`請求確認に失敗しました: ${currentBillingsError.message}`);
        return;
      }

      const billingRows = (currentBillings ?? []) as BillingRow[];

      if (customerId && nextBillingMonth && billingRows.length > 0) {
        const currentBillingIds = billingRows.map((row) => row.id);

        const { data: conflictRows, error: conflictError } = await supabase
          .from("billings")
          .select("id, contract_id, customer_id, billing_month")
          .eq("customer_id", customerId)
          .eq("billing_month", nextBillingMonth);

        if (conflictError) {
          console.error("billing conflict check error:", conflictError);
          setErrorMsg(`請求重複確認に失敗しました: ${conflictError.message}`);
          return;
        }

        const conflicts = ((conflictRows ?? []) as BillingRow[]).filter(
          (row) => !currentBillingIds.includes(row.id)
        );

        if (conflicts.length > 0) {
          setErrorMsg(
            `この顧客には ${nextBillingMonth} の請求がすでに存在するため、契約日を変更できません。別の月に変更してください。`
          );
          return;
        }
      }

      const { error: contractError } = await supabase
        .from("contracts")
        .update({
          contract_name: contractName.trim() || null,
          amount: amountNumber,
          cost: costNumber,
          commission: commissionNumber,
          profit: profitNumber,
          contract_date: nextContractDate,
        })
        .eq("id", id);

      if (contractError) {
        console.error("contract update error:", contractError);
        setErrorMsg(`更新に失敗しました: ${contractError.message}`);
        return;
      }

      if (billingRows.length > 0) {
        const billingIds = billingRows
          .map((row) => row.id)
          .filter((value): value is string => Boolean(value));

        if (billingIds.length > 0) {
          const { error: billingUpdateError } = await supabase
            .from("billings")
            .update({
              amount: amountNumber,
              billing_month: nextBillingMonth,
            })
            .in("id", billingIds);

          if (billingUpdateError) {
            console.error("billing update error:", billingUpdateError);
            setErrorMsg(
              `契約は更新できましたが請求同期に失敗しました: ${billingUpdateError.message}`
            );
            return;
          }
        }
      }

      alert("契約情報を更新しました");
      router.push(`/contracts/${id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
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

      const { error } = await supabase.from("contracts").delete().eq("id", id);

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
      billingMonthText: toBillingMonth(contractDate) || "-",
    }),
    [amount, cost, commission, contractDate]
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

      {errorMsg ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">請求月</div>
          <div className="mt-2 text-2xl font-bold">{summary.billingMonthText}</div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">契約名</label>
            <input
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="契約名を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">金額</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">契約日</label>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">原価</label>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">手数料</label>
            <input
              type="number"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="0"
            />
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          <div>請求月: {summary.billingMonthText}</div>
          <div className="mt-1">
            同一顧客に同じ請求月の請求がある場合は、請求重複防止のため契約日変更を止めます
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "更新中..." : "更新する"}
          </button>
          <Link
            href={`/contracts/${id}`}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}