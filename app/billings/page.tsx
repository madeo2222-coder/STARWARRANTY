import { createClient } from "@/lib/supabase/server";
import {
  getCurrentProfile,
  type CurrentProfile,
} from "@/lib/auth/getCurrentProfile";
import BillingActionsClient from "./BillingActionsClient";

export const dynamic = "force-dynamic";

type AgencyRow = {
  id: string;
  name: string | null;
  agency_name?: string | null;
  parent_agency_id: string | null;
};

type BillingRow = {
  id: string;
  customer_id: string | null;
  amount: number | null;
  status: string | null;
  billing_month: string | null;
  paid_date: string | null;
  due_date: string | null;
  customers: {
    id: string;
    company_name: string | null;
    agency_id: string | null;
    agencies: {
      id: string;
      name: string | null;
      agency_name?: string | null;
      parent_agency_id: string | null;
    } | null;
  } | null;
};

function toBillingRows(value: unknown): BillingRow[] {
  if (!Array.isArray(value)) return [];
  return value as BillingRow[];
}

async function resolveVisibleAgencyIds(
  profile: CurrentProfile | null
): Promise<string[] | null> {
  if (!profile) return [];

  if (profile.role === "headquarters") {
    return null;
  }

  if (!profile.agency_id) {
    return [];
  }

  if (profile.role === "sub_agency") {
    return [profile.agency_id];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agencies")
    .select("id,name,agency_name,parent_agency_id")
    .eq("parent_agency_id", profile.agency_id);

  if (error) {
    console.error("resolveVisibleAgencyIds error:", error);
    return [];
  }

  const children = (Array.isArray(data) ? data : []) as AgencyRow[];
  return [profile.agency_id, ...children.map((row) => row.id)];
}

async function loadBillings(profile: CurrentProfile | null) {
  const supabase = await createClient();
  const visibleAgencyIds = await resolveVisibleAgencyIds(profile);

  const { data, error } = await supabase
    .from("billings")
    .select(
      `
      id,
      customer_id,
      amount,
      status,
      billing_month,
      paid_date,
      due_date,
      customers:customer_id (
        id,
        company_name,
        agency_id,
        agencies:agency_id (
          id,
          name,
          agency_name,
          parent_agency_id
        )
      )
    `
    )
    .order("billing_month", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = toBillingRows(data);

  if (!profile) {
    return {
      rows: [],
      visibleAgencyIds: [] as string[],
    };
  }

  if (profile.role === "headquarters") {
    return {
      rows,
      visibleAgencyIds: [] as string[],
    };
  }

  const filtered = rows.filter((row) => {
    const agencyId = row.customers?.agency_id ?? null;
    if (!agencyId) return false;
    return (visibleAgencyIds ?? []).includes(agencyId);
  });

  return {
    rows: filtered,
    visibleAgencyIds: visibleAgencyIds ?? [],
  };
}

function yen(value: number | null | undefined) {
  return `¥${Number(value ?? 0).toLocaleString()}`;
}

function agencyLabel(row: BillingRow) {
  return (
    row.customers?.agencies?.name ||
    row.customers?.agencies?.agency_name ||
    row.customers?.agency_id ||
    "-"
  );
}

function badgeClass(status: string | null) {
  if (status === "paid") {
    return "bg-green-100 text-green-700";
  }
  if (status === "pending") {
    return "bg-yellow-100 text-yellow-700";
  }
  if (status === "failed") {
    return "bg-red-100 text-red-700";
  }
  return "bg-gray-100 text-gray-600";
}

function statusLabel(status: string | null) {
  if (status === "paid") return "回収済";
  if (status === "pending") return "未回収";
  if (status === "failed") return "回収不能";
  return status ?? "-";
}

export default async function BillingsPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <div className="p-4 pb-24">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          プロフィールを取得できませんでした。ログイン状態を確認してください。
        </div>
      </div>
    );
  }

  try {
    const { rows, visibleAgencyIds } = await loadBillings(profile);

    const totalAmount = rows.reduce((sum, row) => {
      return sum + Number(row.amount ?? 0);
    }, 0);

    const pendingAmount = rows
      .filter((row) => row.status === "pending")
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    const paidAmount = rows
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    const failedAmount = rows
      .filter((row) => row.status === "failed")
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    return (
      <div className="p-4 pb-24 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">請求一覧</h1>
          <p className="text-sm text-gray-500">
            権限: <span className="font-semibold">{profile.role}</span>
            {profile.agency_id ? (
              <>
                {" "}
                / agency_id:{" "}
                <span className="font-semibold">{profile.agency_id}</span>
              </>
            ) : null}
          </p>
          <p className="text-sm text-gray-500">
            請求書・領収書の印刷 / PDF保存 / メール送信用データ出力に対応
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">請求件数</p>
            <p className="mt-2 text-2xl font-bold">{rows.length}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">総請求額</p>
            <p className="mt-2 text-2xl font-bold">{yen(totalAmount)}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">未回収</p>
            <p className="mt-2 text-2xl font-bold">{yen(pendingAmount)}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">回収済</p>
            <p className="mt-2 text-2xl font-bold">{yen(paidAmount)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">回収不能</p>
            <p className="mt-2 text-2xl font-bold">{yen(failedAmount)}</p>
          </div>

          {profile.role !== "headquarters" && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold">表示対象代理店ID</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {visibleAgencyIds.length > 0 ? (
                  visibleAgencyIds.map((id) => (
                    <span
                      key={id}
                      className="rounded-full border px-3 py-1 text-xs text-gray-700"
                    >
                      {id}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">対象なし</span>
                )}
              </div>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
            表示できる請求データがありません。
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">請求月</th>
                  <th className="px-4 py-3 font-semibold">顧客名</th>
                  <th className="px-4 py-3 font-semibold">代理店</th>
                  <th className="px-4 py-3 font-semibold">金額</th>
                  <th className="px-4 py-3 font-semibold">ステータス</th>
                  <th className="px-4 py-3 font-semibold">支払期限</th>
                  <th className="px-4 py-3 font-semibold">入金日</th>
                  <th className="px-4 py-3 font-semibold">帳票</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const canReceipt = Boolean(row.paid_date);

                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.billing_month ?? "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.customers?.company_name ?? "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {agencyLabel(row)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {yen(row.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass(
                            row.status
                          )}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.due_date ?? "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.paid_date ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <BillingActionsClient
                          billingId={row.id}
                          canReceipt={canReceipt}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("billings page error:", error);

    return (
      <div className="p-4 pb-24">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          請求一覧の取得に失敗しました。
        </div>
      </div>
    );
  }
}