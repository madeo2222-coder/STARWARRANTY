import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RepairRequestRow = {
  id: string;
  status: string;
  assigned_to: string | null;
};

type WarrantyInvoiceRow = {
  id: string;
  total_amount: number | null;
  invoice_date: string | null;
  payment_due_date: string | null;
  status: string | null;
};

type WarrantyInvoiceSendLogRow = {
  id: string;
  send_type: string | null;
  sent_at: string | null;
};

const mainCards = [
  {
    title: "保証書管理",
    description: "保証書の一覧確認、新規作成、今後のPDF発行へ進みます",
    href: "/warranty-certificates",
    icon: "📘",
  },
  {
    title: "修理受付管理",
    description: "お客様からの修理依頼を確認し、対応状況を管理します",
    href: "/repair-requests",
    icon: "🛠️",
  },
  {
    title: "請求書管理",
    description: "請求書の一覧確認、新規作成、PDF発行準備へ進みます",
    href: "/warranty-invoices",
    icon: "🧾",
  },
  {
    title: "本部管理",
    description: "本部情報、ロゴ、管理導線を確認・更新します",
    href: "/headquarters",
    icon: "🏢",
  },
];

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function isActiveStatus(status: string) {
  return !["completed", "out_of_warranty", "cancelled"].includes(status);
}

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function isToday(value: string | null) {
  if (!value) return false;

  const target = new Date(value);
  const now = new Date();

  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  );
}

export default async function HomePage() {
  let repairRows: RepairRequestRow[] = [];
  let repairErrorMessage = "";

  let invoiceRows: WarrantyInvoiceRow[] = [];
  let invoiceErrorMessage = "";

  let sendLogRows: WarrantyInvoiceSendLogRow[] = [];
  let sendLogErrorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("repair_requests")
      .select("id, status, assigned_to");

    if (error) {
      repairErrorMessage = error.message;
    } else {
      repairRows = (data || []) as RepairRequestRow[];
    }
  } catch (error) {
    repairErrorMessage =
      error instanceof Error ? error.message : "修理受付の集計取得に失敗しました";
  }

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_invoices")
      .select("id, total_amount, invoice_date, payment_due_date, status");

    if (error) {
      invoiceErrorMessage = error.message;
    } else {
      invoiceRows = (data || []) as WarrantyInvoiceRow[];
    }
  } catch (error) {
    invoiceErrorMessage =
      error instanceof Error ? error.message : "請求書集計取得に失敗しました";
  }

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_invoice_send_logs")
      .select("id, send_type, sent_at");

    if (error) {
      sendLogErrorMessage = error.message;
    } else {
      sendLogRows = (data || []) as WarrantyInvoiceSendLogRow[];
    }
  } catch (error) {
    sendLogErrorMessage =
      error instanceof Error ? error.message : "送信履歴集計取得に失敗しました";
  }

  const activeRows = repairRows.filter((row) => isActiveStatus(row.status));
  const completedRows = repairRows.filter((row) => row.status === "completed");
  const closedRows = repairRows.filter((row) =>
    ["out_of_warranty", "cancelled"].includes(row.status)
  );
  const unassignedRows = activeRows.filter((row) => !row.assigned_to);

  const unpaidInvoices = invoiceRows.filter((invoice) =>
    ["issued", "unpaid", "draft", null, undefined].includes(invoice.status)
  );

  const overdueInvoices = unpaidInvoices.filter((invoice) => {
    if (!invoice.payment_due_date) return false;

    return (
      new Date(invoice.payment_due_date).getTime() < new Date().getTime()
    );
  });

  const currentMonth = `${new Date().getFullYear()}-${String(
    new Date().getMonth() + 1
  ).padStart(2, "0")}`;

  const currentMonthInvoiceTotal = invoiceRows
    .filter((invoice) => (invoice.invoice_date || "").startsWith(currentMonth))
    .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);

  const unpaidInvoiceTotal = unpaidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount || 0),
    0
  );
const paidInvoices = invoiceRows.filter((invoice) => invoice.status === "paid");

const paidInvoiceTotal = paidInvoices.reduce(
  (sum, invoice) => sum + Number(invoice.total_amount || 0),
  0
);
  const todayReminderSendCount = sendLogRows.filter(
    (log) =>
      isToday(log.sent_at) &&
      ["reminder", "auto_reminder"].includes(log.send_type || "")
  ).length;
