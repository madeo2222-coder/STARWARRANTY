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
  name: string;
};

type Contract = {
  id: string;
  agency_id: string | null;
  customer_id: string | null;
  contract_name: string | null;
  amount: number | null;
  cost: number | null;
  commission: number | null;
  contract_date: string | null;
};

type Billing = {
  id: string;
  contract_id: string;
  status: "pending" | "paid" | "failed" | string;
  amount: number | null;
  due_date: string | null;
  paid_date: string | null;
};

type ContractRow = {
  id: string;
  customerName: string;
  contractName: string;
  amount: number;
  cost: number;
  commission: number;
  grossProfit: number;
  contractDate: string | null;
};

type BillingRow = {
  id: string;
  contractId: string;
  customerName: string;
  contractName: string;
  status: "pending" | "paid" | "failed" | string;
  amount: number;
  dueDate: string | null;
  paidDate: string | null;
  alertLevel: "danger" | "warning" | "normal";
  overdueDays: number | null;
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

function formatDate(value: string | null) {
  return value || "-";
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

function getAlertInfo(
  status: string,
  dueDate: string | null
): { level: "danger" | "warning" | "normal"; overdueDays: number | null } {
  if (status !== "pending" || !dueDate) {
    return { level: "normal", overdueDays: null };
  }

  const today = new Date();
  const due = new Date(dueDate);

  const todayDateOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const dueDateOnly = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate()
  );

  const diffMs = dueDateOnly.getTime() - todayDateOnly.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      level: "danger",
      overdueDays: Math.abs(diffDays),
    };
  }

  if (diffDays <= 3) {
    return {
      level: "danger",
      overdueDays: 0,
    };
  }

  if (diffDays <= 14) {
    return {
      level: "warning",
      overdueDays: null,
    };
  }

  return {
    level: "normal",
    overdueDays: null,
  };
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

function statusBadge(status: string) {
  if (status === "paid") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
        入金済み
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700">
        回収不能
      </span>
    );
  }

  return (
    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
      未回収
    </span>
  );
}

