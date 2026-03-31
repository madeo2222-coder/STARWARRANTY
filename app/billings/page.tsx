"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRelation =
  | {
      id: string;
      company_name: string | null;
      agency_id: string | null;
    }
  | {
      id: string;
      company_name: string | null;
      agency_id: string | null;
    }[]
  | null;

type BillingRow = {
  id: string;
  billing_month: string | null;
  amount: number | null;
  status: string | null;
  customer_id: string | null;
  paid_date?: string | null;
  customers: CustomerRelation;
};

type MockRole = "headquarters" | "agency" | "sub_agency";
type StatusFilter = "all" | "pending" | "paid" | "failed";

export default function BillingsPage() {
  const [billings, setBillings] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const mockProfile: {
    role: MockRole;
    agency_id: string | null;
  } = {
    role: "headquarters",
    agency_id: null,
    // role: "agency",
    // agency_id: "0267a2cd-63ef-4f53-a416-8c68487d4ed5",
    // role: "sub_agency",
    // agency_id: "0267a2cd-63ef-4f53-a416-8c68487d4ed5",
  };

  useEffect(() => {
    void fetchBillings();
  }, []);

  async function fetchBillings() {
    setLoading(true);
    setErrorMsg("");

    try {
      let visibleAgencyIds: string[] | null = null;

      if (mockProfile.role === "headquarters") {
        visibleAgencyIds = null;
      }

      if (mockProfile.role === "agency") {
        if (!mockProfile.agency_id) {
          setErrorMsg("agency_idが未設定です");
          setLoading(false);
          return;
        }

        const { data: childAgencies, error: childError } = await supabase
          .from("agencies")
          .select("id")
          .eq("parent_id", mockProfile.agency_id);

        if (childError) {
          console.error("child agencies fetch error:", childError);
          setErrorMsg("子代理店の取得に失敗しました");
          setLoading(false);
          return;
        }

        visibleAgencyIds = [
          mockProfile.agency_id,
          ...((childAgencies ?? []).map((a) => a.id) as string[]),
        ];
      }

      if (mockProfile.role === "sub_agency") {
        if (!mockProfile.agency_id) {
          setErrorMsg("agency_idが未設定です");
          setLoading(false);
          return;
        }

        visibleAgencyIds = [mockProfile.agency_id];
      }

      let customerIds: string[] | null = null;

      if (visibleAgencyIds) {
        const { data: customers, error: customersError } = await supabase
          .from("customers")
          .select("id")
          .in("agency_id", visibleAgencyIds);

        if (customersError) {
          console.error("customers fetch error:", customersError);
          setErrorMsg("顧客の取得に失敗しました");
          setLoading(false);
          return;
        }

        customerIds = (customers ?? []).map((c) => c.id);

        if (customerIds.length === 0) {
          setBillings([]);
          setLoading(false);
          return;
        }
      }

      let query = supabase
        .from("billings")
        .select(
          `
          id,
          billing_month,
          amount,
          status,
          customer_id,
          paid_date,
          customers (
            id,
            company_name,
            agency_id
          )
        `
        )
        .order("billing_month", { ascending: false });

      if (customerIds && customerIds.length > 0) {
        query = query.in("customer_id", customerIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error("billings fetch error:", error);
        setErrorMsg("請求データ取得に失敗しました");
        setBillings([]);
        setLoading(false);
        return;
      }

      setBillings((data ?? []) as unknown as BillingRow[]);
      setLoading(false);
    } catch (e) {
      console.error("billings unexpected error:", e);
      setErrorMsg("予期しないエラーが発生しました");
      setLoading(false);
    }
  }

  async function handleMarkAsPaid(billingId: string) {
    const ok = window.confirm("この請求を入金済みにしますか？");
    if (!ok) return;

    setUpdatingId(billingId);

    const today = new Date().toISOString().split("T")[0];

    const { error } = await supabase
      .from("billings")
      .update({
        status: "paid",
        paid_date: today,
      })
      .eq("id", billingId);

    if (error) {
      console.error("billing update error:", error);
      alert("入金更新に失敗しました");
      setUpdatingId(null);
      return;
    }

    await fetchBillings();
    setUpdatingId(null);
  }

  function formatMoney(value: number | null) {
    return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
  }

  function getStatus(status: string | null) {
    if (status === "paid") return "入金済み";
    if (status === "pending") return "未入金";
    if (status === "failed") return "回収不能";
    return "-";
  }

  function getStatusBadge(status: string | null) {
    if (status === "paid") {
      return (
        <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
          入金済み
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">
          回収不能
        </span>
      );
    }
    return (
      <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
        未入金
      </span>
    );
  }

  function getCustomerName(customers: CustomerRelation) {
    if (!customers) return "-";
    if (Array.isArray(customers)) {
      return customers[0]?.company_name || "-";
    }
    return customers.company_name || "-";
  }

  function getRoleLabel(role: MockRole) {
    if (role === "headquarters") return "本部";
    if (role === "agency") return "代理店";
    if (role === "sub_agency") return "2次代理店";
    return "-";
  }

  const filteredBillings = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return billings.filter((billing) => {
      const customerName = getCustomerName(billing.customers).toLowerCase();

      const matchesKeyword =
        keyword === "" || customerName.includes(keyword);

      const matchesStatus =
        statusFilter === "all" || billing.status === statusFilter;

      return matchesKeyword && matchesStatus;
    });
  }, [billings, searchKeyword, statusFilter]);

  const summary = useMemo(() => {
    const totalCount = filteredBillings.length;
    const totalAmount = filteredBillings.reduce(
      (sum, billing) => sum + (billing.amount || 0),
      0
    );
    const paidAmount = filteredBillings
      .filter((billing) => billing.status === "paid")
      .reduce((sum, billing) => sum + (billing.amount || 0), 0);
    const unpaidAmount = filteredBillings
      .filter((billing) => billing.status === "pending")
      .reduce((sum, billing) => sum + (billing.amount || 0), 0);

    return {
      totalCount,
      totalAmount,
      paidAmount,
      unpaidAmount,
    };
  }, [filteredBillings]);

  function escapeCsv(value: string | number | null | undefined) {
    const text = String(value ?? "");
    if (text.includes('"') || text.includes(",") || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadCsv() {
    if (filteredBillings.length === 0) {
      alert("出力対象データがありません");
      return;
    }

    const headers = [
      "顧客名",
      "請求月",
      "金額",
      "状態",
      "入金日",
    ];

    const rows = filteredBillings.map((billing) => [
      getCustomerName(billing.customers),
      billing.billing_month ?? "",
      billing.amount ?? 0,
      getStatus(billing.status),
      billing.paid_date ?? "",
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
    link.download = `billings_${yyyymmdd}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">請求一覧</h1>
        <p className="text-sm text-gray-500">
          現在の表示権限: {getRoleLabel(mockProfile.role)}
          {mockProfile.agency_id ? ` / agency_id: ${mockProfile.agency_id}` : ""}
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">件数</div>
          <div className="mt-1 text-xl font-semibold">
            {summary.totalCount.toLocaleString()}件
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">請求合計</div>
          <div className="mt-1 text-xl font-semibold">
            {formatMoney(summary.totalAmount)}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">入金済み</div>
          <div className="mt-1 text-xl font-semibold text-blue-600">
            {formatMoney(summary.paidAmount)}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">未入金</div>
          <div className="mt-1 text-xl font-semibold text-red-600">
            {formatMoney(summary.unpaidAmount)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            顧客名検索
          </label>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="顧客名で検索"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            ステータス
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
          >
            <option value="all">すべて</option>
            <option value="pending">未入金</option>
            <option value="paid">入金済み</option>
            <option value="failed">回収不能</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={downloadCsv}
          className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white shadow-sm hover:opacity-90"
        >
          CSV出力
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">読み込み中...</div>
        ) : filteredBillings.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            表示対象の請求データがありません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">顧客</th>
                  <th className="px-4 py-3 font-medium">請求月</th>
                  <th className="px-4 py-3 font-medium">金額</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">入金日</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredBillings.map((billing) => (
                  <tr key={billing.id} className="border-t">
                    <td className="px-4 py-3">
                      {getCustomerName(billing.customers)}
                    </td>
                    <td className="px-4 py-3">{billing.billing_month || "-"}</td>
                    <td className="px-4 py-3">{formatMoney(billing.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(billing.status)}
                        <span className="text-xs text-gray-500">
                          {getStatus(billing.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{billing.paid_date || "-"}</td>
                    <td className="px-4 py-3">
                      {billing.status === "pending" ? (
                        <button
                          onClick={() => handleMarkAsPaid(billing.id)}
                          disabled={updatingId === billing.id}
                          className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          {updatingId === billing.id ? "更新中..." : "入金"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}