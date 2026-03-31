"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  name: string;
};

type Customer = {
  id: string;
  company_name: string | null;
  store_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  monthly_amount: number | null;
  status: string | null;
  payment_method: string | null;
  start_date: string | null;
  agency_id: string | null;
};

type Billing = {
  id: string;
  customer_id: string;
  amount: number | null;
  status: "pending" | "paid" | "failed" | string | null;
  billing_month: string | null;
  paid_date: string | null;
  created_at: string | null;
};

type CustomerWithSummary = Customer & {
  billingCount: number;
  totalAmount: number;
  pendingAmount: number;
  paidAmount: number;
  failedAmount: number;
};

function formatYen(value: number) {
  return `¥${value.toLocaleString()}`;
}

function formatBillingMonth(value: string | null) {
  if (!value) return "-";
  return value;
}

function paymentMethodLabel(value: string | null) {
  if (value === "card") return "クレカ";
  if (value === "bank") return "口座振替";
  return "-";
}

function statusLabel(value: string | null) {
  if (value === "active") return "稼働中";
  if (value === "cancelled") return "解約";
  return value || "-";
}

function billingStatusLabel(value: string | null) {
  if (value === "pending") return "未回収";
  if (value === "paid") return "回収済";
  if (value === "failed") return "回収不能";
  return value || "-";
}