export default function AgencyDetailPage() {
  const params = useParams();
  const agencyId = String(params?.id || "");

  const [agency, setAgency] = useState<Agency | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) return;
    fetchData();
  }, [agencyId]);

  async function fetchData() {
    setLoading(true);

    const [agencyRes, customersRes, contractsRes, billingsRes] =
      await Promise.all([
        supabase.from("agencies").select("id, name").eq("id", agencyId).single(),
        supabase.from("customers").select("id, name"),
        supabase
          .from("contracts")
          .select(
            "id, agency_id, customer_id, contract_name, amount, cost, commission, contract_date"
          )
          .eq("agency_id", agencyId),
        supabase
          .from("billings")
          .select("id, contract_id, status, amount, due_date, paid_date"),
      ]);

    if (agencyRes.error) console.error("agency error:", agencyRes.error);
    if (customersRes.error) console.error("customers error:", customersRes.error);
    if (contractsRes.error) console.error("contracts error:", contractsRes.error);
    if (billingsRes.error) console.error("billings error:", billingsRes.error);

    const fetchedContracts = (contractsRes.data || []) as Contract[];
    const contractIds = fetchedContracts.map((item) => item.id);
    const filteredBillings = ((billingsRes.data || []) as Billing[]).filter((item) =>
      contractIds.includes(item.contract_id)
    );

    setAgency((agencyRes.data as Agency) || null);
    setCustomers((customersRes.data || []) as Customer[]);
    setContracts(fetchedContracts);
    setBillings(filteredBillings);
    setLoading(false);
  }

  const customerMap = useMemo(() => {
    return new Map(customers.map((item) => [item.id, item.name]));
  }, [customers]);

  const contractRows = useMemo<ContractRow[]>(() => {
    return contracts
      .map((contract) => {
        const amount = contract.amount || 0;
        const cost = contract.cost || 0;
        const commission = contract.commission || 0;

        return {
          id: contract.id,
          customerName: contract.customer_id
            ? customerMap.get(contract.customer_id) || "顧客未設定"
            : "顧客未設定",
          contractName: contract.contract_name || "契約名未設定",
          amount,
          cost,
          commission,
          grossProfit: amount - cost - commission,
          contractDate: contract.contract_date,
        };
      })
      .sort((a, b) => {
        if (!a.contractDate && !b.contractDate) return 0;
        if (!a.contractDate) return 1;
        if (!b.contractDate) return -1;
        return b.contractDate.localeCompare(a.contractDate);
      });
  }, [contracts, customerMap]);

  const billingRows = useMemo<BillingRow[]>(() => {
    const contractMap = new Map(contracts.map((item) => [item.id, item]));

    return billings
      .map((billing) => {
        const contract = contractMap.get(billing.contract_id);
        const customerName = contract?.customer_id
          ? customerMap.get(contract.customer_id) || "顧客未設定"
          : "顧客未設定";

        const alertInfo = getAlertInfo(billing.status, billing.due_date);

        return {
          id: billing.id,
          contractId: billing.contract_id,
          customerName,
          contractName: contract?.contract_name || "契約名未設定",
          status: billing.status,
          amount: billing.amount || 0,
          dueDate: billing.due_date,
          paidDate: billing.paid_date,
          alertLevel: alertInfo.level,
          overdueDays: alertInfo.overdueDays,
        };
      })
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [billings, contracts, customerMap]);

  const totalSales = contractRows.reduce((sum, row) => sum + row.amount, 0);
  const totalGrossProfit = contractRows.reduce(
    (sum, row) => sum + row.grossProfit,
    0
  );
  const totalUnpaid = billingRows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.amount, 0);
  const totalBillings = billingRows.length;
  const paidBillings = billingRows.filter((row) => row.status === "paid").length;
  const collectionRate =
    totalBillings === 0 ? 0 : Math.round((paidBillings / totalBillings) * 1000) / 10;

  const dangerRows = useMemo(() => {
    return billingRows
      .filter((row) => row.alertLevel === "danger")
      .sort((a, b) => b.amount - a.amount);
  }, [billingRows]);

  const recentUnpaidRows = useMemo(() => {
    return billingRows
      .filter((row) => row.status === "pending")
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 10);
  }, [billingRows]);

  const monthKeys = useMemo(() => getRecentMonthKeys(6), []);

  const monthlySummary = useMemo<MonthlySummary[]>(() => {
    return monthKeys.map((monthKey) => {
      const monthlyBillings = billingRows.filter((row) => {
        if (!row.dueDate) return false;
        return getMonthKey(row.dueDate) === monthKey;
      });

      const sales = monthlyBillings.reduce((sum, row) => sum + row.amount, 0);
      const monthTotalBillings = monthlyBillings.length;
      const monthPaidBillings = monthlyBillings.filter(
        (row) => row.status === "paid"
      ).length;
      const monthCollectionRate =
        monthTotalBillings === 0
          ? 0
          : Math.round((monthPaidBillings / monthTotalBillings) * 1000) / 10;

      return {
        month: monthKey,
        label: getMonthLabel(monthKey),
        sales,
        totalBillings: monthTotalBillings,
        paidBillings: monthPaidBillings,
        collectionRate: monthCollectionRate,
      };
    });
  }, [billingRows, monthKeys]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            読み込み中...
          </div>
        </div>
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <Link
            href="/agencies"
            className="inline-flex rounded-2xl bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-200"
          >
            代理店一覧へ戻る
          </Link>
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            代理店情報が見つかりません
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2">
              <Link
                href="/agencies"
                className="inline-flex rounded-2xl bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200"
              >
                ← 代理店一覧へ戻る
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{agency.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              代理店別の売上・粗利・未回収・月次推移を確認
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/billings"
              className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-200"
            >
              請求一覧へ
            </Link>
            <Link
              href="/"
              className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              ダッシュボードへ
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            <p className="text-sm text-gray-500">回収率</p>
            <p className="mt-2 text-xl font-bold text-blue-600">
              {collectionRate.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">契約件数</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {contractRows.length.toLocaleString()}件
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">危険案件一覧</h2>
              <p className="text-xs text-gray-500">{dangerRows.length}件</p>
            </div>

            {dangerRows.length === 0 ? (
              <p className="text-sm text-gray-500">危険案件はありません</p>
            ) : (
              <div className="space-y-3">
                {dangerRows.slice(0, 10).map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-red-200 bg-red-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {row.customerName}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {row.contractName}
                        </p>
                      </div>
                      {alertBadge(row.alertLevel)}
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-3">
                      <p>金額：{formatYen(row.amount)}</p>
                      <p>期限：{formatDate(row.dueDate)}</p>
                      <p>
                        {row.overdueDays === 0
                          ? "期限3日以内"
                          : row.overdueDays
                          ? `${row.overdueDays}日超過`
                          : "要確認"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">直近未回収一覧</h2>
              <p className="text-xs text-gray-500">期限が近い順</p>
            </div>

            {recentUnpaidRows.length === 0 ? (
              <p className="text-sm text-gray-500">未回収はありません</p>
            ) : (
              <div className="space-y-3">
                {recentUnpaidRows.map((row) => (
                  <div key={row.id} className="rounded-2xl bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {row.customerName}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {row.contractName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(row.status)}
                        {alertBadge(row.alertLevel)}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-3">
                      <p>金額：{formatYen(row.amount)}</p>
                      <p>期限：{formatDate(row.dueDate)}</p>
                      <p>入金日：{formatDate(row.paidDate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                月別売上（直近6ヶ月）
              </h2>
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
              <h2 className="text-sm font-semibold text-gray-900">
                月別回収率（直近6ヶ月）
              </h2>
            </div>

            <div className="space-y-3">
              {monthlySummary.map((month) => (
                <div key={month.month} className="rounded-2xl bg-gray-50 p-3">
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

        <div className="rounded-2xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">契約一覧</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">顧客名</th>
                  <th className="px-4 py-3 font-medium">契約名</th>
                  <th className="px-4 py-3 font-medium">売上</th>
                  <th className="px-4 py-3 font-medium">原価</th>
                  <th className="px-4 py-3 font-medium">手数料</th>
                  <th className="px-4 py-3 font-medium">粗利</th>
                  <th className="px-4 py-3 font-medium">契約日</th>
                </tr>
              </thead>
              <tbody>
                {contractRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      契約がありません
                    </td>
                  </tr>
                ) : (
                  contractRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="px-4 py-4 font-medium text-gray-900">
                        {row.customerName}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{row.contractName}</td>
                      <td className="px-4 py-4 text-gray-700">{formatYen(row.amount)}</td>
                      <td className="px-4 py-4 text-gray-700">{formatYen(row.cost)}</td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatYen(row.commission)}
                      </td>
                      <td className="px-4 py-4 font-medium text-gray-900">
                        {formatYen(row.grossProfit)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatDate(row.contractDate)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">請求一覧</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">警告</th>
                  <th className="px-4 py-3 font-medium">ステータス</th>
                  <th className="px-4 py-3 font-medium">顧客名</th>
                  <th className="px-4 py-3 font-medium">契約名</th>
                  <th className="px-4 py-3 font-medium">金額</th>
                  <th className="px-4 py-3 font-medium">回収予定日</th>
                  <th className="px-4 py-3 font-medium">入金日</th>
                </tr>
              </thead>
              <tbody>
                {billingRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      請求がありません
                    </td>
                  </tr>
                ) : (
                  billingRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {alertBadge(row.alertLevel)}
                          {row.status === "pending" && row.overdueDays !== null && (
                            <p className="text-xs text-red-600">
                              {row.overdueDays === 0
                                ? "期限3日以内"
                                : `${row.overdueDays}日超過`}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">{statusBadge(row.status)}</td>
                      <td className="px-4 py-4 font-medium text-gray-900">
                        {row.customerName}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{row.contractName}</td>
                      <td className="px-4 py-4 text-gray-700">{formatYen(row.amount)}</td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatDate(row.dueDate)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatDate(row.paidDate)}
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