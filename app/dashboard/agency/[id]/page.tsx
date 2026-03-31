"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";

type Billing = {
  id: string;
  billing_month: string | null;
  amount: number | null;
  status: string | null;
  customers:
    | {
        company_name: string | null;
        agency_id: string | null;
      }
    | {
        company_name: string | null;
        agency_id: string | null;
      }[]
    | null;
};

function getCustomerName(customers: Billing["customers"]) {
  if (!customers) return "-";
  if (Array.isArray(customers)) {
    return customers[0]?.company_name ?? "-";
  }
  return customers.company_name ?? "-";
}

export default function AgencyDetailPage() {
  const params = useParams();
  const agencyId = params.id as string;

  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unpaid">("all");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data, error } = await supabase
      .from("billings")
      .select(`
        id,
        billing_month,
        amount,
        status,
        customers (
          company_name,
          agency_id
        )
      `);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const filtered =
      (data || []).filter((b: any) => {
        const c = Array.isArray(b.customers)
          ? b.customers[0]
          : b.customers;
        return c?.agency_id === agencyId;
      }) || [];

    setBillings(filtered);
    setLoading(false);
  }

  const displayData = useMemo(() => {
    if (filter === "unpaid") {
      return billings.filter((b) => b.status === "pending");
    }
    return billings;
  }, [billings, filter]);

  const summary = useMemo(() => {
    const total = displayData.reduce((sum, b) => sum + (b.amount || 0), 0);
    const count = displayData.length;
    return { total, count };
  }, [displayData]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        代理店詳細（{agencyId}）
      </h1>

      {/* フィルター */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded border ${
            filter === "all" ? "bg-blue-600 text-white" : "bg-white"
          }`}
        >
          全件
        </button>

        <button
          onClick={() => setFilter("unpaid")}
          className={`px-4 py-2 rounded border ${
            filter === "unpaid" ? "bg-red-600 text-white" : "bg-white"
          }`}
        >
          未回収のみ
        </button>
      </div>

      {/* サマリー */}
      <div className="text-sm text-gray-600">
        件数: {summary.count}件 / 金額: ¥{summary.total.toLocaleString()}
      </div>

      {loading ? (
        <div>読み込み中...</div>
      ) : displayData.length === 0 ? (
        <div className="text-gray-500">データなし</div>
      ) : (
        <table className="w-full border">
          <thead>
            <tr>
              <th>顧客</th>
              <th>月</th>
              <th>金額</th>
              <th>ステータス</th>
            </tr>
          </thead>

          <tbody>
            {displayData.map((b) => (
              <tr key={b.id} className="border-t">
                <td>{getCustomerName(b.customers)}</td>
                <td>{b.billing_month}</td>
                <td>¥{(b.amount || 0).toLocaleString()}</td>
                <td>
                  {b.status === "paid"
                    ? "入金済"
                    : b.status === "pending"
                    ? "未回収"
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}