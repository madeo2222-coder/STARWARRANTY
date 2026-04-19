"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AppRole = "headquarters" | "agency" | "sub_agency";

type Profile = {
  role: AppRole;
  agency_id: string | null;
};

type Agency = {
  id: string;
  agency_name?: string | null;
  name?: string | null;
  parent_agency_id?: string | null;
};

type Customer = {
  id: string;
  name: string | null;
  agency_id: string | null;
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
  billing_month: string | null;
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

function resolveBillingMonthKey(billing: Billing) {
  if (billing.billing_month && billing.billing_month.length >= 7) {
    return billing.billing_month.slice(0, 7);
  }

  if (billing.due_date && billing.due_date.length >= 7) {
    return billing.due_date.slice(0, 7);
  }

  return null;
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
      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
        危険
      </span>
    );
  }

  if (level === "warning") {
    return (
      <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700">
        要注意
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
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

function kpiTone(type: "default" | "danger" | "primary" | "success") {
  if (type === "danger") {
    return "border-red-100 bg-red-50";
  }
  if (type === "primary") {
    return "border-blue-100 bg-blue-50";
  }
  if (type === "success") {
    return "border-green-100 bg-green-50";
  }
  return "border-gray-200 bg-white";
}

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);

  useEffect(() => {
    void fetchData();
  }, []);

  async function handleLogout() {
    setLogoutLoading(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(`ログアウト失敗: ${error.message}`);
      setLogoutLoading(false);
      return;
    }

    router.push("/login");
    router.refresh();
  }

  async function fetchData() {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/login");
      router.refresh();
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role, agency_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profileData) {
      router.push("/login");
      router.refresh();
      return;
    }

    const currentProfile: Profile = {
      role: profileData.role as AppRole,
      agency_id: profileData.agency_id,
    };

    setProfile(currentProfile);

    const { data: allAgencies, error: agenciesError } = await supabase
      .from("agencies")
      .select("id, agency_name, name, parent_agency_id")
      .order("created_at", { ascending: true });

    if (agenciesError) {
      console.error("agencies error:", agenciesError);
      setLoading(false);
      return;
    }

    const agenciesList = (allAgencies || []) as Agency[];
    setAgencies(agenciesList);

    let visibleAgencyIds: string[] = [];

    if (currentProfile.role === "headquarters") {
      visibleAgencyIds = agenciesList.map((agency) => agency.id);
    } else if (currentProfile.role === "agency") {
      const myAgencyId = currentProfile.agency_id;
      const childAgencyIds = agenciesList
        .filter((agency) => agency.parent_agency_id === myAgencyId)
        .map((agency) => agency.id);

      visibleAgencyIds = myAgencyId ? [myAgencyId, ...childAgencyIds] : [];
    } else {
      visibleAgencyIds = currentProfile.agency_id ? [currentProfile.agency_id] : [];
    }

    const [customersRes, contractsRes] = await Promise.all([
      visibleAgencyIds.length > 0
        ? supabase
            .from("customers")
            .select("id, name, agency_id")
            .in("agency_id", visibleAgencyIds)
        : Promise.resolve({ data: [], error: null }),
      visibleAgencyIds.length > 0
        ? supabase
            .from("contracts")
            .select("id, agency_id, customer_id, amount, cost, commission")
            .in("agency_id", visibleAgencyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (customersRes.error) {
      console.error("customers error:", customersRes.error);
    }

    if (contractsRes.error) {
      console.error("contracts error:", contractsRes.error);
    }

    const contractsList = (contractsRes.data || []) as Contract[];
    const contractIds = contractsList.map((contract) => contract.id);

    const billingsRes =
      contractIds.length > 0
        ? await supabase
            .from("billings")
            .select("id, contract_id, status, amount, billing_month, due_date, paid_date")
            .in("contract_id", contractIds)
        : { data: [], error: null };

    if (billingsRes.error) {
      console.error("billings error:", billingsRes.error);
    }

    setCustomers((customersRes.data || []) as Customer[]);
    setContracts(contractsList);
    setBillings((billingsRes.data || []) as Billing[]);
    setLoading(false);
  }

  const visibleAgencies = useMemo(() => {
    if (!profile) return [];

    if (profile.role === "headquarters") {
      return agencies;
    }

    if (profile.role === "agency") {
      return agencies.filter(
        (agency) =>
          agency.id === profile.agency_id || agency.parent_agency_id === profile.agency_id
      );
    }

    return agencies.filter((agency) => agency.id === profile.agency_id);
  }, [agencies, profile]);

  const rows = useMemo<AgencyRow[]>(() => {
    return visibleAgencies.map((agency) => {
      const agencyName = agency.agency_name || agency.name || "名称未設定";

      const agencyContracts = contracts.filter((contract) => contract.agency_id === agency.id);
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
        name: agencyName,
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
  }, [visibleAgencies, contracts, billings]);

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

  const totalAgencies = visibleAgencies.length;

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
        const resolvedMonthKey = resolveBillingMonthKey(billing);
        if (!resolvedMonthKey) return false;
        return resolvedMonthKey === monthKey;
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="text-sm text-gray-500">読み込み中...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/80 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {profile?.role === "headquarters"
                  ? "本部ビュー"
                  : profile?.role === "agency"
                  ? "一次代理店ビュー"
                  : "二次代理店ビュー"}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
                  ダッシュボード
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  StarRevenue の顧客・契約・請求状況をまとめて確認できます
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/customers/new"
                className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
              >
                新規顧客
              </Link>
              <Link
                href="/contracts/new"
                className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
              >
                新規契約
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutLoading}
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {logoutLoading ? "ログアウト中..." : "ログアウト"}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
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

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">主要指標</h2>
            <p className="text-xs text-gray-500">全体の状況をひと目で確認</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="総売上" value={formatYen(totalSales)} tone="default" />
            <KpiCard title="総粗利" value={formatYen(totalGrossProfit)} tone="success" />
            <KpiCard title="未回収額" value={formatYen(totalUnpaid)} tone="danger" />
            <KpiCard
              title="全体回収率"
              value={`${overallCollectionRate.toFixed(1)}%`}
              tone="primary"
            />
            <KpiCard title="契約件数" value={`${totalContracts.toLocaleString()}件`} tone="default" />
            <KpiCard title="顧客数" value={`${totalCustomers.toLocaleString()}件`} tone="default" />
            <KpiCard
              title="契約あり顧客数"
              value={`${customersWithContracts.toLocaleString()}件`}
              tone="default"
            />
            <KpiCard
              title="表示対象代理店数"
              value={`${totalAgencies.toLocaleString()}件`}
              tone="default"
            />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
          <Panel
            title="危険案件 TOP5"
            subtitle="未回収が大きく、優先確認が必要な代理店"
            actionHref="/agencies"
            actionLabel="代理店一覧を見る"
          >
            {dangerRows.length === 0 ? (
              <EmptyText text="危険案件はありません" />
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
                          契約 {row.contractCount}件 / 回収率 {row.collectionRate.toFixed(1)}%
                        </p>
                      </div>
                      {alertBadge(row.warningLevel)}
                    </div>
                    <p className="mt-3 text-sm text-red-600">
                      未回収額：
                      <span className="ml-1 font-semibold">{formatYen(row.unpaid)}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="月別サマリー（直近6ヶ月）"
            subtitle="請求一覧の billing_month と合わせた月次集計"
            actionHref="/billings"
            actionLabel="請求一覧へ"
          >
            <div className="space-y-3">
              {monthlySummary.map((month) => (
                <div key={month.month} className="rounded-2xl bg-gray-50 p-4">
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
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="売上ランキング TOP5"
            subtitle="売上が大きい代理店"
            actionHref="/agencies"
            actionLabel="代理店一覧へ"
          >
            <div className="space-y-3">
              {salesRanking.length === 0 ? (
                <EmptyText text="データがありません" />
              ) : (
                salesRanking.map((row, index) => (
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
                    <p className="text-sm font-bold text-gray-900">{formatYen(row.sales)}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel
            title="未回収ランキング TOP5"
            subtitle="未回収額が大きい代理店"
            actionHref="/billings"
            actionLabel="請求一覧へ"
          >
            <div className="space-y-3">
              {unpaidRanking.length === 0 ? (
                <EmptyText text="データがありません" />
              ) : (
                unpaidRanking.map((row, index) => (
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
                    <p className="text-sm font-bold text-red-600">{formatYen(row.unpaid)}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <Panel
          title="代理店サマリー"
          subtitle="表示対象の主要代理店を上位順に表示"
          actionHref="/agencies"
          actionLabel="代理店一覧へ"
        >
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
                {rows.length === 0 ? (
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
                        <td className="px-4 py-4 text-red-600">{formatYen(row.unpaid)}</td>
                        <td className="px-4 py-4 font-medium text-blue-600">
                          {row.collectionRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/agencies/${row.id}`}
                            className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
                          >
                            詳細を見る
                          </Link>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "default" | "danger" | "primary" | "success";
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${kpiTone(tone)}`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="text-xs text-gray-500 underline">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="text-sm text-gray-500">{text}</p>;
}