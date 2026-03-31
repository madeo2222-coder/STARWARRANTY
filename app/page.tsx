"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  name: string;
};

type Customer = {
  id: string;
  name: string;
};

type Contract = {
  id: string;
  agency_id: string | null;
  customer_id: string | null;
  amount: number | null;
  cost: number | null;
  commission: number | null;
};

type Billing = {
  id: string;
  contract_id: string;
  status: "pending" | "paid" | "failed" | string;
  amount: number | null;
  due_date: string | null;
  paid_date: string | null;
};

type AgencyRow = {
  id: string;
  name: string;
  sales: number;
  grossProfit: number;
  unpaid: number;
  totalBillings: number;
  paidBillings: number;
  collectionRate: number;
  warningLevel: "danger" | "warning" | "normal";
  contractCount: number;
};

type MonthlySummary = {
  month: string;
  label: string;
  sales: number;
  totalBillings: number;
  paidBillings: number;
  collectionRate: number;
};

function formatYen(value: number) {
  return `¥${value.toLocaleString()}`;
}

function getMonthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}/${month}`;
}

function getRecentMonthKeys(count: number) {
  const result: string[] = [];
  const now = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}`);
  }

  return result;
}

function getAlertLevel(billings: Billing[]): "danger" | "warning" | "normal" {
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  let hasWarning = false;
  let hasDanger = false;

  for (const billing of billings) {
    if (billing.status !== "pending") continue;
    if (!billing.due_date) continue;

    const due = new Date(billing.due_date);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / msPerDay);

    if (diffDays < 0 || diffDays <= -30) {
      hasDanger = true;
      continue;
    }

    if (diffDays <= 3) {
      hasDanger = true;
      continue;
    }

    if (diffDays <= 14) {
      hasWarning = true;
    }
  }

  if (hasDanger) return "danger";
  if (hasWarning) return "warning";
  return "normal";
}

function alertBadge(level: "danger" | "warning" | "normal") {
  if (level === "danger") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
        危険
      </span>
    );
  }

  if (level === "warning") {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
        要注意
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
      通常
    </span>
  );
}

function rankingBadge(index: number) {
  if (index === 0) {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-bold text-yellow-700">
        1位
      </span>
    );
  }

  if (index === 1) {
    return (
      <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700">
        2位
      </span>
    );
  }

  if (index === 2) {
    return (
      <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
        3位
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
      {index + 1}位
    </span>
  );
}

