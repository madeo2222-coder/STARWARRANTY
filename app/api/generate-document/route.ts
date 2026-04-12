import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentProfile,
  type CurrentProfile,
} from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

type DocumentType = "invoice" | "receipt";

type BillingRow = {
  id: string;
  contract_id: string | null;
  customer_id: string | null;
  billing_month: string | null;
  amount: number | null;
  status: string | null;
  due_date: string | null;
  created_at: string | null;
  paid_date: string | null;
  customers:
    | {
        id: string;
        company_name: string | null;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        agency_id: string | null;
      }
    | null;
  contracts:
    | {
        id: string;
        contract_name: string | null;
        amount: number | null;
        agency_id: string | null;
      }
    | null;
};

type AgencyRow = {
  id: string;
  name: string | null;
  agency_name?: string | null;
  parent_agency_id: string | null;
};

type GenerateDocumentBody = {
  document_type?: DocumentType;
  billing_id?: string;
};

const COMPANY_NAME = "StarRevenue株式会社";
const COMPANY_POSTAL = "〒101-0048";
const COMPANY_ADDRESS = "東京都千代田区神田司町2-14 大鷹ビル801";
const COMPANY_TEL = "090-3325-2664";
const COMPANY_EMAIL = "fusumada@star-group2014.com";
const COMPANY_INVOICE_NO = "T9290001093717";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatYen(value: number | null | undefined) {
  return `¥${Number(value ?? 0).toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("ja-JP");
}

function formatMonthLabel(value: string | null | undefined) {
  if (!value) return "-";

  const normalized = value.replace("/", "-");

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    const [y, m] = normalized.split("-");
    return `${y}年${m}月分`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}年${m}月分`;
    }
  }

  return value;
}

function buildInvoiceNo(billingId: string, billingMonth: string | null) {
  const monthKey = (billingMonth || "0000-00").replace(/[^0-9]/g, "");
  return `INV-${monthKey}-${billingId.slice(0, 8).toUpperCase()}`;
}

function buildReceiptNo(billingId: string, paidDate: string | null) {
  const dateKey = (paidDate || "0000-00-00").replace(/[^0-9]/g, "");
  return `REC-${dateKey}-${billingId.slice(0, 8).toUpperCase()}`;
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
    .select("id, name, agency_name, parent_agency_id")
    .eq("parent_agency_id", profile.agency_id);

  if (error) {
    console.error("resolveVisibleAgencyIds error:", error);
    return [];
  }

  const children = (Array.isArray(data) ? data : []) as AgencyRow[];

  return [profile.agency_id, ...children.map((row) => row.id)];
}

function sharedDocumentStyles() {
  return `
    body {
      margin: 0;
      background: #f3f4f6;
      color: #111827;
      font-family: Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      line-height: 1.7;
    }
    .page {
      max-width: 900px;
      margin: 24px auto;
      background: #ffffff;
      padding: 40px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 28px;
    }
    .title {
      font-size: 40px;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin: 0 0 12px;
    }
    .subline {
      font-size: 14px;
      color: #4b5563;
      margin: 4px 0;
    }
    .company-box {
      text-align: right;
      max-width: 360px;
    }
    .company-name {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .invoice-box {
      margin-top: 8px;
      font-size: 13px;
      color: #374151;
    }
    .customer-box {
      margin-top: 20px;
      padding: 20px;
      border: 1px solid #d1d5db;
      border-radius: 14px;
      background: #fafafa;
    }
    .customer-name {
      font-size: 34px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .lead {
      margin-top: 22px;
      font-size: 18px;
    }
    .amount-panel {
      margin-top: 24px;
      padding: 20px 24px;
      border-radius: 16px;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border: 1px solid #bfdbfe;
    }
    .amount-label {
      font-size: 14px;
      color: #1d4ed8;
      margin-bottom: 6px;
      font-weight: 700;
    }
    .amount-value {
      font-size: 42px;
      font-weight: 800;
      color: #1d4ed8;
      line-height: 1.2;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      border: 1px solid #d1d5db;
      background: #f9fafb;
      padding: 12px;
      text-align: left;
      font-size: 14px;
    }
    td {
      border: 1px solid #d1d5db;
      padding: 12px;
      font-size: 14px;
      vertical-align: top;
    }
    .section-title {
      margin-top: 28px;
      margin-bottom: 8px;
      font-size: 18px;
      font-weight: 700;
    }
    .note-box {
      margin-top: 28px;
      padding: 16px 18px;
      border-radius: 14px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      font-size: 13px;
      color: #4b5563;
    }
    .note-box strong {
      color: #111827;
    }
    @media print {
      body {
        background: #fff;
      }
      .page {
        margin: 0;
        max-width: none;
        box-shadow: none;
        padding: 24px;
      }
    }
  `;
}

