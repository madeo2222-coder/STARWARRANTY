"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  agency_name: string | null;
  email?: string | null;
};

type Billing = {
  id: string;
  billing_month: string | null;
  amount: number | null;
  status: "pending" | "paid" | "failed" | string | null;
};

type Payout = {
  id: string;
  agency_id: string;
  month: string;
  amount: number;
  status: "pending" | "done" | string;
  paid_at: string | null;
  created_at: string | null;
};

const MONTHLY_SYSTEM_FEE = 11000;
const SETTLEMENT_FEE_RATE = 0.03;

function formatYen(value: number) {
  return `¥${value.toLocaleString()}`;
}

function normalizeMonthKey(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}\/\d{2}$/.test(trimmed)) return trimmed.replace("/", "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);

  return null;
}

function getPreviousMonthKey() {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = previous.getFullYear();
  const m = String(previous.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function getTodayLabel() {
  return new Date().toLocaleDateString("ja-JP");
}

function buildPreviewHtml(documentHtml: string) {
  return `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>精算書プレビュー</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #f5f5f5;
      font-family: Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: rgba(255,255,255,0.95);
      border: 1px solid #ddd;
      border-radius: 12px;
    }
    .toolbar button {
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 14px;
      cursor: pointer;
      background: #111827;
      color: white;
    }
    .sheet {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .toolbar {
        display: none !important;
      }
      .sheet {
        max-width: none;
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">印刷 / PDF保存</button>
    <button onclick="history.back()">戻る</button>
  </div>
  <div class="sheet">
    ${documentHtml}
  </div>
</body>
</html>
  `.trim();
}

export default function AgencyDetailPage() {
  const params = useParams();
  const agencyId = params.id as string;

  const [agency, setAgency] = useState<Agency | null>(null);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"previous_paid" | "all" | "unpaid">("previous_paid");
  const [emailInput, setEmailInput] = useState("");

  const previousMonthKey = useMemo(() => getPreviousMonthKey(), []);
  const issuedDate = useMemo(() => getTodayLabel(), []);

  useEffect(() => {
    void fetchData();
  }, [agencyId]);

  async function fetchData() {
    setLoading(true);

    const { data: agencyData, error: agencyError } = await supabase
      .from("agencies")
      .select("id, agency_name, email")
      .eq("id", agencyId)
      .maybeSingle();

    if (agencyError) {
      console.error("agency error:", agencyError);
    } else {
      const agencyRow = (agencyData || null) as Agency | null;
      setAgency(agencyRow);
      setEmailInput(agencyRow?.email || "");
    }

    const { data: contractsData, error: contractsError } = await supabase
      .from("contracts")
      .select("id, agency_id")
      .eq("agency_id", agencyId);

    if (contractsError) {
      console.error("contracts error:", contractsError);
      setLoading(false);
      return;
    }

    const contractIds = (contractsData || []).map((contract) => contract.id);

    if (contractIds.length === 0) {
      setBillings([]);
    } else {
      const { data: billingsData, error: billingsError } = await supabase
        .from("billings")
        .select("id, billing_month, amount, status, contract_id")
        .in("contract_id", contractIds)
        .order("billing_month", { ascending: false });

      if (billingsError) {
        console.error("billings error:", billingsError);
        setLoading(false);
        return;
      }

      setBillings(
        ((billingsData || []).map((billing: any) => ({
          id: billing.id,
          billing_month: billing.billing_month,
          amount: billing.amount,
          status: billing.status,
        })) as Billing[])
      );
    }

    try {
      const payoutRes = await fetch(`/api/payouts?month=${previousMonthKey}`, {
        method: "GET",
        cache: "no-store",
      });
      const payoutJson = await payoutRes.json();

      if (payoutRes.ok && payoutJson.success) {
        const found = (payoutJson.payouts || []).find(
          (item: Payout) => item.agency_id === agencyId
        );
        setPayout(found || null);
      } else {
        setPayout(null);
      }
    } catch (error) {
      console.error(error);
      setPayout(null);
    }

    setLoading(false);
  }

  const previousMonthPaidBillings = useMemo(() => {
    return billings.filter((billing) => {
      if (billing.status !== "paid") return false;
      return normalizeMonthKey(billing.billing_month) === previousMonthKey;
    });
  }, [billings, previousMonthKey]);

  const displayData = useMemo(() => {
    if (filter === "previous_paid") return previousMonthPaidBillings;
    if (filter === "unpaid") return billings.filter((billing) => billing.status === "pending");
    return billings;
  }, [billings, filter, previousMonthPaidBillings]);

  const summary = useMemo(() => {
    const previousMonthPaidAmount = previousMonthPaidBillings.reduce((sum, billing) => {
      return sum + (billing.amount || 0);
    }, 0);

    const settlementFee = Math.round(previousMonthPaidAmount * SETTLEMENT_FEE_RATE);
    const provisionalPayout = Math.max(
      0,
      previousMonthPaidAmount - MONTHLY_SYSTEM_FEE - settlementFee
    );

    return {
      previousMonthPaidAmount,
      systemFee: MONTHLY_SYSTEM_FEE,
      settlementFee,
      provisionalPayout,
      previousMonthCount: previousMonthPaidBillings.length,
      unpaidCount: billings.filter((billing) => billing.status === "pending").length,
      unpaidAmount: billings
        .filter((billing) => billing.status === "pending")
        .reduce((sum, billing) => sum + (billing.amount || 0), 0),
    };
  }, [billings, previousMonthPaidBillings]);

  async function handleCreatePending() {
    setSaving(true);

    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agency_id: agencyId,
          month: previousMonthKey,
          amount: summary.provisionalPayout,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        alert(json.error || "振込予定データ作成に失敗しました");
        setSaving(false);
        return;
      }

      await fetchData();
    } catch (error) {
      console.error(error);
      alert("振込予定データ作成でエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    setSaving(true);

    try {
      let payoutId = payout?.id || null;

      if (!payoutId) {
        const createRes = await fetch("/api/payouts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agency_id: agencyId,
            month: previousMonthKey,
            amount: summary.provisionalPayout,
          }),
        });

        const createJson = await createRes.json();

        if (!createRes.ok || !createJson.success) {
          alert(createJson.error || "振込データ作成に失敗しました");
          setSaving(false);
          return;
        }

        payoutId = createJson.payout?.id || null;
      }

      const patchRes = await fetch("/api/payouts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payout_id: payoutId,
        }),
      });

      const patchJson = await patchRes.json();

      if (!patchRes.ok || !patchJson.success) {
        alert(patchJson.error || "振込完了更新に失敗しました");
        setSaving(false);
        return;
      }

      await fetchData();
    } catch (error) {
      console.error(error);
      alert("振込完了処理でエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendEmail() {
    if (!agency?.agency_name) {
      alert("代理店名が取得できません");
      return;
    }

    if (!emailInput.trim()) {
      alert("送信先メールアドレスを入力してください");
      return;
    }

    setSending(true);

    try {
      const res = await fetch("/api/send-agency-statement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agency_id: agencyId,
          agency_name: agency.agency_name,
          to_email: emailInput.trim(),
          target_month: previousMonthKey,
          issued_date: issuedDate,
          previous_month_paid_amount: summary.previousMonthPaidAmount,
          monthly_system_fee: summary.systemFee,
          settlement_fee: summary.settlementFee,
          provisional_payout: summary.provisionalPayout,
          payout_status:
            payout?.status === "done"
              ? "振込済"
              : payout?.status === "pending"
              ? "未振込"
              : "未作成",
          paid_at: formatDateOnly(payout?.paid_at || null),
          previous_month_count: summary.previousMonthCount,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        alert(json.error || "メール送信に失敗しました");
        setSending(false);
        return;
      }

      alert("メール送信しました");
    } catch (error) {
      console.error(error);
      alert("メール送信でエラーが発生しました");
    } finally {
      setSending(false);
    }
  }

  async function handleOpenSettlement() {
    const feeInput = window.prompt("振込手数料を入力してください（円）。未入力なら 0 円です。", "0");
    const transferFee = Number(feeInput || 0);

    if (Number.isNaN(transferFee) || transferFee < 0) {
      alert("振込手数料は 0 以上の数値で入力してください");
      return;
    }

    try {
      const res = await fetch("/api/generate-settlement-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agency_id: agencyId,
          target_month: previousMonthKey,
          transfer_fee: transferFee,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        alert(json.error || "精算書生成に失敗しました");
        return;
      }

      const html = buildPreviewHtml(String(json.html || ""));
      const previewWindow = window.open("", "_blank");

      if (previewWindow) {
        previewWindow.document.open();
        previewWindow.document.write(html);
        previewWindow.document.close();
        return;
      }

      document.open();
      document.write(html);
      document.close();
    } catch (error) {
      console.error(error);
      alert("精算書生成でエラーが発生しました");
    }
  }

  function handlePrintPdf() {
    window.print();
  }

  function renderStatus() {
    if (payout?.status === "done") {
      return (
        <div className="space-y-2">
          <div className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            振込済
          </div>
          <div className="text-sm text-gray-500">
            振込日時: {formatDateTime(payout.paid_at)}
          </div>
        </div>
      );
    }

    if (payout?.status === "pending") {
      return (
        <div className="space-y-3">
          <div className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
            未振込
          </div>
          <button
            type="button"
            disabled={saving || summary.provisionalPayout <= 0}
            onClick={() => void handleComplete()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 print:hidden"
          >
            {saving ? "更新中..." : "振込完了にする"}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
          未作成
        </div>
        <button
          type="button"
          disabled={saving || summary.provisionalPayout <= 0}
          onClick={() => void handleCreatePending()}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 print:hidden"
        >
          {saving ? "作成中..." : "振込予定を作成"}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 print:p-0">
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
          }
          .print-hidden {
            display: none !important;
          }
          .print-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="print-hidden flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            代理店詳細
            {agency?.agency_name ? `（${agency.agency_name}）` : `（${agencyId}）`}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            対象月：{previousMonthKey} / 振込手数料は別途管理
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePrintPdf}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            PDF出力
          </button>

          <button
            type="button"
            onClick={() => void handleOpenSettlement()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            精算書出力
          </button>

          <Link
            href="/agencies"
            className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium text-gray-700"
          >
            代理店一覧へ戻る
          </Link>
        </div>
      </div>

      <div className="print-hidden rounded-xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              送信先メールアドレス
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="agency@example.com"
              className="w-full rounded-lg border px-3 py-2 outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleSendEmail()}
              disabled={sending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {sending ? "送信中..." : "メール送信"}
            </button>
          </div>
        </div>
      </div>

      <div className="print-sheet space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">StarRevenue株式会社</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">
                請求書兼前月領収書
              </h2>
              <p className="mt-2 text-sm text-gray-500">発行日：{issuedDate}</p>
              <p className="text-sm text-gray-500">対象月：{previousMonthKey}</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-gray-500">代理店名</p>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {agency?.agency_name || "名称未設定"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">前月回収額</p>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {formatYen(summary.previousMonthPaidAmount)}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">月額利用料</p>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {formatYen(summary.systemFee)}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">手数料 3.0%</p>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {formatYen(summary.settlementFee)}
              </p>
            </div>

            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-blue-600">差引振込予定額</p>
              <p className="mt-2 text-xl font-bold text-blue-700">
                {formatYen(summary.provisionalPayout)}
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-4 py-3">項目</th>
                  <th className="px-4 py-3">内容</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-4 py-3">対象月</td>
                  <td className="px-4 py-3">{previousMonthKey}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">前月入金済件数</td>
                  <td className="px-4 py-3">{summary.previousMonthCount}件</td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">月額利用料</td>
                  <td className="px-4 py-3">{formatYen(summary.systemFee)}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">手数料 3.0%</td>
                  <td className="px-4 py-3">{formatYen(summary.settlementFee)}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">振込手数料</td>
                  <td className="px-4 py-3">別途</td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3 font-bold">差引振込予定額</td>
                  <td className="px-4 py-3 font-bold text-blue-700">
                    {formatYen(summary.provisionalPayout)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">振込状態</td>
                  <td className="px-4 py-3">
                    {payout?.status === "done"
                      ? "振込済"
                      : payout?.status === "pending"
                      ? "未振込"
                      : "未作成"}
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-4 py-3">振込日</td>
                  <td className="px-4 py-3">{formatDateOnly(payout?.paid_at || null)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <h3 className="text-base font-bold text-gray-900">前月入金済明細</h3>

            {previousMonthPaidBillings.length === 0 ? (
              <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                前月入金済明細はありません
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left">
                      <th className="px-4 py-3">請求月</th>
                      <th className="px-4 py-3">金額</th>
                      <th className="px-4 py-3">ステータス</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previousMonthPaidBillings.map((billing) => (
                      <tr key={billing.id} className="border-t">
                        <td className="px-4 py-3">{billing.billing_month || "-"}</td>
                        <td className="px-4 py-3">{formatYen(billing.amount || 0)}</td>
                        <td className="px-4 py-3">入金済</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 text-xs leading-6 text-gray-500">
            <p>※ 本書は請求書兼前月領収書です。</p>
            <p>※ 差引振込予定額 ＝ 前月回収額 - 月額利用料11,000円 - 手数料3.0%</p>
            <p>※ 振込手数料は別途扱いです。</p>
          </div>
        </div>

        <div className="print-hidden grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">前月回収額</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatYen(summary.previousMonthPaidAmount)}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">月額利用料</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatYen(summary.systemFee)}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">手数料 3.0%</p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {formatYen(summary.settlementFee)}
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="text-sm text-blue-600">仮振込予定額</p>
            <p className="mt-2 text-xl font-bold text-blue-700">
              {formatYen(summary.provisionalPayout)}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">振込状態</p>
            <div className="mt-3">{renderStatus()}</div>
            {payout ? (
              <div className="mt-3 text-xs text-gray-500">
                保存額: {formatYen(payout.amount || 0)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="print-hidden rounded-xl border bg-white p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-sm text-gray-500">前月入金済件数</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {summary.previousMonthCount}件
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">未回収件数</p>
              <p className="mt-1 text-lg font-bold text-red-600">
                {summary.unpaidCount}件
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">未回収額</p>
              <p className="mt-1 text-lg font-bold text-red-600">
                {formatYen(summary.unpaidAmount)}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            ※ 仮振込予定額 ＝ 前月回収額 - 月額利用料11,000円 - 手数料3.0%
            <br />
            ※ 振込手数料はこの画面ではまだ差し引いていません
          </p>
        </div>

        <div className="print-hidden flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("previous_paid")}
            className={`rounded border px-4 py-2 text-sm ${
              filter === "previous_paid" ? "bg-blue-600 text-white" : "bg-white"
            }`}
          >
            前月入金済のみ
          </button>

          <button
            onClick={() => setFilter("all")}
            className={`rounded border px-4 py-2 text-sm ${
              filter === "all" ? "bg-gray-800 text-white" : "bg-white"
            }`}
          >
            全件
          </button>

          <button
            onClick={() => setFilter("unpaid")}
            className={`rounded border px-4 py-2 text-sm ${
              filter === "unpaid" ? "bg-red-600 text-white" : "bg-white"
            }`}
          >
            未回収のみ
          </button>
        </div>

        <div className="print-hidden">
          {loading ? (
            <div>読み込み中...</div>
          ) : displayData.length === 0 ? (
            <div className="text-gray-500">データなし</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-3">請求月</th>
                    <th className="px-4 py-3">金額</th>
                    <th className="px-4 py-3">ステータス</th>
                    <th className="px-4 py-3">振込対象</th>
                  </tr>
                </thead>

                <tbody>
                  {displayData.map((billing) => {
                    const isPreviousPaid =
                      billing.status === "paid" &&
                      normalizeMonthKey(billing.billing_month) === previousMonthKey;

                    return (
                      <tr key={billing.id} className="border-t">
                        <td className="px-4 py-3">{billing.billing_month || "-"}</td>
                        <td className="px-4 py-3">
                          {formatYen(billing.amount || 0)}
                        </td>
                        <td className="px-4 py-3">
                          {billing.status === "paid"
                            ? "入金済"
                            : billing.status === "pending"
                            ? "未回収"
                            : billing.status === "failed"
                            ? "失敗"
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {isPreviousPaid ? (
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                              今月振込対象
                            </span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                              対象外
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}