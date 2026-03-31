"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRelation =
  | {
      id: string;
      agency_id: string | null;
      company_name: string | null;
    }
  | {
      id: string;
      agency_id: string | null;
      company_name: string | null;
    }[]
  | null;

type Billing = {
  id: string;
  customer_id: string | null;
  billing_month: string | null;
  amount: number | null;
  status: string | null;
  customers: CustomerRelation;
};

type Agency = {
  id: string;
  name: string | null;
};

type AgencyMonthly = {
  agency_id: string;
  month: string;
  total: number;
  paid: number;
  unpaid: number;
  rate: number;
};

function formatMoney(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function getSingleCustomer(customers: CustomerRelation) {
  if (!customers) return null;
  if (Array.isArray(customers)) {
    return customers[0] ?? null;
  }
  return customers;
}

function getRateTextClass(rate: number) {
  if (rate <= 50) return "text-red-600";
  if (rate <= 80) return "text-yellow-600";
  return "text-blue-600";
}

function getRateBadgeClass(rate: number) {
  if (rate <= 50) {
    return "bg-red-100 text-red-700";
  }
  if (rate <= 80) {
    return "bg-yellow-100 text-yellow-700";
  }
  return "bg-blue-100 text-blue-700";
}
function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(result: AgencyMonthly[], agencyNameMap: Map<string, string>) {
  if (result.length === 0) {
    alert("出力対象データがありません");
    return;
  }

  const headers = [
    "代理店名",
    "月",
    "売上",
    "入金",
    "未回収",
    "回収率",
  ];

  const rows = result.map((r) => [
    agencyNameMap.get(r.agency_id) || r.agency_id,
    r.month,
    r.total,
    r.paid,
    r.unpaid,
    `${r.rate}%`,
  ]);

  const csvContent = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  link.href = url;
  link.download = `agency_monthly_${yyyymmdd}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AgencyMonthlyPage() {
  const [billings, setBillings] = useState<Billing[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    void fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setErrorMsg("");

    const [billingsRes, agenciesRes] = await Promise.all([
      supabase
        .from("billings")
        .select(`
          id,
          customer_id,
          billing_month,
          amount,
          status,
          customers (
            id,
            agency_id,
            company_name
          )
        `)
        .order("billing_month", { ascending: false }),
      supabase.from("agencies").select("id, name"),
    ]);

    if (billingsRes.error) {
      console.error("agency-monthly billings fetch error:", billingsRes.error);
      setErrorMsg("請求データ取得に失敗しました");
      setLoading(false);
      return;
    }

    if (agenciesRes.error) {
      console.error("agency-monthly agencies fetch error:", agenciesRes.error);
      setErrorMsg("代理店データ取得に失敗しました");
      setLoading(false);
      return;
    }

    setBillings((billingsRes.data ?? []) as unknown as Billing[]);
    setAgencies((agenciesRes.data ?? []) as Agency[]);
    setLoading(false);
  }

  const agencyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const agency of agencies) {
      if (!agency.id) continue;
      map.set(agency.id, agency.name || agency.id);
    }
    return map;
  }, [agencies]);

  const result = useMemo<AgencyMonthly[]>(() => {
    const map = new Map<string, AgencyMonthly>();

    for (const b of billings) {
      const customer = getSingleCustomer(b.customers);
      const agencyId = customer?.agency_id ?? null;
      const month = b.billing_month ?? null;

      if (!agencyId || !month) continue;

      const key = `${agencyId}_${month}`;

      if (!map.has(key)) {
        map.set(key, {
          agency_id: agencyId,
          month,
          total: 0,
          paid: 0,
          unpaid: 0,
          rate: 0,
        });
      }

      const row = map.get(key)!;
      const amount = b.amount || 0;

      row.total += amount;

      if (b.status === "paid") {
        row.paid += amount;
      } else if (b.status === "pending") {
        row.unpaid += amount;
      }
    }

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        rate:
          row.total === 0
            ? 0
            : Math.round((row.paid / row.total) * 1000) / 10,
      }))
      .sort((a, b) => {
        if (a.month !== b.month) {
          return a.month < b.month ? 1 : -1;
        }
        return b.total - a.total;
      });
  }, [billings]);

  const summary = useMemo(() => {
    const totalSales = result.reduce((sum, row) => sum + row.total, 0);
    const totalPaid = result.reduce((sum, row) => sum + row.paid, 0);
    const totalUnpaid = result.reduce((sum, row) => sum + row.unpaid, 0);
    const totalRate =
      totalSales === 0 ? 0 : Math.round((totalPaid / totalSales) * 1000) / 10;

    const latestMonth = result.length > 0 ? result[0].month : "-";

    return {
      latestMonth,
      totalSales,
      totalPaid,
      totalUnpaid,
      totalRate,
      count: result.length,
    };
  }, [result]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">代理店別 月次ダッシュボード</h1>
        <p className="text-sm text-gray-500">
          {summary.latestMonth} 時点 / 集計件数: {summary.count.toLocaleString()}件
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">総売上</div>
          <div className="mt-2 text-2xl font-bold">
            {formatMoney(summary.totalSales)}
          </div>
        </div>
<div className="flex justify-end">
  <button
    onClick={() => downloadCsv(result, agencyNameMap)}
    className="rounded-xl bg-black px-4 py-2 text-sm text-white"
  >
    CSV出力
  </button>
</div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">総入金</div>
          <div className="mt-2 text-2xl font-bold text-blue-600">
            {formatMoney(summary.totalPaid)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未回収</div>
          <div className="mt-2 text-2xl font-bold text-red-600">
            {formatMoney(summary.totalUnpaid)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">全体回収率</div>
          <div className={`mt-2 text-2xl font-bold ${getRateTextClass(summary.totalRate)}`}>
            {summary.totalRate}%
          </div>
        </div>
      </div>

      {!loading && result.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">営業トーク用サマリー</div>
          <div className="mt-2 text-base font-medium text-gray-900">
            {summary.latestMonth} の総売上は {formatMoney(summary.totalSales)}、総入金は{" "}
            {formatMoney(summary.totalPaid)}、未回収は {formatMoney(summary.totalUnpaid)}、
            全体回収率は {summary.totalRate}% です。
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          読み込み中...
        </div>
      ) : result.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          表示できるデータがありません
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-4 py-3 text-left">代理店</th>
                <th className="border px-4 py-3 text-left">月</th>
                <th className="border px-4 py-3 text-right">売上</th>
                <th className="border px-4 py-3 text-right">入金</th>
                <th className="border px-4 py-3 text-right">未回収</th>
                <th className="border px-4 py-3 text-right">回収率</th>
                <th className="border px-4 py-3 text-center">判定</th>
              </tr>
            </thead>

            <tbody>
              {result.map((r, i) => (
                <tr key={`${r.agency_id}_${r.month}_${i}`} className="border-t">
                  <td className="border px-4 py-3">
                    {agencyNameMap.get(r.agency_id) || r.agency_id}
                  </td>
                  <td className="border px-4 py-3">{r.month}</td>
                  <td className="border px-4 py-3 text-right">
                    {formatMoney(r.total)}
                  </td>
                  <td className="border px-4 py-3 text-right text-blue-600">
                    {formatMoney(r.paid)}
                  </td>
                  <td className="border px-4 py-3 text-right text-red-600">
                    {formatMoney(r.unpaid)}
                  </td>
                  <td className={`border px-4 py-3 text-right font-semibold ${getRateTextClass(r.rate)}`}>
                    {r.rate}%
                  </td>
                  <td className="border px-4 py-3 text-center">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${getRateBadgeClass(r.rate)}`}>
                      {r.rate <= 50 ? "要注意" : r.rate <= 80 ? "注意" : "良好"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}