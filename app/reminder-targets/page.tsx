import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ReminderTargetRow = {
  id: string;
  invoice_no: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
  status: string | null;
};

type SendLogRow = {
  id: string;
  invoice_id: string | null;
  send_type: string | null;
  sent_at: string | null;
};

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

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("ja-JP");
}

function getOverdueDays(paymentDueDate: string | null) {
  if (!paymentDueDate) return 0;

  const due = new Date(paymentDueDate);
  const now = new Date();
  const diff = now.getTime() - due.getTime();

  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getReminderStatus(invoiceId: string, logs: SendLogRow[]) {
  const invoiceLogs = logs.filter((log) => log.invoice_id === invoiceId);

  if (invoiceLogs.some((log) => log.send_type === "auto_reminder_3")) {
    return "最終督促済";
  }

  if (invoiceLogs.some((log) => log.send_type === "auto_reminder_2")) {
    return "再督促済";
  }

  if (invoiceLogs.some((log) => log.send_type === "auto_reminder_1")) {
    return "初回督促済";
  }

  return "未送信";
}

function getPriority(row: ReminderTargetRow) {
  const overdueDays = getOverdueDays(row.payment_due_date);

  if (!row.bill_to_email) {
    return {
      label: "メール未設定",
      className: "bg-red-100 text-red-700",
    };
  }

  if (overdueDays >= 14) {
    return {
      label: "最優先",
      className: "bg-red-100 text-red-700",
    };
  }

  if (overdueDays >= 7) {
    return {
      label: "要対応",
      className: "bg-yellow-100 text-yellow-700",
    };
  }

  return {
    label: "通常",
    className: "bg-gray-100 text-gray-700",
  };
}

function getReminderStatusClass(status: string) {
  switch (status) {
    case "最終督促済":
      return "bg-red-100 text-red-700";
    case "再督促済":
      return "bg-orange-100 text-orange-700";
    case "初回督促済":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default async function ReminderTargetsPage() {
  let rows: ReminderTargetRow[] = [];
  let sendLogs: SendLogRow[] = [];
  let errorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_invoices")
      .select(
        `
          id,
          invoice_no,
          bill_to_company_name,
          bill_to_name,
          bill_to_email,
          total_amount,
          payment_due_date,
          status
        `
      )
      .in("status", ["issued", "unpaid"])
      .order("payment_due_date", {
        ascending: true,
      });

    if (error) {
      errorMessage = error.message;
    } else {
      rows = (data || []).filter((row) => {
        if (!row.payment_due_date) return false;

        return new Date(row.payment_due_date).getTime() < new Date().getTime();
      }) as ReminderTargetRow[];
    }

    const { data: logsData, error: logsError } = await supabase
      .from("warranty_invoice_send_logs")
      .select("id, invoice_id, send_type, sent_at")
      .in("send_type", [
        "auto_reminder_1",
        "auto_reminder_2",
        "auto_reminder_3",
      ]);

    if (logsError) {
      errorMessage = logsError.message;
    } else {
      sendLogs = (logsData || []) as SendLogRow[];
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "取得に失敗しました";
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>

          <h1 className="text-2xl font-bold">督促対象一覧</h1>

          <p className="mt-1 text-sm text-gray-500">
            支払期限を超過している請求書一覧です。
          </p>
        </div>

        <Link
          href="/"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          ホームへ戻る
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">督促対象</div>
          <div className="mt-2 text-3xl font-bold">{rows.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">メール未設定</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {rows.filter((row) => !row.bill_to_email).length}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">7日以上超過</div>
          <div className="mt-2 text-3xl font-bold text-yellow-600">
            {
              rows.filter((row) => getOverdueDays(row.payment_due_date) >= 7)
                .length
            }
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">14日以上超過</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {
              rows.filter((row) => getOverdueDays(row.payment_due_date) >= 14)
                .length
            }
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        {errorMessage ? (
          <div className="p-6 text-sm text-red-600">{errorMessage}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            督促対象はありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">優先度</th>

                  <th className="px-4 py-3 text-left font-medium">
                    超過日数
                  </th>

                  <th className="px-4 py-3 text-left font-medium">
                    請求番号
                  </th>

                  <th className="px-4 py-3 text-left font-medium">請求先</th>

                  <th className="px-4 py-3 text-left font-medium">
                    メール
                  </th>

                  <th className="px-4 py-3 text-left font-medium">
                    督促状況
                  </th>

                  <th className="px-4 py-3 text-right font-medium">金額</th>

                  <th className="px-4 py-3 text-left font-medium">
                    支払期限
                  </th>

                  <th className="px-4 py-3 text-center font-medium">詳細</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const overdueDays = getOverdueDays(row.payment_due_date);
                  const priority = getPriority(row);
                  const reminderStatus = getReminderStatus(row.id, sendLogs);

                  return (
                    <tr key={row.id} className="border-t">
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${priority.className}`}
                        >
                          {priority.label}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                          {overdueDays}日超過
                        </span>
                      </td>

                      <td className="px-4 py-4 font-medium">
                        {row.invoice_no || "-"}
                      </td>

                      <td className="px-4 py-4">
                        {row.bill_to_company_name || row.bill_to_name || "-"}
                      </td>

                      <td className="px-4 py-4">
                        {row.bill_to_email ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                            登録あり
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                            未設定
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getReminderStatusClass(
                            reminderStatus
                          )}`}
                        >
                          {reminderStatus}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right font-semibold">
                        {formatYen(Number(row.total_amount || 0))}
                      </td>

                      <td className="px-4 py-4">
                        {formatDate(row.payment_due_date)}
                      </td>

                      <td className="px-4 py-4 text-center">
                        <Link
                          href={`/warranty-invoices/${row.id}`}
                          className="rounded-lg bg-black px-3 py-2 text-xs text-white hover:opacity-90"
                        >
                          詳細
                        </Link>
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
  );
}