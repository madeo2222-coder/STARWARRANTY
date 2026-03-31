"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  name: string;
};

type Contract = {
  id: string;
  agency_id: string | null;
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

type SortKey =
  | "name"
  | "sales"
  | "grossProfit"
  | "unpaid"
  | "collectionRate";

type FilterKey = "all" | "warningOrDanger" | "dangerOnly";

type MonthlySummary = {
  month: string;
  label: string;
  sales: number;
  totalBillings: number;
  paidBillings: number;
  collectionRate: number;
};

type AgencyMonthlyRow = {
  agencyId: string;
  agencyName: string;
  months: {
    month: string;
    sales: number;
    collectionRate: number;
  }[];
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

function compareAlertPriority(
  a: "danger" | "warning" | "normal",
  b: "danger" | "warning" | "normal"
) {
  const priority = {
    danger: 0,
    warning: 1,
    normal: 2,
  };

  return priority[a] - priority[b];
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

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const [agenciesRes, contractsRes, billingsRes] = await Promise.all([
      supabase.from("agencies").select("id, name").order("name", { ascending: true }),
      supabase.from("contracts").select("id, agency_id, amount, cost, commission"),
      supabase
        .from("billings")
        .select("id, contract_id, status, amount, due_date, paid_date"),
    ]);

    if (agenciesRes.error) {
      console.error("agencies error:", agenciesRes.error);
    }
    if (contractsRes.error) {
      console.error("contracts error:", contractsRes.error);
    }
    if (billingsRes.error) {
      console.error("billings error:", billingsRes.error);
    }

    setAgencies(agenciesRes.data || []);
    setContracts(contractsRes.data || []);
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
        totalBillings === 0 ? 0 : Math.round((paidBillings / totalBillings) * 1000) / 10;

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

  const filteredRows = useMemo(() => {
    let result = rows.filter((row) =>
      row.name.toLowerCase().includes(search.trim().toLowerCase())
    );

    if (filterKey === "warningOrDanger") {
      result = result.filter(
        (row) => row.warningLevel === "warning" || row.warningLevel === "danger"
      );
    }

    if (filterKey === "dangerOnly") {
      result = result.filter((row) => row.warningLevel === "danger");
    }

    result.sort((a, b) => {
      const alertCompare = compareAlertPriority(a.warningLevel, b.warningLevel);
      if (alertCompare !== 0) return alertCompare;

      switch (sortKey) {
        case "sales":
          return b.sales - a.sales;
        case "grossProfit":
          return b.grossProfit - a.grossProfit;
        case "unpaid":
          return b.unpaid - a.unpaid;
        case "collectionRate":
          return b.collectionRate - a.collectionRate;
        case "name":
        default:
          return a.name.localeCompare(b.name, "ja");
      }
    });

    return result;
  }, [rows, search, sortKey, filterKey]);

  const topDangerRows = useMemo(() => {
    return rows
      .filter((row) => row.warningLevel === "danger")
      .sort((a, b) => b.unpaid - a.unpaid)
      .slice(0, 3);
  }, [rows]);

  const salesRanking = useMemo(() => {
    return [...rows].sort((a, b) => b.sales - a.sales).slice(0, 5);
  }, [rows]);

  const grossProfitRanking = useMemo(() => {
    return [...rows].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 5);
  }, [rows]);

  const unpaidRanking = useMemo(() => {
    return [...rows].sort((a, b) => b.unpaid - a.unpaid).slice(0, 5);
  }, [rows]);

  const monthKeys = useMemo(() => {
    return getRecentMonthKeys(6);
  }, []);

  const monthlySummary = useMemo<MonthlySummary[]>(() => {
    return monthKeys.map((monthKey) => {
      const monthlyBillings = billings.filter((billing) => {
        if (!billing.due_date) return false;
        return getMonthKey(billing.due_date) === monthKey;
      });

      const totalBillings = monthlyBillings.length;
      const paidBillings = monthlyBillings.filter(
        (billing) => billing.status === "paid"
      ).length;
      const sales = monthlyBillings.reduce(
        (sum, billing) => sum + (billing.amount || 0),
        0
      );

      const collectionRate =
        totalBillings === 0 ? 0 : Math.round((paidBillings / totalBillings) * 1000) / 10;

      return {
        month: monthKey,
        label: getMonthLabel(monthKey),
        sales,
        totalBillings,
        paidBillings,
        collectionRate,
      };
    });
  }, [billings, monthKeys]);

  const agencyMonthlyTrend = useMemo<AgencyMonthlyRow[]>(() => {
    const topAgencyBase = [...rows]
      .filter((row) => row.id !== "unassigned")
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    return topAgencyBase.map((agency) => {
      const agencyContracts = contracts.filter(
        (contract) => contract.agency_id === agency.id
      );
      const contractIds = agencyContracts.map((contract) => contract.id);

      const months = monthKeys.map((monthKey) => {
        const monthlyBillings = billings.filter((billing) => {
          if (!contractIds.includes(billing.contract_id)) return false;
          if (!billing.due_date) return false;
          return getMonthKey(billing.due_date) === monthKey;
        });

        const sales = monthlyBillings.reduce(
          (sum, billing) => sum + (billing.amount || 0),
          0
        );

        const totalBillings = monthlyBillings.length;
        const paidBillings = monthlyBillings.filter(
          (billing) => billing.status === "paid"
        ).length;

        const collectionRate =
          totalBillings === 0 ? 0 : Math.round((paidBillings / totalBillings) * 1000) / 10;

        return {
          month: monthKey,
          sales,
          collectionRate,
        };
      });

      return {
        agencyId: agency.id,
        agencyName: agency.name,
        months,
      };
    });
  }, [rows, contracts, billings, monthKeys]);

  function exportCsv() {
    const headers = [
      "代理店名",
      "契約件数",
      "総売上",
      "総粗利",
      "未回収額",
      "請求件数",
      "入金済件数",
      "回収率(%)",
      "状態",
    ];

    const csvRows = filteredRows.map((row) => [
      row.name,
      row.contractCount,
      row.sales,
      row.grossProfit,
      row.unpaid,
      row.totalBillings,
      row.paidBillings,
      row.collectionRate,
      row.warningLevel === "danger"
        ? "危険"
        : row.warningLevel === "warning"
        ? "要注意"
        : "通常",
    ]);

    const csvContent = [headers, ...csvRows]
      .map((line) => line.map((cell) => `"${String(cell)}"`).join(","))
      .join("\n");

    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "agencies_kpi.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  const totalSales = filteredRows.reduce((sum, row) => sum + row.sales, 0);
  const totalGrossProfit = filteredRows.reduce((sum, row) => sum + row.grossProfit, 0);
  const totalUnpaid = filteredRows.reduce((sum, row) => sum + row.unpaid, 0);

  const totalBillings = filteredRows.reduce((sum, row) => sum + row.totalBillings, 0);
  const totalPaidBillings = filteredRows.reduce((sum, row) => sum + row.paidBillings, 0);
  const overallCollectionRate =
    totalBillings === 0 ? 0 : Math.round((totalPaidBillings / totalBillings) * 1000) / 10;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">代理店一覧</h1>
            <p className="mt-1 text-sm text-gray-500">
              売上・粗利・未回収・回収率を一覧で確認
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportCsv}
              className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              CSV出力
            </button>
            <Link
              href="/agencies/new"
              className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-200"
            >
              新規代理店登録
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">総売上</p>
            <p className="mt-2 text-xl font-bold text-gray-900">{formatYen(totalSales)}</p>
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
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">売上ランキング TOP5</h2>
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
                      <p className="text-xs text-gray-500">契約 {row.contractCount}件</p>
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
              <h2 className="text-sm font-semibold text-gray-900">粗利ランキング TOP5</h2>
            </div>

            <div className="space-y-3">
              {grossProfitRanking.map((row, index) => (
                <div
                  key={`profit-${row.id}`}
                  className="flex items-center justify-between rounded-2xl bg-gray-50 p-3"
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
                  <p className="text-sm font-bold text-gray-900">
                    {formatYen(row.grossProfit)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">未回収ランキング TOP5</h2>
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
                        {row.warningLevel === "danger"
                          ? "危険"
                          : row.warningLevel === "warning"
                          ? "要注意"
                          : "通常"}
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

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">月別売上（直近6ヶ月）</h2>
            </div>

            <div className="space-y-3">
              {monthlySummary.map((month) => (
                <div
                  key={month.month}
                  className="flex items-center justify-between rounded-2xl bg-gray-50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{month.label}</p>
                    <p className="text-xs text-gray-500">
                      請求 {month.totalBillings}件 / 入金済 {month.paidBillings}件
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {formatYen(month.sales)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">月別回収率（直近6ヶ月）</h2>
            </div>

            <div className="space-y-3">
              {monthlySummary.map((month) => (
                <div
                  key={`rate-${month.month}`}
                  className="rounded-2xl bg-gray-50 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{month.label}</p>
                    <p className="text-sm font-bold text-blue-600">
                      {month.collectionRate.toFixed(1)}%
                    </p>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${Math.min(month.collectionRate, 100)}%` }}
                    />
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    請求 {month.totalBillings}件 / 入金済 {month.paidBillings}件
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              代理店別月次推移（売上 / 回収率）
            </h2>
            <p className="text-xs text-gray-500">売上上位5代理店を表示</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">代理店名</th>
                  {monthKeys.map((monthKey) => (
                    <th key={monthKey} className="px-4 py-3 font-medium">
                      {getMonthLabel(monthKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agencyMonthlyTrend.map((agency) => (
                  <tr key={agency.agencyId} className="border-b border-gray-50">
                    <td className="px-4 py-4 font-medium text-gray-900">
                      {agency.agencyName}
                    </td>
                    {agency.months.map((month) => (
                      <td key={month.month} className="px-4 py-4 align-top">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-sm font-semibold text-gray-900">
                            {formatYen(month.sales)}
                          </p>
                          <p className="mt-1 text-xs text-blue-600">
                            回収率 {month.collectionRate.toFixed(1)}%
                          </p>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">危険案件 TOP3</h2>
          </div>

          {topDangerRows.length === 0 ? (
            <p className="text-sm text-gray-500">危険案件はありません</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {topDangerRows.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-red-200 bg-red-50 p-4"
                >
                  <p className="text-xs font-semibold text-red-700">#{index + 1}</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{row.name}</p>
                  <p className="mt-2 text-sm text-gray-600">
                    未回収額：<span className="font-semibold">{formatYen(row.unpaid)}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    回収率：<span className="font-semibold">{row.collectionRate.toFixed(1)}%</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                検索
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="代理店名で検索"
                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                並び替え
              </label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              >
                <option value="sales">売上順</option>
                <option value="grossProfit">粗利順</option>
                <option value="unpaid">未回収順</option>
                <option value="collectionRate">回収率順</option>
                <option value="name">名前順</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                フィルター
              </label>
              <select
                value={filterKey}
                onChange={(e) => setFilterKey(e.target.value as FilterKey)}
                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              >
                <option value="all">通常</option>
                <option value="warningOrDanger">要注意以上</option>
                <option value="dangerOnly">危険のみ</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">代理店名</th>
                  <th className="px-4 py-3 font-medium">契約件数</th>
                  <th className="px-4 py-3 font-medium">総売上</th>
                  <th className="px-4 py-3 font-medium">総粗利</th>
                  <th className="px-4 py-3 font-medium">未回収額</th>
                  <th className="px-4 py-3 font-medium">回収率</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      読み込み中...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      データがありません
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="px-4 py-4">{alertBadge(row.warningLevel)}</td>
                      <td className="px-4 py-4 font-medium text-gray-900">{row.name}</td>
                      <td className="px-4 py-4 text-gray-700">{row.contractCount}件</td>
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
                          <span className="text-xs text-gray-400">未設定は編集不可</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/agencies/${row.id}`}
                              className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700"
                            >
                              詳細を見る
                            </Link>
                            <Link
                              href={`/agencies/${row.id}/edit`}
                              className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white"
                            >
                              編集する
                            </Link>
                          </div>
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