export default function AgencyDetailPage() {
  const params = useParams();
  const agencyId = params.id as string;

  const [agency, setAgency] = useState<Agency | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!agencyId) return;
    fetchAll();
  }, [agencyId]);

  async function fetchAll() {
    setLoading(true);
    setErrorMsg("");

    try {
      const agencyResult = await supabase
        .from("agencies")
        .select("id, name")
        .eq("id", agencyId)
        .single();

      if (agencyResult.error || !agencyResult.data) {
        console.error("agency fetch error:", agencyResult.error);
        setErrorMsg("代理店情報の取得に失敗しました");
        setLoading(false);
        return;
      }

      setAgency(agencyResult.data as Agency);

      const customersResult = await supabase
        .from("customers")
        .select(
          "id, company_name, store_name, contact_name, email, phone, monthly_amount, status, payment_method, start_date, agency_id"
        )
        .eq("agency_id", agencyId)
        .order("company_name", { ascending: true });

      if (customersResult.error) {
        console.error("customers fetch error:", customersResult.error);
        setErrorMsg("代理店の顧客一覧の取得に失敗しました");
        setLoading(false);
        return;
      }

      const customersData = (customersResult.data ?? []) as Customer[];
      setCustomers(customersData);

      const customerIds = customersData.map((customer) => customer.id);

      if (customerIds.length === 0) {
        setBillings([]);
        setLoading(false);
        return;
      }

      const billingsResult = await supabase
        .from("billings")
        .select("id, customer_id, amount, status, billing_month, paid_date, created_at")
        .in("customer_id", customerIds)
        .order("billing_month", { ascending: false });

      if (billingsResult.error) {
        console.error("billings fetch error:", billingsResult.error);
        setErrorMsg("請求データの取得に失敗しました");
        setLoading(false);
        return;
      }

      setBillings((billingsResult.data ?? []) as Billing[]);
      setLoading(false);
    } catch (error) {
      console.error("agency detail unexpected error:", error);
      setErrorMsg("代理店詳細の読み込み中に予期しないエラーが発生しました");
      setLoading(false);
    }
  }

  const customerSummaryMap = useMemo(() => {
    const map = new Map<string, CustomerWithSummary>();

    for (const customer of customers) {
      map.set(customer.id, {
        ...customer,
        billingCount: 0,
        totalAmount: 0,
        pendingAmount: 0,
        paidAmount: 0,
        failedAmount: 0,
      });
    }

    for (const billing of billings) {
      const current = map.get(billing.customer_id);
      if (!current) continue;

      const amount = billing.amount ?? 0;

      current.billingCount += 1;
      current.totalAmount += amount;

      if (billing.status === "pending") current.pendingAmount += amount;
      if (billing.status === "paid") current.paidAmount += amount;
      if (billing.status === "failed") current.failedAmount += amount;
    }

    return map;
  }, [customers, billings]);

  const customerSummaries = useMemo(() => {
    return customers.map((customer) => customerSummaryMap.get(customer.id)!);
  }, [customers, customerSummaryMap]);

  const totals = useMemo(() => {
    let totalSales = 0;
    let totalPending = 0;
    let totalPaid = 0;
    let totalFailed = 0;

    for (const billing of billings) {
      const amount = billing.amount ?? 0;
      totalSales += amount;

      if (billing.status === "pending") totalPending += amount;
      if (billing.status === "paid") totalPaid += amount;
      if (billing.status === "failed") totalFailed += amount;
    }

    const billingCount = billings.length;
    const customerCount = customers.length;
    const recoveryRate = totalSales > 0 ? Math.round((totalPaid / totalSales) * 100) : 0;

    return {
      totalSales,
      totalPending,
      totalPaid,
      totalFailed,
      billingCount,
      customerCount,
      recoveryRate,
    };
  }, [billings, customers]);

  const billingRows = useMemo(() => {
    const customerNameMap = new Map<string, string>();

    for (const customer of customers) {
      customerNameMap.set(
        customer.id,
        customer.company_name || customer.store_name || customer.contact_name || "顧客名なし"
      );
    }

    return billings.map((billing) => ({
      ...billing,
      customerName: customerNameMap.get(billing.customer_id) || "顧客名なし",
    }));
  }, [billings, customers]);

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">代理店詳細</h1>
          <Link
            href="/agencies"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            代理店一覧へ戻る
          </Link>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">代理店詳細</h1>
          <p className="mt-1 text-sm text-gray-600">
            代理店名：<span className="font-medium text-gray-900">{agency?.name ?? "-"}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/agencies"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            代理店一覧へ戻る
          </Link>
          <Link
            href="/billings"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            売上管理へ
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">顧客数</div>
          <div className="mt-2 text-3xl font-bold">{totals.customerCount}件</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">請求件数</div>
          <div className="mt-2 text-3xl font-bold">{totals.billingCount}件</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">売上合計</div>
          <div className="mt-2 text-3xl font-bold">{formatYen(totals.totalSales)}</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">未回収合計</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {formatYen(totals.totalPending)}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">回収率</div>
          <div className="mt-2 text-3xl font-bold text-green-600">{totals.recoveryRate}%</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-bold">対象顧客一覧</h2>
        </div>

        {customerSummaries.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">この代理店に紐づく顧客はまだありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr className="border-b">
                  <th className="px-4 py-3">企業名</th>
                  <th className="px-4 py-3">決済</th>
                  <th className="px-4 py-3">月額</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3">請求件数</th>
                  <th className="px-4 py-3">売上合計</th>
                  <th className="px-4 py-3">未回収</th>
                  <th className="px-4 py-3">詳細</th>
                </tr>
              </thead>
              <tbody>
                {customerSummaries.map((customer) => (
                  <tr key={customer.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      {customer.company_name || customer.store_name || customer.contact_name || "-"}
                    </td>
                    <td className="px-4 py-3">{paymentMethodLabel(customer.payment_method)}</td>
                    <td className="px-4 py-3">
                      {formatYen(customer.monthly_amount ?? 0)}
                    </td>
                    <td className="px-4 py-3">{statusLabel(customer.status)}</td>
                    <td className="px-4 py-3">{customer.billingCount}件</td>
                    <td className="px-4 py-3">{formatYen(customer.totalAmount)}</td>
                    <td className="px-4 py-3 text-red-600">
                      {formatYen(customer.pendingAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        顧客詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-bold">請求一覧</h2>
        </div>

        {billingRows.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">請求データはまだありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr className="border-b">
                  <th className="px-4 py-3">対象月</th>
                  <th className="px-4 py-3">顧客名</th>
                  <th className="px-4 py-3">金額</th>
                  <th className="px-4 py-3">ステータス</th>
                  <th className="px-4 py-3">入金日</th>
                </tr>
              </thead>
              <tbody>
                {billingRows.map((billing) => (
                  <tr key={billing.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{formatBillingMonth(billing.billing_month)}</td>
                    <td className="px-4 py-3">{billing.customerName}</td>
                    <td className="px-4 py-3">{formatYen(billing.amount ?? 0)}</td>
                    <td
                      className={`px-4 py-3 ${
                        billing.status === "pending"
                          ? "text-red-600"
                          : billing.status === "paid"
                          ? "text-green-600"
                          : billing.status === "failed"
                          ? "text-gray-600"
                          : ""
                      }`}
                    >
                      {billingStatusLabel(billing.status)}
                    </td>
                    <td className="px-4 py-3">{billing.paid_date || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}