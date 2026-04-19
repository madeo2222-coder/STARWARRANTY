"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BillingEdit = {
  id: string;
  amount: number | null;
  status: "pending" | "paid" | "failed" | null;
  billing_month: string | null;
  due_date: string | null;
  paid_date: string | null;
  customer_id?: string | null;
};

export default function BillingEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"pending" | "paid" | "failed">("pending");
  const [billingMonth, setBillingMonth] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");

  useEffect(() => {
    if (!id) return;
    void fetchBilling();
  }, [id]);

  async function fetchBilling() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("billings")
        .select("id, amount, status, billing_month, due_date, paid_date, customer_id")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("billing fetch error:", error);
        setErrorMsg("請求情報の取得に失敗しました");
        return;
      }

      const billing = data as BillingEdit;

      setAmount(
        billing.amount !== null && billing.amount !== undefined
          ? String(billing.amount)
          : ""
      );
      setStatus((billing.status || "pending") as "pending" | "paid" | "failed");
      setBillingMonth(billing.billing_month || "");
      setDueDate(billing.due_date || "");
      setPaidDate(billing.paid_date || "");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    const payload = {
      amount: amount ? Number(amount) : 0,
      status,
      billing_month: billingMonth || null,
      due_date: dueDate || null,
      paid_date: paidDate || null,
    };

    const { error } = await supabase
      .from("billings")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("billing update error:", error);
      setErrorMsg(`更新に失敗しました: ${error.message}`);
      setSaving(false);
      return;
    }

    alert("請求情報を更新しました");
    router.push(`/billings/${id}`);
    router.refresh();
  }

  function getStatusBadgeClass(currentStatus: "pending" | "paid" | "failed") {
    if (currentStatus === "pending") {
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    }
    if (currentStatus === "paid") {
      return "bg-green-50 text-green-700 border-green-200";
    }
    return "bg-red-50 text-red-700 border-red-200";
  }

  const summary = useMemo(
    () => ({
      amountText: `¥${Number(amount || 0).toLocaleString()}`,
      statusText:
        status === "pending" ? "未回収" : status === "paid" ? "入金済み" : "回収不能",
    }),
    [amount, status]
  );

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Billing Edit</p>
          <h1 className="text-2xl font-bold">請求編集</h1>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/billings/${id}`}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            請求詳細へ戻る
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">現在の請求金額</div>
          <div className="mt-2 text-2xl font-bold">{summary.amountText}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">現在の状態</div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${getStatusBadgeClass(
                status
              )}`}
            >
              {summary.statusText}
            </span>
          </div>
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
            請求月・金額・状態・支払期限・入金日を更新できます
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="請求月">
            <input
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="例：2026-04"
            />
          </Field>

          <Field label="金額">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </Field>

          <Field label="状態">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "pending" | "paid" | "failed")
              }
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="failed">failed</option>
            </select>
          </Field>

          <Field label="支払期限">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </Field>

          <Field label="入金日">
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
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