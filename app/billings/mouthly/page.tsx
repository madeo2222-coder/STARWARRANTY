"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Billing = {
  id: string;
  amount: number | null;
  status: string;
  due_date: string | null;
  paid_date: string | null;
};

type Monthly = {
  month: string;
  total: number;
  paid: number;
  unpaid: number;
  rate: number;
};

function getMonth(date: string | null) {
  if (!date) return "不明";
  return date.slice(0, 7);
}

function formatMoney(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

export default function MonthlyPage() {
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data, error } = await supabase
      .from("billings")
      .select("id, amount, status, due_date, paid_date");

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setBillings(data || []);
    setLoading(false);
  }

  const monthly = useMemo<Monthly[]>(() => {
    const map = new Map<string, Monthly>();

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    for (const b of billings) {
      if (!b.due_date) continue;

      const date = new Date(b.due_date);
      if (date < sixMonthsAgo) continue;

      const month = getMonth(b.due_date);

      if (!map.has(month)) {
        map.set(month, {
          month,
          total: 0,
          paid: 0,
          unpaid: 0,
          rate: 0,
        });
      }

      const m = map.get(month)!;
      const amount = b.amount || 0;

      m.total += amount;

      if (b.status === "paid") {
        m.paid += amount;
      } else if (b.status === "pending") {
        m.unpaid += amount;
      }
    }

    return Array.from(map.values())
      .map((m) => ({
        ...m,
        rate:
          m.total === 0
            ? 0
            : Math.round((m.paid / m.total) * 1000) / 10,
      }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [billings]);

  const summary = useMemo(() => {
    const total = monthly.reduce((sum, m) => sum + m.total, 0);
    const paid = monthly.reduce((sum, m) => sum + m.paid, 0);
    const unpaid = monthly.reduce((sum, m) => sum + m.unpaid, 0);

    const rate =
      total === 0 ? 0 : Math.round((paid / total) * 1000) / 10;

    return { total, paid, unpaid, rate };
  }, [monthly]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">月次ダッシュボード</h1>

      {/* サマリー */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 border rounded">
          <div className="text-sm text-gray-500">売上合計</div>
          <div className="text-xl font-bold">
            {formatMoney(summary.total)}
          </div>
        </div>

        <div className="p-4 border rounded">
          <div className="text-sm text-gray-500">入金合計</div>
          <div className="text-xl font-bold text-blue-600">
            {formatMoney(summary.paid)}
          </div>
        </div>

        <div className="p-4 border rounded">
          <div className="text-sm text-gray-500">未回収</div>
          <div className="text-xl font-bold text-red-600">
            {formatMoney(summary.unpaid)}
          </div>
        </div>

        <div className="p-4 border rounded">
          <div className="text-sm text-gray-500">回収率</div>
          <div className="text-xl font-bold">
            {summary.rate}%
          </div>
        </div>
      </div>

      {/* テーブル */}
      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <table className="w-full border">
          <thead>
            <tr>
              <th>月</th>
              <th>売上</th>
              <th>入金</th>
              <th>未回収</th>
              <th>回収率</th>
            </tr>
          </thead>

          <tbody>
            {monthly.map((m) => (
              <tr key={m.month} className="border-t">
                <td>{m.month}</td>
                <td>{formatMoney(m.total)}</td>
                <td className="text-blue-600">
                  {formatMoney(m.paid)}
                </td>
                <td className="text-red-600">
                  {formatMoney(m.unpaid)}
                </td>
                <td>{m.rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}