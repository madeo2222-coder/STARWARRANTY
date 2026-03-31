"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AgencyRelation =
  | {
      id: string;
      name: string | null;
    }
  | {
      id: string;
      name: string | null;
    }[]
  | null;

type CustomerRow = {
  id: string;
  company_name: string | null;
  service_name: string | null;
  payment_method: string | null;
  monthly_amount: number | null;
  status: string | null;
  agency_id: string | null;
  agencies: AgencyRelation;
};

type MockRole = "headquarters" | "agency" | "sub_agency";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

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
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    setLoading(true);
    setErrorMsg("");

    try {
      let visibleAgencyIds: string[] | null = null;

      if (mockProfile.role === "headquarters") {
        visibleAgencyIds = null;
      }

      if (mockProfile.role === "agency") {
        if (!mockProfile.agency_id) {
          setErrorMsg("代理店アカウントの agency_id が未設定です");
          setCustomers([]);
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
          setCustomers([]);
          setLoading(false);
          return;
        }

        visibleAgencyIds = [
          mockProfile.agency_id,
          ...((childAgencies ?? []).map((agency) => agency.id) as string[]),
        ];
      }

      if (mockProfile.role === "sub_agency") {
        if (!mockProfile.agency_id) {
          setErrorMsg("二次代理店アカウントの agency_id が未設定です");
          setCustomers([]);
          setLoading(false);
          return;
        }

        visibleAgencyIds = [mockProfile.agency_id];
      }

      let query = supabase
        .from("customers")
        .select(
          `
          id,
          company_name,
          service_name,
          payment_method,
          monthly_amount,
          status,
          agency_id,
          agencies (
            id,
            name
          )
        `
        )
        .order("created_at", { ascending: false });

      if (visibleAgencyIds && visibleAgencyIds.length > 0) {
        query = query.in("agency_id", visibleAgencyIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error("customers fetch error:", error);
        setErrorMsg("顧客一覧の取得に失敗しました");
        setCustomers([]);
        setLoading(false);
        return;
      }

      setCustomers((data ?? []) as unknown as CustomerRow[]);
      setLoading(false);
    } catch (error) {
      console.error("customers unexpected error:", error);
      setErrorMsg("顧客一覧の読み込み中に予期しないエラーが発生しました");
      setCustomers([]);
      setLoading(false);
    }
  }

  function getAgencyName(customer: CustomerRow) {
    if (!customer.agencies) return "-";
    if (Array.isArray(customer.agencies)) {
      return customer.agencies[0]?.name || "-";
    }
    return customer.agencies.name || "-";
  }

  function getPaymentLabel(paymentMethod: string | null) {
    if (paymentMethod === "card") return "クレカ";
    if (paymentMethod === "bank") return "口座振替";
    return "-";
  }

  function getStatusLabel(status: string | null) {
    if (status === "active") return "稼働中";
    if (status === "cancelled") return "解約";
    return "-";
  }

  function formatMoney(value: number | null) {
    return `¥${Number(value || 0).toLocaleString()}`;
  }

  function getRoleLabel(role: MockRole) {
    if (role === "headquarters") return "本部";
    if (role === "agency") return "代理店";
    if (role === "sub_agency") return "2次代理店";
    return "-";
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">顧客一覧（申込台帳）</h1>
          <p className="text-sm text-gray-500">
            現在の表示権限: {getRoleLabel(mockProfile.role)}
            {mockProfile.agency_id ? ` / agency_id: ${mockProfile.agency_id}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-white">
            クレカCSV
          </button>
          <button className="rounded-lg bg-green-600 px-4 py-2 text-white">
            口座振替CSV
          </button>
          <Link
            href="/customers/new"
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            ＋ 顧客登録
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">読み込み中...</div>
        ) : customers.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            表示対象の顧客データがありません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">企業名</th>
                  <th className="px-4 py-3 font-medium">代理店</th>
                  <th className="px-4 py-3 font-medium">サービス</th>
                  <th className="px-4 py-3 font-medium">決済</th>
                  <th className="px-4 py-3 font-medium">月額</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-t">
                    <td className="px-4 py-3">{customer.company_name || "-"}</td>
                    <td className="px-4 py-3">{getAgencyName(customer)}</td>
                    <td className="px-4 py-3">{customer.service_name || "-"}</td>
                    <td className="px-4 py-3">
                      {getPaymentLabel(customer.payment_method)}
                    </td>
                    <td className="px-4 py-3">
                      {formatMoney(customer.monthly_amount)}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusLabel(customer.status)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-blue-600 underline"
                      >
                        詳細
                      </Link>
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