const totalInvoiceAmount = invoiceRows.reduce(
  (sum, invoice) => sum + Number(invoice.total_amount || 0),
  0
);

const collectionRate =
  totalInvoiceAmount === 0
    ? 0
    : (paidInvoiceTotal / totalInvoiceAmount) * 100;

const unpaidRate =
  totalInvoiceAmount === 0
    ? 0
    : (unpaidInvoiceTotal / totalInvoiceAmount) * 100;

const overdueRate =
  unpaidInvoices.length === 0
    ? 0
    : (overdueInvoices.length / unpaidInvoices.length) * 100;
  const autoReminderSendCount = sendLogRows.filter((log) =>
  (log.send_type || "").startsWith("auto_reminder")
).length;

  const monthlyInvoiceMap = new Map<string, number>();

  invoiceRows.forEach((invoice) => {
    if (!invoice.invoice_date) return;

    const month = invoice.invoice_date.slice(0, 7);
    const current = monthlyInvoiceMap.get(month) || 0;

    monthlyInvoiceMap.set(month, current + Number(invoice.total_amount || 0));
  });

  const monthlyInvoices = Array.from(monthlyInvoiceMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6);

  const maxInvoiceAmount = Math.max(
    ...monthlyInvoices.map(([, amount]) => amount),
    1
  );

  const monthlyPaidMap = new Map<string, number>();

  invoiceRows.forEach((invoice) => {
    if (invoice.status !== "paid") return;
    if (!invoice.invoice_date) return;

    const month = invoice.invoice_date.slice(0, 7);
    const current = monthlyPaidMap.get(month) || 0;

    monthlyPaidMap.set(month, current + Number(invoice.total_amount || 0));
  });

  const monthlyPaidInvoices = Array.from(monthlyPaidMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6);

  const maxPaidAmount = Math.max(
    ...monthlyPaidInvoices.map(([, amount]) => amount),
    1
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">STAR WARRANTY</p>
        <h1 className="mt-1 text-3xl font-bold">保証管理ホーム</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          保証書の登録、修理受付の管理、請求書の作成を行うためのホーム画面です。
          StarWarranty 用の業務導線に切り替えています。
        </p>
      </div>

      {repairErrorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          修理受付の集計取得に失敗しました: {repairErrorMessage}
        </div>
      ) : null}

      {invoiceErrorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          請求書集計取得に失敗しました: {invoiceErrorMessage}
        </div>
      ) : null}

      {sendLogErrorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          送信履歴集計取得に失敗しました: {sendLogErrorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">修理受付サマリー</h2>
            <p className="mt-1 text-sm text-gray-500">
              現在の修理受付状況を確認できます。
            </p>
          </div>

          <Link
            href="/repair-requests"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            修理受付管理へ
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">全受付</div>
            <div className="mt-2 text-3xl font-bold">{repairRows.length}</div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">対応中</div>
            <div className="mt-2 text-3xl font-bold">{activeRows.length}</div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">未担当</div>
            <div className="mt-2 text-3xl font-bold">{unassignedRows.length}</div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">修理完了</div>
            <div className="mt-2 text-3xl font-bold">{completedRows.length}</div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">対象外・キャンセル</div>
            <div className="mt-2 text-3xl font-bold">{closedRows.length}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">請求書サマリー</h2>
            <p className="mt-1 text-sm text-gray-500">
              請求・未入金・期限超過状況を確認できます。
            </p>
          </div>

          <Link
            href="/warranty-invoices"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            請求書管理へ
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-6">
          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">未入金件数</div>
            <div className="mt-2 text-3xl font-bold">{unpaidInvoices.length}</div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">未入金合計</div>
            <div className="mt-2 text-2xl font-bold text-red-600">
              {formatYen(unpaidInvoiceTotal)}
            </div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">期限超過</div>
            <div className="mt-2 text-3xl font-bold text-red-600">
              {overdueInvoices.length}
            </div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">今月請求額</div>
            <div className="mt-2 text-2xl font-bold">
              {formatYen(currentMonthInvoiceTotal)}
            </div>
          </div>
<div className="rounded-2xl border bg-gray-50 p-5">
  <div className="text-sm text-gray-500">入金済件数</div>
  <div className="mt-2 text-3xl font-bold text-green-700">
    {paidInvoices.length}
  </div>
</div>

<div className="rounded-2xl border bg-gray-50 p-5">
  <div className="text-sm text-gray-500">入金済合計</div>
  <div className="mt-2 text-2xl font-bold text-green-700">
    {formatYen(paidInvoiceTotal)}
  </div>
</div>

</div>
<div className="mt-8 grid gap-4 md:grid-cols-3">
  <div className="rounded-2xl border bg-green-50 p-5">
    <div className="text-sm text-green-700">回収率</div>
    <div className="mt-2 text-3xl font-bold text-green-700">
      {collectionRate.toFixed(1)}%
    </div>
  </div>

  <div className="rounded-2xl border bg-yellow-50 p-5">
    <div className="text-sm text-yellow-700">未回収率</div>
    <div className="mt-2 text-3xl font-bold text-yellow-700">
      {unpaidRate.toFixed(1)}%
    </div>
  </div>

  <div className="rounded-2xl border bg-red-50 p-5">
    <div className="text-sm text-red-700">期限超過率</div>
    <div className="mt-2 text-3xl font-bold text-red-700">
      {overdueRate.toFixed(1)}%
    </div>
  </div>
</div>
<div className="mt-8 grid gap-4 md:grid-cols-3">
          <Link
            href="/reminder-targets"
            className="rounded-2xl border bg-red-50 p-5 transition hover:bg-red-100"
          >
            <div className="text-sm text-red-700">催促対象件数</div>
            <div className="mt-2 text-3xl font-bold text-red-700">
              {overdueInvoices.length}
            </div>
            <div className="mt-3 text-sm font-medium text-red-700">
              督促対象一覧へ →
            </div>
          </Link>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">本日催促送信</div>
            <div className="mt-2 text-3xl font-bold">
              {todayReminderSendCount}
            </div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <div className="text-sm text-gray-500">自動催促累計</div>
            <div className="mt-2 text-3xl font-bold">
              {autoReminderSendCount}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">月別請求推移</h3>
            <div className="text-xs text-gray-500">直近6ヶ月</div>
          </div>

          {monthlyInvoices.length === 0 ? (
            <div className="rounded-xl border bg-gray-50 p-5 text-sm text-gray-500">
              月別請求データはありません。
            </div>
          ) : (
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {monthlyInvoices.map(([month, amount]) => {
                const height = Math.max(24, (amount / maxInvoiceAmount) * 220);

                return (
                  <div
                    key={month}
                    className="flex min-w-[80px] flex-col items-center"
                  >
                    <div className="mb-2 text-xs text-gray-500">
                      {formatYen(amount)}
                    </div>

                    <div
                      className="w-full rounded-t-xl bg-blue-600 transition-all"
                      style={{ height: `${height}px` }}
                    />

                    <div className="mt-2 text-xs font-medium">{month}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">月別入金推移</h3>
            <div className="text-xs text-gray-500">入金済みのみ</div>
          </div>

          {monthlyPaidInvoices.length === 0 ? (
            <div className="rounded-xl border bg-gray-50 p-5 text-sm text-gray-500">
              月別入金データはありません。
            </div>
          ) : (
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {monthlyPaidInvoices.map(([month, amount]) => {
                const height = Math.max(24, (amount / maxPaidAmount) * 220);

                return (
                  <div
                    key={month}
                    className="flex min-w-[80px] flex-col items-center"
                  >
                    <div className="mb-2 text-xs text-gray-500">
                      {formatYen(amount)}
                    </div>

                    <div
                      className="w-full rounded-t-xl bg-green-600 transition-all"
                      style={{ height: `${height}px` }}
                    />

                    <div className="mt-2 text-xs font-medium">{month}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mainCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-3xl">{card.icon}</div>
            <h2 className="mt-3 text-lg font-bold">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {card.description}
            </p>
            <div className="mt-4 text-sm font-medium text-blue-600">開く →</div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">現在の開発状況</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">保証書</div>
            <div className="mt-2 text-base font-semibold">
              一覧・新規作成・PDF導線を整備中
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">修理受付</div>
            <div className="mt-2 text-base font-semibold">
              受付・進捗確認・写真・履歴・集計まで対応
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-gray-500">請求書</div>
            <div className="mt-2 text-base font-semibold">
              作成・PDF・メール送信・督促・入金管理まで対応
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}