function createInvoiceHtml(params: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  contractName: string;
  billingMonthLabel: string;
  invoiceNo: string;
  issuedDate: string;
  dueDate: string;
  amount: string;
  agencyName: string;
}) {
  return `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>請求書</title>
  <style>${sharedDocumentStyles()}</style>
</head>
<body>
  <div class="page">
    <div class="topbar">
      <div>
        <h1 class="title">請求書</h1>
        <div class="subline">請求書番号：${escapeHtml(params.invoiceNo)}</div>
        <div class="subline">発行日：${escapeHtml(params.issuedDate)}</div>
        <div class="subline">請求対象：${escapeHtml(params.billingMonthLabel)}</div>
      </div>

      <div class="company-box">
        <div class="company-name">${escapeHtml(COMPANY_NAME)}</div>
        <div>${escapeHtml(COMPANY_POSTAL)}</div>
        <div>${escapeHtml(COMPANY_ADDRESS)}</div>
        <div>TEL：${escapeHtml(COMPANY_TEL)}</div>
        <div>Email：${escapeHtml(COMPANY_EMAIL)}</div>
        <div class="invoice-box">登録番号：${escapeHtml(COMPANY_INVOICE_NO)}</div>
        <div class="invoice-box">代理店：${escapeHtml(params.agencyName)}</div>
      </div>
    </div>

    <div class="customer-box">
      <div class="customer-name">${escapeHtml(params.customerName)} 御中</div>
      <div>メール：${escapeHtml(params.customerEmail || "-")}</div>
      <div>電話：${escapeHtml(params.customerPhone || "-")}</div>
    </div>

    <div class="lead">下記のとおりご請求申し上げます。</div>

    <div class="amount-panel">
      <div class="amount-label">ご請求金額</div>
      <div class="amount-value">${escapeHtml(params.amount)}</div>
    </div>

    <div class="section-title">請求内容</div>
    <table>
      <thead>
        <tr>
          <th style="width: 28%;">項目</th>
          <th>内容</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>契約名</td>
          <td>${escapeHtml(params.contractName)}</td>
        </tr>
        <tr>
          <td>請求対象月</td>
          <td>${escapeHtml(params.billingMonthLabel)}</td>
        </tr>
        <tr>
          <td>支払期限</td>
          <td>${escapeHtml(params.dueDate)}</td>
        </tr>
        <tr>
          <td>請求金額</td>
          <td><strong>${escapeHtml(params.amount)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="note-box">
      <div><strong>お支払条件</strong></div>
      <div>クレジットカード：月末締め翌々月15日入金</div>
      <div>口座振替：月末締め翌月15日入金</div>
      <div style="margin-top:8px;">※ お支払方法はご登録の決済方法にて処理されます。</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function createReceiptHtml(params: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  contractName: string;
  billingMonthLabel: string;
  receiptNo: string;
  issuedDate: string;
  paidDate: string;
  amount: string;
  agencyName: string;
}) {
  return `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>領収書</title>
  <style>${sharedDocumentStyles()}</style>
</head>
<body>
  <div class="page">
    <div class="topbar">
      <div>
        <h1 class="title">領収書</h1>
        <div class="subline">領収書番号：${escapeHtml(params.receiptNo)}</div>
        <div class="subline">発行日：${escapeHtml(params.issuedDate)}</div>
        <div class="subline">領収日：${escapeHtml(params.paidDate)}</div>
      </div>

      <div class="company-box">
        <div class="company-name">${escapeHtml(COMPANY_NAME)}</div>
        <div>${escapeHtml(COMPANY_POSTAL)}</div>
        <div>${escapeHtml(COMPANY_ADDRESS)}</div>
        <div>TEL：${escapeHtml(COMPANY_TEL)}</div>
        <div>Email：${escapeHtml(COMPANY_EMAIL)}</div>
        <div class="invoice-box">登録番号：${escapeHtml(COMPANY_INVOICE_NO)}</div>
        <div class="invoice-box">代理店：${escapeHtml(params.agencyName)}</div>
      </div>
    </div>

    <div class="customer-box">
      <div class="customer-name">${escapeHtml(params.customerName)} 御中</div>
      <div>メール：${escapeHtml(params.customerEmail || "-")}</div>
      <div>電話：${escapeHtml(params.customerPhone || "-")}</div>
    </div>

    <div class="lead">下記金額を領収いたしました。</div>

    <div class="amount-panel">
      <div class="amount-label">領収金額</div>
      <div class="amount-value">${escapeHtml(params.amount)}</div>
    </div>

    <div class="section-title">領収内容</div>
    <table>
      <thead>
        <tr>
          <th style="width: 28%;">項目</th>
          <th>内容</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>契約名</td>
          <td>${escapeHtml(params.contractName)}</td>
        </tr>
        <tr>
          <td>対象月</td>
          <td>${escapeHtml(params.billingMonthLabel)}</td>
        </tr>
        <tr>
          <td>但し書き</td>
          <td>${escapeHtml(`${params.billingMonthLabel} サービス利用料として`)}</td>
        </tr>
        <tr>
          <td>領収金額</td>
          <td><strong>${escapeHtml(params.amount)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="note-box">
      <div><strong>お支払条件</strong></div>
      <div>クレジットカード：月末締め翌々月15日入金</div>
      <div>口座振替：月末締め翌月15日入金</div>
      <div style="margin-top:8px;">※ 本書は前月領収書として発行しています。</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "ログイン情報を確認できませんでした" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as GenerateDocumentBody;
    const documentType = body.document_type;
    const billingId = body.billing_id?.trim();

    if (!documentType || (documentType !== "invoice" && documentType !== "receipt")) {
      return NextResponse.json(
        { success: false, error: "document_type は invoice または receipt が必要です" },
        { status: 400 }
      );
    }

    if (!billingId) {
      return NextResponse.json(
        { success: false, error: "billing_id は必須です" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("billings")
      .select(
        `
        id,
        contract_id,
        customer_id,
        billing_month,
        amount,
        status,
        due_date,
        created_at,
        paid_date,
        customers:customer_id (
          id,
          company_name,
          name,
          email,
          phone,
          agency_id
        ),
        contracts:contract_id (
          id,
          contract_name,
          amount,
          agency_id
        )
      `
      )
      .eq("id", billingId)
      .maybeSingle();

    if (error) {
      console.error("generate-document billing error:", error);
      return NextResponse.json(
        { success: false, error: "請求データ取得に失敗しました" },
        { status: 500 }
      );
    }

    const billing = data as BillingRow | null;

    if (!billing) {
      return NextResponse.json(
        { success: false, error: "対象の請求データが見つかりません" },
        { status: 404 }
      );
    }

    const visibleAgencyIds = await resolveVisibleAgencyIds(profile);

    const billingAgencyId =
      billing.contracts?.agency_id ?? billing.customers?.agency_id ?? null;

    if (profile.role !== "headquarters") {
      if (!billingAgencyId || !(visibleAgencyIds || []).includes(billingAgencyId)) {
        return NextResponse.json(
          { success: false, error: "この請求データへのアクセス権限がありません" },
          { status: 403 }
        );
      }
    }

    if (documentType === "receipt" && !billing.paid_date) {
      return NextResponse.json(
        { success: false, error: "未入金のため領収書は作成できません" },
        { status: 400 }
      );
    }

    let agencyName = "代理店未設定";

    if (billingAgencyId) {
      const { data: agencyData } = await supabase
        .from("agencies")
        .select("id, name, agency_name, parent_agency_id")
        .eq("id", billingAgencyId)
        .maybeSingle();

      const agency = agencyData as AgencyRow | null;
      agencyName = agency?.name || agency?.agency_name || "代理店未設定";
    }

    const customerName =
      billing.customers?.company_name ||
      billing.customers?.name ||
      "顧客名未設定";

    const customerEmail = billing.customers?.email || "";
    const customerPhone = billing.customers?.phone || "";

    const contractName =
      billing.contracts?.contract_name || "サービス利用料";

    const amount = formatYen(billing.amount);
    const issuedDate = formatDate(new Date().toISOString());
    const billingMonthLabel = formatMonthLabel(billing.billing_month);

    const invoiceNo = buildInvoiceNo(billing.id, billing.billing_month);
    const receiptNo = buildReceiptNo(billing.id, billing.paid_date);

    const documentData = {
      document_type: documentType,
      billing_id: billing.id,
      customer_id: billing.customer_id,
      contract_id: billing.contract_id,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      contract_name: contractName,
      agency_name: agencyName,
      billing_month: billing.billing_month,
      billing_month_label: billingMonthLabel,
      amount,
      raw_amount: Number(billing.amount ?? 0),
      due_date: formatDate(billing.due_date),
      paid_date: formatDate(billing.paid_date),
      issued_date: issuedDate,
      invoice_no: invoiceNo,
      receipt_no: receiptNo,
      status: billing.status ?? "-",
      note:
        documentType === "invoice"
          ? "お支払方法はご登録の決済方法にて処理されます。"
          : `${billingMonthLabel} サービス利用料として`,
    };

    const html =
      documentType === "invoice"
        ? createInvoiceHtml({
            customerName,
            customerEmail,
            customerPhone,
            contractName,
            billingMonthLabel,
            invoiceNo,
            issuedDate,
            dueDate: formatDate(billing.due_date),
            amount,
            agencyName,
          })
        : createReceiptHtml({
            customerName,
            customerEmail,
            customerPhone,
            contractName,
            billingMonthLabel,
            receiptNo,
            issuedDate,
            paidDate: formatDate(billing.paid_date),
            amount,
            agencyName,
          });

    return NextResponse.json({
      success: true,
      document: documentData,
      html,
    });
  } catch (error) {
    console.error("generate-document route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "帳票データ生成中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}