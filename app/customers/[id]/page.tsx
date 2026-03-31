"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type CustomerDetail = {
  id: string;
  company_name: string | null;
  representative_name: string | null;
  contact_name: string | null;
  store_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  service_name: string | null;
  payment_method: string | null;
  monthly_amount: number | null;
  start_date: string | null;
  management_id: string | null;
  status: string | null;
  cancel_date: string | null;
  cancel_reason: string | null;
  agency_id: string | null;
  agencies:
    | {
        id: string;
        name: string | null;
      }
    | null;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchCustomer();
  }, [id]);

  async function fetchCustomer() {
    setLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select(
        `
        id,
        company_name,
        representative_name,
        contact_name,
        store_name,
        email,
        phone,
        postal_code,
        address,
        service_name,
        payment_method,
        monthly_amount,
        start_date,
        management_id,
        status,
        cancel_date,
        cancel_reason,
        agency_id,
        agencies (
          id,
          name
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error("customer detail fetch error:", error);
      alert("顧客詳細の取得に失敗しました");
      setLoading(false);
      return;
    }

    setCustomer((data ?? null) as unknown as CustomerDetail | null);
    setLoading(false);
  }

  function formatMoney(value: number | null) {
    return `¥${Number(value || 0).toLocaleString()}`;
  }

  function getPaymentLabel(paymentMethod: string | null) {
    if (paymentMethod === "card") return "クレジットカード";
    if (paymentMethod === "bank") return "口座振替";
    return "-";
  }

  function getStatusLabel(status: string | null) {
    if (status === "active") return "稼働中";
    if (status === "cancelled") return "解約";
    return "-";
  }

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (!customer) {
    return <div className="p-6">顧客情報が見つかりません</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <h1 className="text-2xl font-bold">顧客詳細</h1>

        <div className="flex gap-2">
          <Link
            href="/customers"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            顧客一覧へ戻る
          </Link>
          <Link
            href={`/customers/${customer.id}/edit`}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
          >
            編集する
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Info label="会社名" value={customer.company_name} />
          <Info label="店舗名" value={customer.store_name} />
          <Info label="代表者名" value={customer.representative_name} />
          <Info label="担当者名" value={customer.contact_name} />
          <Info label="メール" value={customer.email} />
          <Info label="電話番号" value={customer.phone} />
          <Info label="郵便番号" value={customer.postal_code} />
          <Info label="住所" value={customer.address} />
          <Info label="サービス名" value={customer.service_name} />
          <Info label="代理店" value={customer.agencies?.name || "-"} />
          <Info
            label="決済方法"
            value={getPaymentLabel(customer.payment_method)}
          />
          <Info label="月額" value={formatMoney(customer.monthly_amount)} />
          <Info label="開始日" value={customer.start_date} />
          <Info label="管理ID" value={customer.management_id} />
          <Info label="状態" value={getStatusLabel(customer.status)} />
          <Info label="解約日" value={customer.cancel_date} />
          <div className="md:col-span-2">
            <Info label="解約理由" value={customer.cancel_reason} />
          </div>
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
      <div className="rounded-lg border px-3 py-2 min-h-[44px] flex items-center">
        {value || "-"}
      </div>
    </div>
  );
}