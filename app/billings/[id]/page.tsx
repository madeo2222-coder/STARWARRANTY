"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BillingDetail = {
  id: string;
  customer_id: string | null;
  contract_id: string | null;
  amount: number | null;
  status: "pending" | "paid" | "failed" | null;
  billing_month: string | null;
  due_date: string | null;
  paid_date: string | null;
  created_at: string | null;
  customers?: {
    id?: string | null;
    name?: string | null;
    company_name?: string | null;
    store_name?: string | null;
    representative_name?: string | null;
    agency_id?: string | null;
  } | null;
};

type Agency = {
  id: string;
  agency_name: string | null;
  name: string | null;
};

export default function BillingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [billing, setBilling] = useState<BillingDetail | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    void fetchBilling();
  }, [id]);

  async function fetchBilling() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("billings")
        .select(
          `
          id,
          customer_id,
          contract_id,
          amount,
          status,
          billing_month,
          due_date,
          paid_date,
          created_at,
          customers:customer_id (
            id,
            name,
            company_name,
            store_name,
            representative_name,
            agency_id
          )
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("billing detail fetch error:", error);
        alert(`請求詳細の取得に失敗しました: ${error.message}`);
        return;
      }

      if (!data) {
        setBilling(null);
        setAgency(null);
        return;
      }

      const billingData = data as BillingDetail;
      setBilling(billingData);

      const customerAgencyId = billingData.customers?.agency_id ?? null;

      if (!customerAgencyId) {
        setAgency(null);
        return;
      }

      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select("id, agency_name, name")
        .eq("id", customerAgencyId)
        .maybeSingle();

      if (agencyError) {
        console.error("agency fetch error:", agencyError);
        setAgency(null);
        return;
      }

      setAgency((agencyData ?? null) as Agency | null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!billing) return;

    const confirmed = window.confirm(
      `「${getCustomerLabel()} / ${billing.billing_month || "対象月未設定"}」の請求を削除しますか？\n\nこの操作は取り消せません。`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);

      const { error } = await supabase
        .from("billings")
        .delete()
        .eq("id", billing.id);

      if (error) {
        alert(`請求削除に失敗しました: ${error.message}`);
        return;
      }

      alert("請求を削除しました");
      router.push("/billings");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  function getCustomerLabel() {
    if (!billing?.customers) return "-";

    return (
      billing.customers.company_name ||
      billing.customers.name ||
      billing.customers.store_name ||
      billing.customers.representative_name ||
      "-"
    );
  }

  function getAgencyLabel() {
    return agency?.agency_name || agency?.name || "-";
  }

  function getStatusLabel(status: BillingDetail["status"]) {
    if (status === "pending") return "未回収";
    if (status === "paid") return "入金済み";
    if (status === "failed") return "回収不能";
    return "-";
  }

  function getStatusBadgeClass(status: BillingDetail["status"]) {
    if (status === "pending") {
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    }
    if (status === "paid") {
      return "bg-green-50 text-green-700 border-green-200";
    }
    if (status === "failed") {
      return "bg-red-50 text-red-700 border-red-200";
    }
    return "bg-gray-50 text-gray-700 border-gray-200";
  }

  function formatMoney(value: number | null) {
    return `¥${Number(value || 0).toLocaleString()}`;
  }

  function formatDate(value: string | null) {
    return value || "-";
  }

  const summaryCards = useMemo(
    () => [
      { label: "請求月", value: billing?.billing_month || "-" },
      { label: "請求金額", value: formatMoney(billing?.amount ?? 0) },
      { label: "状態", value: getStatusLabel(billing?.status ?? null) },
      { label: "支払期限", value: formatDate(billing?.due_date ?? null) },
    ],
    [billing]
  );

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (!billing) {
    return <div className="p-6">請求情報が見つかりません</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Billing Detail</p>
          <h1 className="text-2xl font-bold">請求詳細</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/billings"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            請求一覧へ戻る
          </Link>
          <Link
            href={`/billings/${billing.id}/edit`}
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">基本情報</h2>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
              billing.status
            )}`}
          >
            {getStatusLabel(billing.status)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="顧客名" value={getCustomerLabel()} />
          <Info label="代理店" value={getAgencyLabel()} />
          <Info label="請求月" value={billing.billing_month} />
          <Info label="請求金額" value={formatMoney(billing.amount)} />
          <Info label="支払期限" value={billing.due_date} />
          <Info label="入金日" value={billing.paid_date} />
          <Info label="請求ID" value={billing.id} />
          <Info label="契約ID" value={billing.contract_id} />
          <Info label="作成日時" value={billing.created_at} />
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