export default function HomePage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const [agenciesRes, customersRes, contractsRes, billingsRes] =
      await Promise.all([
        supabase.from("agencies").select("id, name").order("name", { ascending: true }),
        supabase.from("customers").select("id, name").order("name", { ascending: true }),
        supabase
          .from("contracts")
          .select("id, agency_id, customer_id, amount, cost, commission"),
        supabase
          .from("billings")
          .select("id, contract_id, status, amount, due_date, paid_date"),
      ]);

    if (agenciesRes.error) {
      console.error("agencies error:", agenciesRes.error);
    }
    if (customersRes.error) {
      console.error("customers error:", customersRes.error);
    }
    if (contractsRes.error) {
      console.error("contracts error:", contractsRes.error);
    }
    if (billingsRes.error) {
      console.error("billings error:", billingsRes.error);
    }

    setAgencies((agenciesRes.data || []) as Agency[]);
    setCustomers((customersRes.data || []) as Customer[]);
    setContracts((contractsRes.data || []) as Contract[]);
    setBillings((billingsRes.data || []) as Billing[]);
    setLoading(false);
  }

  const rows = useMemo<AgencyRow[]>(() => {
    const baseAgencies: Agency[] = [
      ...agencies,
      {
        id: "unassigned",
        name: "未設定",
      },
    ];

    return baseAgencies.map((agency) => {
      const agencyContracts = contracts.filter((contract) => {
        if (agency.id === "unassigned") {
          return !contract.agency_id;
        }
        return contract.agency_id === agency.id;
      });

      const contractIds = agencyContracts.map((contract) => contract.id);

      const agencyBillings = billings.filter((billing) =>
        contractIds.includes(billing.contract_id)
      );

      const sales = agencyContracts.reduce(
        (sum, contract) => sum + (contract.amount || 0),
        0
      );

      const grossProfit = agencyContracts.reduce((sum, contract) => {
        const amount = contract.amount || 0;
        const cost = contract.cost || 0;
        const commission = contract.commission || 0;
        return sum + (amount - cost - commission);
      }, 0);

      const unpaid = agencyBillings
        .filter((billing) => billing.status === "pending")
        .reduce((sum, billing) => sum + (billing.amount || 0), 0);

      const totalBillings = agencyBillings.length;
      const paidBillings = agencyBillings.filter(
        (billing) => billing.status === "paid"
      ).length;

      const collectionRate =
        totalBillings === 0
          ? 0
          : Math.round((paidBillings / totalBillings) * 1000) / 10;

      const warningLevel = getAlertLevel(agencyBillings);

      return {
        id: agency.id,
        name: agency.name,
        sales,
        grossProfit,
        unpaid,
        totalBillings,
        paidBillings,
        collectionRate,
        warningLevel,
        contractCount: agencyContracts.length,
      };
    });
  }, [agencies, contracts, billings]);

  const totalSales = rows.reduce((sum, row) => sum + row.sales, 0);
  const totalGrossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
  const totalUnpaid = rows.reduce((sum, row) => sum + row.unpaid, 0);
  const totalContracts = rows.reduce((sum, row) => sum + row.contractCount, 0);
  const totalBillings = rows.reduce((sum, row) => sum + row.totalBillings, 0);
  const totalPaidBillings = rows.reduce((sum, row) => sum + row.paidBillings, 0);

  const overallCollectionRate =
    totalBillings === 0
      ? 0
      : Math.round((totalPaidBillings / totalBillings) * 1000) / 10;

  const totalCustomers = customers.length;

  const customersWithContracts = useMemo(() => {
    const customerIds = new Set(
      contracts
        .map((contract) => contract.customer_id)
        .filter((customerId): customerId is string => Boolean(customerId))
    );
    return customerIds.size;
  }, [contracts]);

  const totalAgencies = agencies.length;

  const dangerRows = useMemo(() => {
    return [...rows]
      .filter((row) => row.warningLevel === "danger")
      .sort((a, b) => b.unpaid - a.unpaid)
      .slice(0, 5);
  }, [rows]);

  const salesRanking = useMemo(() => {
    return [...rows].sort((a, b) => b.sales - a.sales).slice(0, 5);
  }, [rows]);

  const unpaidRanking = useMemo(() => {
    return [...rows].sort((a, b) => b.unpaid - a.unpaid).slice(0, 5);
  }, [rows]);

  const recentMonthKeys = useMemo(() => {
    return getRecentMonthKeys(6);
  }, []);

  const monthlySummary = useMemo<MonthlySummary[]>(() => {
    return recentMonthKeys.map((monthKey) => {
      const monthlyBillings = billings.filter((billing) => {
        if (!billing.due_date) return false;
        return getMonthKey(billing.due_date) === monthKey;
      });

      const sales = monthlyBillings.reduce(
        (sum, billing) => sum + (billing.amount || 0),
        0
      );

      const monthTotalBillings = monthlyBillings.length;
      const monthPaidBillings = monthlyBillings.filter(
        (billing) => billing.status === "paid"
      ).length;

      const collectionRate =
        monthTotalBillings === 0
          ? 0
          : Math.round((monthPaidBillings / monthTotalBillings) * 1000) / 10;

      return {
        month: monthKey,
        label: getMonthLabel(monthKey),
        sales,
        totalBillings: monthTotalBillings,
        paidBillings: monthPaidBillings,
        collectionRate,
      };
    });
  }, [billings, recentMonthKeys]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
              <p className="mt-1 text-sm text-gray-500">
                集金代行プラットフォーム 全体サマリー
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/customers/new"
                className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white shadow-sm"
              >
                新規顧客
              </Link>
              <Link
                href="/contracts/new"
                className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm"
              >
                新規契約
              </Link>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/customers"
                className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-200"
              >
                顧客一覧へ
              </Link>
              <Link
                href="/contracts"
                className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-200"
              >
                契約一覧へ
              </Link>
              <Link
                href="/agencies"
                className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-200"
              >
                代理店一覧へ
              </Link>
              <Link
                href="/billings"
                className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-200"
              >
                請求一覧へ
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">総売上</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatYen(totalSales)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">総粗利</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatYen(totalGrossProfit)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">未回収額</p>
            <p className="mt-2 text-xl font-bold text-red-600">
              {formatYen(totalUnpaid)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">全体回収率</p>
            <p className="mt-2 text-xl font-bold text-blue-600">
              {overallCollectionRate.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">契約件数</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {totalContracts.toLocaleString()}件
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">顧客数</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {totalCustomers.toLocaleString()}件
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">契約あり顧客数</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {customersWithContracts.toLocaleString()}件
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">代理店数</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {totalAgencies.toLocaleString()}件
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Link
            href="/customers"
            className="rounded-2xl bg-white p-5 shadow-sm transition hover:shadow"
          >
            <p className="text-sm font-semibold text-gray-900">顧客管理</p>
            <p className="mt-1 text-sm text-gray-500">
              顧客の登録・編集・確認
            </p>
          </Link>

          <Link
            href="/contracts"
            className="rounded-2xl bg-white p-5 shadow-sm transition hover:shadow"
          >
            <p className="text-sm font-semibold text-gray-900">契約管理</p>
            <p className="mt-1 text-sm text-gray-500">
              契約一覧・新規契約登録
            </p>
          </Link>

          <Link
            href="/billings"
            className="rounded-2xl bg-white p-5 shadow-sm transition hover:shadow"
          >
            <p className="text-sm font-semibold text-gray-900">請求管理</p>
            <p className="mt-1 text-sm text-gray-500">
              ステータス更新・未回収管理
            </p>
          </Link>

          <Link
            href="/agencies"
            className="rounded-2xl bg-white p-5 shadow-sm transition hover:shadow"
          >
            <p className="text-sm font-semibold text-gray-900">代理店管理</p>
            <p className="mt-1 text-sm text-gray-500">
              代理店分析・回収率確認
            </p>
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">危険案件 TOP5</h2>
              <Link href="/agencies" className="text-xs text-gray-500 underline">
                代理店一覧を見る
              </Link>
            </div>

            {loading ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : dangerRows.length === 0 ? (
              <p className="text-sm text-gray-500">危険案件はありません</p>
            ) : (
              <div className="space-y-3">
                {dangerRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-red-200 bg-red-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{row.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          契約 {row.contractCount}件 / 回収率{" "}
                          {row.collectionRate.toFixed(1)}%
                        </p>
                      </div>
                      {alertBadge(row.warningLevel)}
                    </div>
                    <p className="mt-3 text-sm text-red-600">
                      未回収額：
                      <span className="font-semibold">{formatYen(row.unpaid)}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                月別サマリー（直近6ヶ月）
              </h2>
              <Link href="/agencies" className="text-xs text-gray-500 underline">
                詳細分析へ
              </Link>
            </div>

            <div className="space-y-3">
              {monthlySummary.map((month) => (
                <div key={month.month} className="rounded-2xl bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{month.label}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        請求 {month.totalBillings}件 / 入金済 {month.paidBillings}件
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        {formatYen(month.sales)}
                      </p>
                      <p className="mt-1 text-xs text-blue-600">
                        回収率 {month.collectionRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${Math.min(month.collectionRate, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">売上ランキング TOP5</h2>
              <Link href="/agencies" className="text-xs text-gray-500 underline">
                代理店一覧へ
              </Link>
            </div>

            <div className="space-y-3">
              {salesRanking.map((row, index) => (
                <div
                  key={`sales-${row.id}`}
                  className="flex items-center justify-between rounded-2xl bg-gray-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    {rankingBadge(index)}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-500">
                        粗利 {formatYen(row.grossProfit)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {formatYen(row.sales)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">未回収ランキング TOP5</h2>
              <Link href="/billings" className="text-xs text-gray-500 underline">
                請求一覧へ
              </Link>
            </div>

            <div className="space-y-3">
              {unpaidRanking.map((row, index) => (
                <div
                  key={`unpaid-${row.id}`}
                  className="flex items-center justify-between rounded-2xl bg-red-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    {rankingBadge(index)}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-500">
                        回収率 {row.collectionRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-red-600">
                    {formatYen(row.unpaid)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">代理店サマリー</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">代理店名</th>
                  <th className="px-4 py-3 font-medium">総売上</th>
                  <th className="px-4 py-3 font-medium">総粗利</th>
                  <th className="px-4 py-3 font-medium">未回収額</th>
                  <th className="px-4 py-3 font-medium">回収率</th>
                  <th className="px-4 py-3 font-medium">詳細</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      読み込み中...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      データがありません
                    </td>
                  </tr>
                ) : (
                  [...rows]
                    .sort((a, b) => b.sales - a.sales)
                    .slice(0, 10)
                    .map((row) => (
                      <tr key={row.id} className="border-b border-gray-50">
                        <td className="px-4 py-4">{alertBadge(row.warningLevel)}</td>
                        <td className="px-4 py-4 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-4 text-gray-700">{formatYen(row.sales)}</td>
                        <td className="px-4 py-4 text-gray-700">
                          {formatYen(row.grossProfit)}
                        </td>
                        <td className="px-4 py-4 text-red-600">
                          {formatYen(row.unpaid)}
                        </td>
                        <td className="px-4 py-4 font-medium text-blue-600">
                          {row.collectionRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-4">
                          {row.id === "unassigned" ? (
                            <span className="text-xs text-gray-400">未設定は詳細なし</span>
                          ) : (
                            <Link
                              href={`/agencies/${row.id}`}
                              className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700"
                            >
                              詳細を見る
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}