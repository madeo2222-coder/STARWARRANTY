import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import WarrantyInvoicesTable from "./WarrantyInvoicesTable";

export const dynamic = "force-dynamic";

type WarrantyInvoiceRow = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  subject: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
  status: string | null;
  created_at: string | null;
  last_invoice_sent_at: string | null;
  last_reminder_sent_at: string | null;
};

type SendLogRow = {
  invoice_id: string | null;
  send_type: string | null;
  sent_at: string | null;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");

  return createClient(supabaseUrl, serviceRoleKey);
}

function formatYen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function isConfirmedInvoice(status: string | null | undefined) {
  return status === "issued" || status === "unpaid" || status === "paid";
}

function isUnpaid(status: string | null | undefined) {
  return status === "unpaid";
}

export default async function WarrantyInvoicesPage() {
  let invoices: WarrantyInvoiceRow[] = [];
  let errorMessage = "";

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_invoices")
      .select(
        "id, invoice_no, invoice_date, subject, bill_to_company_name, bill_to_name, total_amount, payment_due_date, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      const baseInvoices = (data || []) as Omit<
        WarrantyInvoiceRow,
        "last_invoice_sent_at" | "last_reminder_sent_at"
      >[];

      const invoiceIds = baseInvoices.map((invoice) => invoice.id);

      let logs: SendLogRow[] = [];

      if (invoiceIds.length > 0) {
        const { data: logData, error: logError } = await supabase
          .from("warranty_invoice_send_logs")
          .select("invoice_id, send_type, sent_at")
          .in("invoice_id", invoiceIds)
          .order("sent_at", { ascending: false });

        if (logError) {
          console.error("warranty_invoice_send_logs select error:", logError);
        } else {
          logs = (logData || []) as SendLogRow[];
        }
      }

      invoices = baseInvoices.map((invoice) => {
        const invoiceLog = logs.find(
          (log) => log.invoice_id === invoice.id && log.send_type === "invoice"
        );

        const reminderLog = logs.find(
          (log) => log.invoice_id === invoice.id && log.send_type === "reminder"
        );

        return {
          ...invoice,
          last_invoice_sent_at: invoiceLog?.sent_at || null,
          last_reminder_sent_at: reminderLog?.sent_at || null,
        };
      });
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "請求書一覧の取得に失敗しました";
  }

  const confirmedInvoices = invoices.filter((invoice) =>
    isConfirmedInvoice(invoice.status)
  );

  const unpaidInvoices = invoices.filter((invoice) => isUnpaid(invoice.status));
  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const currentMonthTotal = confirmedInvoices
    .filter((invoice) => (invoice.invoice_date || "").startsWith(currentMonth))
    .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);

  const unpaidTotal = unpaidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount || 0),
    0
  );

  const overdueInvoices = unpaidInvoices.filter((invoice) => {
    if (!invoice.payment_due_date) return false;
    return new Date(invoice.payment_due_date).getTime() < now.getTime();
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">請求書管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            請求書の一覧確認・新規作成・PDF発行・入金管理を行います。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/headquarters" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            本部管理へ
          </Link>
          <Link href="/" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            ホームへ
          </Link>
          <Link href="/api/warranty-invoices-csv" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            CSV出力
          </Link>
          <Link href="/warranty-invoices/new" className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800">
            新規作成
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          請求書一覧の取得に失敗しました: {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">全請求書</div>
          <div className="mt-2 text-3xl font-bold">{invoices.length}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未入金</div>
          <div className="mt-2 text-3xl font-bold">{unpaidInvoices.length}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">入金済み</div>
          <div className="mt-2 text-3xl font-bold">{paidInvoices.length}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">今月確定請求額</div>
          <div className="mt-2 text-2xl font-bold">{formatYen(currentMonthTotal)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">未入金合計</div>
          <div className="mt-2 text-2xl font-bold text-red-600">{formatYen(unpaidTotal)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">期限超過</div>
          <div className="mt-2 text-3xl font-bold text-red-600">{overdueInvoices.length}</div>
        </div>
      </div>

      <WarrantyInvoicesTable invoices={invoices} />
    </div>
  );
}