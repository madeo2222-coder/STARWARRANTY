"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Agency = {
  id: string;
  agency_name: string | null;
  parent_agency_id: string | null;
};

type Contract = {
  id: string;
  agency_id: string | null;
  amount: number | null;
};

type Billing = {
  contract_id: string;
  status: "pending" | "paid" | "failed";
  amount: number | null;
  billing_month: string | null;
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

type MonthlyPayoutSummary = {
  sales: number;
  unpaid: number;
  rate: number;
  previousMonthPaidAmount: number;
  systemFee: number;
  settlementFee: number;
  provisionalPayout: number;
};

type CsvRow = {
  agency_name: string;
  agency_type: string;
  target_month: string;
  previous_month_paid_amount: number;
  monthly_system_fee: number;
  settlement_fee: number;
  provisional_payout: number;
  payout_status: string;
  paid_at: string;
};

const MONTHLY_SYSTEM_FEE = 11000;
const SETTLEMENT_FEE_RATE = 0.03;

function formatYen(value: number) {
  return `¥${value.toLocaleString()}`;
}

function normalizeMonthKey(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace("/", "-");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }

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

function toCsvValue(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildPreviewHtml(documentHtml: string, fallbackPath: string) {
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
  <script>
    function goBackFromPreview() {
      try {
        if (window.opener && !window.opener.closed) {
          window.close();
          return;
        }

        if (window.history.length > 1) {
          window.history.back();
          setTimeout(function () {
            window.location.href = "${fallbackPath}";
          }, 400);
          return;
        }

        window.location.href = "${fallbackPath}";
      } catch (e) {
        window.location.href = "${fallbackPath}";
      }
    }
  </script>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">印刷 / PDF保存</button>
    <button onclick="goBackFromPreview()">戻る</button>
  </div>
  <div class="sheet">
    ${documentHtml}
  </div>
</body>
</html>
  `.trim();
}

export default function AgenciesPage() {
  const supabase = createClient();

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAgencyId, setSavingAgencyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");

  const previousMonthKey = useMemo(() => getPreviousMonthKey(), []);

  useEffect(() => {
    void fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);

    const [agRes, conRes, payoutsRes] = await Promise.all([
      supabase
        .from("agencies")
        .select("id, agency_name, parent_agency_id")
        .order("created_at", { ascending: true }),
      supabase.from("contracts").select("id, agency_id, amount"),
      fetch(`/api/payouts?month=${previousMonthKey}`, {
        method: "GET",
        cache: "no-store",
      }),
    ]);

    if (agRes.error || conRes.error) {
      console.error("fetch error:", agRes.error || conRes.error);
      setLoading(false);
      return;
    }

    const contractIds = (conRes.data || []).map((c) => c.id);

    const billRes =
      contractIds.length > 0
        ? await supabase
            .from("billings")
            .select("contract_id, status, amount, billing_month")
            .in("contract_id", contractIds)
        : { data: [], error: null };

    if (billRes.error) {
      console.error("billings error:", billRes.error);
    }

    let payoutList: Payout[] = [];

    if (payoutsRes.ok) {
      const payoutsJson = await payoutsRes.json();
      payoutList = (payoutsJson.payouts || []) as Payout[];
    } else {
      console.error("payouts fetch error");
    }

    setAgencies((agRes.data || []) as Agency[]);
    setContracts((conRes.data || []) as Contract[]);
    setBillings((billRes.data || []) as Billing[]);
    setPayouts(payoutList);
    setLoading(false);
  }

  const parents = agencies.filter((agency) => !agency.parent_agency_id);

  function getChildren(parentId: string) {
    return agencies.filter((agency) => agency.parent_agency_id === parentId);
  }

  function calc(agencyId: string): MonthlyPayoutSummary {
    const agencyContracts = contracts.filter((contract) => contract.agency_id === agencyId);
    const contractIds = agencyContracts.map((contract) => contract.id);

    const agencyBillings = billings.filter((billing) =>
      contractIds.includes(billing.contract_id)
    );

    const sales = agencyContracts.reduce((sum, contract) => {
      return sum + (contract.amount || 0);
    }, 0);

    const unpaid = agencyBillings
      .filter((billing) => billing.status === "pending")
      .reduce((sum, billing) => sum + (billing.amount || 0), 0);

    const total = agencyBillings.length;
    const paid = agencyBillings.filter((billing) => billing.status === "paid").length;
    const rate = total === 0 ? 0 : Math.round((paid / total) * 100);

    const previousMonthPaidAmount = agencyBillings
      .filter((billing) => {
        if (billing.status !== "paid") return false;
        return normalizeMonthKey(billing.billing_month) === previousMonthKey;
      })
      .reduce((sum, billing) => sum + (billing.amount || 0), 0);

    const settlementFee = Math.round(previousMonthPaidAmount * SETTLEMENT_FEE_RATE);
    const provisionalPayout = Math.max(
      0,
      previousMonthPaidAmount - MONTHLY_SYSTEM_FEE - settlementFee
    );

    return {
      sales,
      unpaid,
      rate,
      previousMonthPaidAmount,
      systemFee: MONTHLY_SYSTEM_FEE,
      settlementFee,
      provisionalPayout,
    };
  }

  function getPayout(agencyId: string) {
    return payouts.find(
      (payout) => payout.agency_id === agencyId && payout.month === previousMonthKey
    );
  }

  function isVisible(agencyId: string) {
    const payout = getPayout(agencyId);

    if (filter === "pending") {
      return !payout || payout.status === "pending";
    }

    if (filter === "done") {
      return payout?.status === "done";
    }

    return true;
  }

  async function handleCompletePayout(agencyId: string) {
    const summary = calc(agencyId);
    const existingPayout = getPayout(agencyId);

    setSavingAgencyId(agencyId);

    try {
      let payoutId = existingPayout?.id || null;

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
          setSavingAgencyId(null);
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
        setSavingAgencyId(null);
        return;
      }

      await fetchAll();
    } catch (error) {
      console.error(error);
      alert("振込完了処理でエラーが発生しました");
    } finally {
      setSavingAgencyId(null);
    }
  }

  async function handleCreatePendingPayout(agencyId: string) {
    const summary = calc(agencyId);

    setSavingAgencyId(agencyId);

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
        setSavingAgencyId(null);
        return;
      }

      await fetchAll();
    } catch (error) {
      console.error(error);
      alert("振込予定データ作成でエラーが発生しました");
    } finally {
      setSavingAgencyId(null);
    }
  }

  async function handleOpenSettlement(agencyId: string) {
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

      const html = buildPreviewHtml(String(json.html || ""), "/agencies");
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

  function renderPayoutAction(agencyId: string, provisionalPayout: number) {
    const payout = getPayout(agencyId);
    const isSaving = savingAgencyId === agencyId;

    if (payout?.status === "done") {
      return (
        <div className="space-y-2">
          <div className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            振込済
          </div>
          <div className="text-xs text-gray-500">
            振込日時: {formatDateTime(payout.paid_at)}
          </div>
        </div>
      );
    }

    if (payout?.status === "pending") {
      return (
        <div className="space-y-2">
          <div className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
            未振込
          </div>
          <button
            type="button"
            disabled={isSaving || provisionalPayout <= 0}
            onClick={() => void handleCompletePayout(agencyId)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? "更新中..." : "振込完了にする"}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
          未作成
        </div>
        <button
          type="button"
          disabled={isSaving || provisionalPayout <= 0}
          onClick={() => void handleCreatePendingPayout(agencyId)}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {isSaving ? "作成中..." : "振込予定を作成"}
        </button>
      </div>
    );
  }

  const visibleParents = parents.filter((parent) => {
    const selfVisible = isVisible(parent.id);
    const childVisible = getChildren(parent.id).some((child) => isVisible(child.id));
    return selfVisible || childVisible;
  });

  const csvRows = useMemo<CsvRow[]>(() => {
    const rows: CsvRow[] = [];

    for (const parent of visibleParents) {
      const parentSummary = calc(parent.id);
      const parentPayout = getPayout(parent.id);

      if (isVisible(parent.id)) {
        rows.push({
          agency_name: parent.agency_name || "名称未設定",
          agency_type: "一次代理店",
          target_month: previousMonthKey,
          previous_month_paid_amount: parentSummary.previousMonthPaidAmount,
          monthly_system_fee: parentSummary.systemFee,
          settlement_fee: parentSummary.settlementFee,
          provisional_payout: parentSummary.provisionalPayout,
          payout_status:
            parentPayout?.status === "done"
              ? "振込済"
              : parentPayout?.status === "pending"
              ? "未振込"
              : "未作成",
          paid_at: formatDateTime(parentPayout?.paid_at || null),
        });
      }

      const visibleChildren = getChildren(parent.id).filter((child) => isVisible(child.id));

      for (const child of visibleChildren) {
        const childSummary = calc(child.id);
        const childPayout = getPayout(child.id);

        rows.push({
          agency_name: child.agency_name || "名称未設定",
          agency_type: "二次代理店",
          target_month: previousMonthKey,
          previous_month_paid_amount: childSummary.previousMonthPaidAmount,
          monthly_system_fee: childSummary.systemFee,
          settlement_fee: childSummary.settlementFee,
          provisional_payout: childSummary.provisionalPayout,
          payout_status:
            childPayout?.status === "done"
              ? "振込済"
              : childPayout?.status === "pending"
              ? "未振込"
              : "未作成",
          paid_at: formatDateTime(childPayout?.paid_at || null),
        });
      }
    }

    return rows;
  }, [visibleParents, payouts, billings, contracts, filter, previousMonthKey]);

  function handleExportCsv() {
    if (csvRows.length === 0) {
      alert("出力対象データがありません");
      return;
    }

    const header = [
      "代理店名",
      "代理店区分",
      "対象月",
      "前月回収額",
      "月額利用料",
      "手数料3.0%",
      "仮振込予定額",
      "振込状態",
      "振込日時",
    ];

    const lines = [
      header.map(toCsvValue).join(","),
      ...csvRows.map((row) =>
        [
          row.agency_name,
          row.agency_type,
          row.target_month,
          row.previous_month_paid_amount,
          row.monthly_system_fee,
          row.settlement_fee,
          row.provisional_payout,
          row.payout_status,
          row.paid_at,
        ]
          .map(toCsvValue)
          .join(",")
      ),
    ];

    const csvContent = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileSuffix =
      filter === "pending" ? "未振込のみ" : filter === "done" ? "振込済のみ" : "全件";

    link.href = url;
    link.download = `振込一覧_${previousMonthKey}_${fileSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold">代理店一覧（ツリー＋振込管理）</h1>
          <p className="mt-1 text-sm text-gray-500">
            対象月：{previousMonthKey} / 振込手数料は別途管理
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            CSV出力
          </button>

          <Link
            href="/"
            className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium text-gray-700"
          >
            ダッシュボードへ戻る
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            filter === "all" ? "bg-black text-white" : "bg-white text-gray-700"
          }`}
        >
          全て
        </button>

        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            filter === "pending"
              ? "bg-yellow-500 text-white"
              : "bg-white text-gray-700"
          }`}
        >
          未振込のみ
        </button>

        <button
          type="button"
          onClick={() => setFilter("done")}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            filter === "done" ? "bg-green-600 text-white" : "bg-white text-gray-700"
          }`}
        >
          振込済のみ
        </button>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : visibleParents.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
          表示対象の代理店データがありません
        </div>
      ) : (
        <div className="space-y-4">
          {visibleParents.map((parent) => {
            const parentSummary = calc(parent.id);
            const parentPayout = getPayout(parent.id);
            const visibleChildren = getChildren(parent.id).filter((child) =>
              isVisible(child.id)
            );

            return (
              <div key={parent.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {parent.agency_name || "名称未設定"}
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                      売上 {formatYen(parentSummary.sales)} / 未回収{" "}
                      {formatYen(parentSummary.unpaid)} / 回収率 {parentSummary.rate}%
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleOpenSettlement(parent.id)}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                    >
                      精算書出力
                    </button>

                    <Link
                      href={`/dashboard/agency/${parent.id}`}
                      className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
                    >
                      詳細を見る
                    </Link>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">前月回収額</p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {formatYen(parentSummary.previousMonthPaidAmount)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">月額利用料</p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {formatYen(parentSummary.systemFee)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">手数料 3.0%</p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {formatYen(parentSummary.settlementFee)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs text-blue-600">仮振込予定額</p>
                    <p className="mt-1 text-base font-bold text-blue-700">
                      {formatYen(parentSummary.provisionalPayout)}
                    </p>
                  </div>

                  <div className="rounded-lg border bg-white p-3">
                    <p className="text-xs text-gray-500">振込状態</p>
                    <div className="mt-2">
                      {renderPayoutAction(parent.id, parentSummary.provisionalPayout)}
                    </div>
                    {parentPayout?.status === "pending" ? (
                      <div className="mt-2 text-xs text-gray-500">
                        振込予定額: {formatYen(parentPayout.amount || 0)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  ※ 精算書は手数料 3.0% 表示です。決済会社原価は表示しません。
                </div>

                <div className="ml-6 mt-4 space-y-3">
                  {visibleChildren.length === 0 ? (
                    <p className="text-xs text-gray-400">表示対象の子代理店なし</p>
                  ) : (
                    visibleChildren.map((child) => {
                      const childSummary = calc(child.id);
                      const childPayout = getPayout(child.id);

                      return (
                        <div
                          key={child.id}
                          className="rounded-lg border-l-4 border-blue-400 bg-gray-50 p-3"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                └ {child.agency_name || "名称未設定"}
                              </p>

                              <p className="mt-1 text-xs text-gray-500">
                                売上 {formatYen(childSummary.sales)} / 未回収{" "}
                                {formatYen(childSummary.unpaid)} / 回収率 {childSummary.rate}%
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void handleOpenSettlement(child.id)}
                                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white"
                              >
                                精算書出力
                              </button>

                              <Link
                                href={`/dashboard/agency/${child.id}`}
                                className="inline-flex rounded-lg border px-3 py-2 text-xs font-medium text-gray-700"
                              >
                                詳細を見る
                              </Link>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 md:grid-cols-5">
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-[11px] text-gray-500">前月回収額</p>
                              <p className="mt-1 text-sm font-bold text-gray-900">
                                {formatYen(childSummary.previousMonthPaidAmount)}
                              </p>
                            </div>

                            <div className="rounded-lg bg-white p-2">
                              <p className="text-[11px] text-gray-500">月額利用料</p>
                              <p className="mt-1 text-sm font-bold text-gray-900">
                                {formatYen(childSummary.systemFee)}
                              </p>
                            </div>

                            <div className="rounded-lg bg-white p-2">
                              <p className="text-[11px] text-gray-500">
                                手数料 3.0%
                              </p>
                              <p className="mt-1 text-sm font-bold text-gray-900">
                                {formatYen(childSummary.settlementFee)}
                              </p>
                            </div>

                            <div className="rounded-lg bg-blue-50 p-2">
                              <p className="text-[11px] text-blue-600">仮振込予定額</p>
                              <p className="mt-1 text-sm font-bold text-blue-700">
                                {formatYen(childSummary.provisionalPayout)}
                              </p>
                            </div>

                            <div className="rounded-lg border bg-white p-2">
                              <p className="text-[11px] text-gray-500">振込状態</p>
                              <div className="mt-2">
                                {renderPayoutAction(child.id, childSummary.provisionalPayout)}
                              </div>
                              {childPayout?.status === "pending" ? (
                                <div className="mt-2 text-[11px] text-gray-500">
                                  振込予定額: {formatYen(childPayout.amount || 0)}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-2 text-[11px] text-gray-500">
                            ※ 精算書は手数料 3.0% 表示です
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}