import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ReminderTargetRow = {
  id: string;
  invoice_no: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
  status: string | null;
};

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL が設定されていません"
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が設定されていません"
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey
  );
}

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString(
    "ja-JP"
  );
}

function getOverdueDays(
  paymentDueDate: string | null
) {
  if (!paymentDueDate) return 0;

  const due = new Date(paymentDueDate);
  const now = new Date();

  const diff =
    now.getTime() - due.getTime();

  return Math.floor(
    diff / (1000 * 60 * 60 * 24)
  );
}

export default async function ReminderTargetsPage() {
  let rows: ReminderTargetRow[] = [];
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
          total_amount,
          payment_due_date,
          status
        `
      )
      .in("status", [
        "issued",
        "unpaid",
      ])
      .order("payment_due_date", {
        ascending: true,
      });

    if (error) {
      errorMessage = error.message;
    } else {
      rows = (data || []).filter((row) => {
        if (!row.payment_due_date)
          return false;

        return (
          new Date(
            row.payment_due_date
          ).getTime() <
          new Date().getTime()
        );
      }) as ReminderTargetRow[];
    }
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "取得に失敗しました";
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">
            STAR WARRANTY
          </p>

          <h1 className="text-2xl font-bold">
            督促対象一覧
          </h1>

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

      <div className="rounded-2xl border bg-white shadow-sm">
        {errorMessage ? (
          <div className="p-6 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            督促対象はありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">
                    超過日数
                  </th>

                  <th className="px-4 py-3 text-left font-medium">
                    請求番号
                  </th>

                  <th className="px-4 py-3 text-left font-medium">
                    請求先
                  </th>

                  <th className="px-4 py-3 text-right font-medium">
                    金額
                  </th>

                  <th className="px-4 py-3 text-left font-medium">
                    支払期限
                  </th>

                  <th className="px-4 py-3 text-center font-medium">
                    詳細
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const overdueDays =
                    getOverdueDays(
                      row.payment_due_date
                    );

                  return (
                    <tr
                      key={row.id}
                      className="border-t"
                    >
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                          {overdueDays}日超過
                        </span>
                      </td>

                      <td className="px-4 py-4 font-medium">
                        {row.invoice_no || "-"}
                      </td>

                      <td className="px-4 py-4">
                        {row.bill_to_company_name ||
                          row.bill_to_name ||
                          "-"}
                      </td>

                      <td className="px-4 py-4 text-right font-semibold">
                        {formatYen(
                          Number(
                            row.total_amount || 0
                          )
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {formatDate(
                          row.payment_due_date
                        )}
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