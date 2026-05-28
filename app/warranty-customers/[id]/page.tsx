import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    id: string;
  };
};

type WarrantyCustomer = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  created_at: string | null;
};

type WarrantyInvoice = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  payment_due_date: string | null;
  paid_at: string | null;
  subject: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  total_amount: number | null;
  status: string | null;
};
type RepairRequest = {
  id: string;
  request_no: string | null;
  customer_name: string | null;
  phone: string | null;
  product_name: string | null;
  manufacturer: string | null;
  model_no: string | null;
  symptom_detail: string | null;
  status: string | null;
  created_at: string | null;
};
type WarrantyCertificate = {
  id: string;
  certificate_no: string | null;
  product_name: string | null;
  manufacturer: string | null;
  model_no: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  customer_phone: string | null;
  customer_email: string | null;
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

function formatYen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "draft":
      return "下書き";
    case "issued":
      return "発行済み";
    case "unpaid":
      return "未入金";
    case "overdue":
      return "期限超過";
    case "paid":
      return "入金済み";
    case "cancelled":
      return "取消";
    default:
      return status || "未設定";
  }
}

function statusClass(status: string | null | undefined) {
  switch (status) {
    case "paid":
      return "border-green-200 bg-green-50 text-green-700";
    case "overdue":
      return "border-red-200 bg-red-50 text-red-700";
    case "unpaid":
    case "issued":
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    case "cancelled":
      return "border-gray-200 bg-gray-50 text-gray-700";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

export default async function WarrantyCustomerDetailPage({ params }: Props) {
  const supabase = getAdminClient();

  const { data: customer, error: customerError } = await supabase
    .from("warranty_customers")
    .select("*")
    .eq("id", params.id)
    .single();

  if (customerError || !customer) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          顧客情報が見つかりません。
        </div>

        <Link
          href="/warranty-customers"
          className="mt-4 inline-block rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          顧客一覧へ戻る
        </Link>
      </div>
    );
  }

  const currentCustomer = customer as WarrantyCustomer;

  let invoices: WarrantyInvoice[] = [];
let repairRequests: RepairRequest[] = [];
let certificates: WarrantyCertificate[] = [];
  if (currentCustomer.email) {
    const { data } = await supabase
      .from("warranty_invoices")
      .select(
        "id, invoice_no, invoice_date, payment_due_date, paid_at, subject, bill_to_company_name, bill_to_name, bill_to_email, total_amount, status"
      )
      .eq("bill_to_email", currentCustomer.email)
      .order("created_at", { ascending: false });

    invoices = (data || []) as WarrantyInvoice[];
  }
if (currentCustomer.phone) {
  const { data } = await supabase
    .from("repair_requests")
    .select(
      "id, request_no, customer_name, phone, product_name, manufacturer, model_no, symptom_detail, status, created_at"
    )
    .eq("phone", currentCustomer.phone)
    .order("created_at", { ascending: false });

  repairRequests = (data || []) as RepairRequest[];
}
if (currentCustomer.phone || currentCustomer.email) {
  const query = supabase
    .from("warranty_certificates")
    .select(
      "id, certificate_no, product_name, manufacturer, model_no, start_date, end_date, status, customer_phone, customer_email"
    )
    .order("created_at", { ascending: false });

  let data = null;

  if (currentCustomer.phone) {
    const result = await query.eq(
      "customer_phone",
      currentCustomer.phone
    );

    data = result.data;
  } else if (currentCustomer.email) {
    const result = await query.eq(
      "customer_email",
      currentCustomer.email
    );

    data = result.data;
  }

  certificates = (data || []) as WarrantyCertificate[];
}
  const unpaidInvoices = invoices.filter((invoice) =>
    ["issued", "unpaid", "overdue", "draft", null, undefined].includes(
      invoice.status
    )
  );

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const overdueInvoices = invoices.filter((invoice) => {
    if (invoice.status === "overdue") return true;
    if (!invoice.payment_due_date) return false;
    if (invoice.status === "paid") return false;

    return new Date(invoice.payment_due_date).getTime() < new Date().getTime();
  });

  const unpaidTotal = unpaidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount || 0),
    0
  );

  const paidTotal = paidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount || 0),
    0
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">顧客詳細</h1>
          <p className="mt-1 text-sm text-gray-500">
            顧客情報・請求履歴・入金状況を確認できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/warranty-customers"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            顧客一覧へ
          </Link>

          <Link
            href="/warranty-invoices/new"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            請求書作成へ
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">請求件数</div>
          <div className="mt-2 text-3xl font-bold">{invoices.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未入金合計</div>
          <div className="mt-2 text-2xl font-bold text-red-600">
            {formatYen(unpaidTotal)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">入金済合計</div>
          <div className="mt-2 text-2xl font-bold text-green-700">
            {formatYen(paidTotal)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">期限超過</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {overdueInvoices.length}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">基本情報</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs text-gray-500">会社名</div>
            <div className="mt-1 font-medium">
              {currentCustomer.company_name || "-"}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500">担当者名</div>
            <div className="mt-1 font-medium">
              {currentCustomer.contact_name || "-"}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500">メール</div>
            <div className="mt-1 font-medium">{currentCustomer.email || "-"}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">電話番号</div>
            <div className="mt-1 font-medium">{currentCustomer.phone || "-"}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">郵便番号</div>
            <div className="mt-1 font-medium">
              {currentCustomer.postal_code || "-"}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500">登録日</div>
            <div className="mt-1 font-medium">
              {formatDate(currentCustomer.created_at)}
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-gray-500">住所</div>
            <div className="mt-1 font-medium">
              {currentCustomer.address || "-"}
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-gray-500">メモ</div>
            <div className="mt-1 whitespace-pre-wrap font-medium">
              {currentCustomer.note || "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold">請求履歴</h2>
          <p className="mt-1 text-sm text-gray-500">
            メールアドレスが一致する請求書を表示しています。
          </p>
        </div>

        {invoices.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            この顧客に紐づく請求書はありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">請求書番号</th>
                  <th className="px-4 py-3 font-medium">請求日</th>
                  <th className="px-4 py-3 font-medium">件名</th>
                  <th className="px-4 py-3 font-medium">請求額</th>
                  <th className="px-4 py-3 font-medium">支払期限</th>
                  <th className="px-4 py-3 font-medium">入金日</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                  
                </tr>
              </thead>

              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {invoice.invoice_no || "-"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(invoice.invoice_date)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {invoice.subject || "-"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      {formatYen(invoice.total_amount)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(invoice.payment_due_date)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(invoice.paid_at)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                          invoice.status
                        )}`}
                      >
                        {statusLabel(invoice.status)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/warranty-invoices/${invoice.id}`}
                        className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
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
       
<div className="rounded-2xl border bg-white shadow-sm">
  <div className="border-b px-5 py-4">
    <h2 className="text-lg font-semibold">保証書履歴</h2>

    <p className="mt-1 text-sm text-gray-500">
      電話番号またはメールアドレスが一致する保証書を表示しています。
    </p>
  </div>

  {certificates.length === 0 ? (
    <div className="p-6 text-sm text-gray-500">
      保証書履歴はありません。
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">保証書番号</th>
            <th className="px-4 py-3 font-medium">商品名</th>
            <th className="px-4 py-3 font-medium">メーカー</th>
            <th className="px-4 py-3 font-medium">型番</th>
            <th className="px-4 py-3 font-medium">保証開始</th>
            <th className="px-4 py-3 font-medium">保証終了</th>
            <th className="px-4 py-3 font-medium">状態</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>

        <tbody>
          {certificates.map((certificate) => (
            <tr
              key={certificate.id}
              className="border-t hover:bg-gray-50"
            >
              <td className="whitespace-nowrap px-4 py-3 font-medium">
                {certificate.certificate_no || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {certificate.product_name || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {certificate.manufacturer || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {certificate.model_no || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {formatDate(certificate.start_date)}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {formatDate(certificate.end_date)}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {certificate.status || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                <Link
                  href={`/warranty-certificates/${certificate.id}`}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
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
 
        <div className="rounded-2xl border bg-white shadow-sm">
  <div className="border-b px-5 py-4">
    <h2 className="text-lg font-semibold">修理履歴</h2>

    <p className="mt-1 text-sm text-gray-500">
      電話番号が一致する修理受付履歴を表示しています。
    </p>
  </div>

  {repairRequests.length === 0 ? (
    <div className="p-6 text-sm text-gray-500">
      修理履歴はありません。
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">受付番号</th>
            <th className="px-4 py-3 font-medium">商品名</th>
            <th className="px-4 py-3 font-medium">メーカー</th>
            <th className="px-4 py-3 font-medium">型番</th>
            <th className="px-4 py-3 font-medium">症状</th>
            <th className="px-4 py-3 font-medium">状態</th>
            <th className="px-4 py-3 font-medium">受付日</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>

        <tbody>
          {repairRequests.map((repair) => (
            <tr
              key={repair.id}
              className="border-t hover:bg-gray-50"
            >
              <td className="whitespace-nowrap px-4 py-3 font-medium">
                {repair.request_no || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {repair.product_name || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {repair.manufacturer || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {repair.model_no || "-"}
              </td>

              <td className="min-w-[240px] px-4 py-3">
                {repair.symptom_detail || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {repair.status || "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                {formatDate(repair.created_at)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
  <Link
    href={`/repair-requests/${repair.id}`}
    className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
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
    </div>
  );
}