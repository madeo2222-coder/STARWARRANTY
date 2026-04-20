import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentProfile,
  type CurrentProfile,
} from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

type DocumentType = "invoice" | "receipt";

type BillingCustomerRow = {
  id: string;
  company_name: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  agency_id: string | null;
};

type BillingContractRow = {
  id: string;
  contract_name: string | null;
  amount: number | null;
  agency_id: string | null;
};

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
  customers: BillingCustomerRow | BillingCustomerRow[] | null;
  contracts: BillingContractRow | BillingContractRow[] | null;
};

type AgencyRow = {
  id: string;
  agency_name: string | null;
  name: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  representative_name: string | null;
  logo_url: string | null;
  parent_agency_id: string | null;
};

type HeadquartersSettingsRow = {
  id: string;
  company_name: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  logo_url: string | null;
};

type GenerateDocumentBody = {
  document_type?: DocumentType;
  billing_id?: string;
  billingId?: string;
};

const HEADQUARTERS_FALLBACK = {
  company_name: "StarRevenue株式会社",
  representative_name: "",
  email: "fusumada@star-group2014.com",
  phone: "090-3325-2664",
  postal_code: "101-0048",
  address: "東京都千代田区神田司町2-14 大鷹ビル801",
  logo_url: "",
  invoice_number: "T9290001093717",
};

function getCustomerRow(
  value: BillingCustomerRow | BillingCustomerRow[] | null
): BillingCustomerRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function getContractRow(
  value: BillingContractRow | BillingContractRow[] | null
): BillingContractRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

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
    const [y, m] = normalized.split("-");
    return `${y}年${m}月分`;
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

function formatPostalCode(value: string | null | undefined) {
  if (!value) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  if (/^\d{7}$/.test(raw)) {
    return `〒${raw.slice(0, 3)}-${raw.slice(3)}`;
  }

  if (/^\d{3}-\d{4}$/.test(raw)) {
    return `〒${raw}`;
  }

  return raw.startsWith("〒") ? raw : `〒${raw}`;
}

function buildIssuerAddress(
  postalCode: string | null | undefined,
  address: string | null | undefined
) {
  const postal = formatPostalCode(postalCode);
  const addr = (address || "").trim();

  if (postal && addr) return `${postal} ${addr}`;
  if (postal) return postal;
  if (addr) return addr;
  return "";
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
    .select("id, parent_agency_id")
    .eq("parent_agency_id", profile.agency_id);

  if (error) {
    console.error("resolveVisibleAgencyIds error:", error);
    return [];
  }

  const childIds = (data || []).map((row: { id: string }) => row.id);
  return [profile.agency_id, ...childIds];
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
    .logo-wrap {
      margin-bottom: 12px;
    }
    .company-logo {
      max-width: 160px;
      max-height: 80px;
      object-fit: contain;
    }
    .company-name {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .company-line {
      font-size: 13px;
      color: #374151;
      margin: 2px 0;
      white-space: pre-wrap;
    }
    .company-note {
      margin-top: 10px;
      font-size: 12px;
      color: #4b5563;
      line-height: 1.6;
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

function createCompanyBoxHtml(params: {
  issuerName: string;
  issuerAddress: string;
  issuerPhone: string;
  issuerEmail: string;
  issuerInvoiceNumber: string;
  issuerRepresentativeName: string;
  issuerLogoUrl: string;
}) {
  return `
    <div class="company-box">
      ${
        params.issuerLogoUrl
          ? `<div class="logo-wrap"><img class="company-logo" src="${escapeHtml(
              params.issuerLogoUrl
            )}" alt="company logo" /></div>`
          : ""
      }
      <div class="company-name">${escapeHtml(params.issuerName)}</div>
      <div class="company-line">${escapeHtml(params.issuerAddress || "-")}</div>
      <div class="company-line">TEL：${escapeHtml(params.issuerPhone || "-")}</div>
      <div class="company-line">Email：${escapeHtml(params.issuerEmail || "-")}</div>
      ${
        params.issuerRepresentativeName
          ? `<div class="company-line">担当者：${escapeHtml(
              params.issuerRepresentativeName
            )}</div>`
          : ""
      }
      <div class="company-line">登録番号：${escapeHtml(
        params.issuerInvoiceNumber || "未登録"
      )}</div>
      <div class="company-note">
        ※決済はStarRevenue株式会社を通じて行われます
      </div>
    </div>
  `.trim();
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
  issuerName: string;
  issuerAddress: string;
  issuerPhone: string;
  issuerEmail: string;
  issuerInvoiceNumber: string;
  issuerRepresentativeName: string;
  issuerLogoUrl: string;
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

      ${createCompanyBoxHtml({
        issuerName: params.issuerName,
        issuerAddress: params.issuerAddress,
        issuerPhone: params.issuerPhone,
        issuerEmail: params.issuerEmail,
        issuerInvoiceNumber: params.issuerInvoiceNumber,
        issuerRepresentativeName: params.issuerRepresentativeName,
        issuerLogoUrl: params.issuerLogoUrl,
      })}
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
      <div><strong>ご案内</strong></div>
      <div>※ お支払方法はご登録の決済方法にて処理されます。</div>
      <div>※ 本請求書はサービス利用料に関するご案内です。</div>
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
  issuerName: string;
  issuerAddress: string;
  issuerPhone: string;
  issuerEmail: string;
  issuerInvoiceNumber: string;
  issuerRepresentativeName: string;
  issuerLogoUrl: string;
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

      ${createCompanyBoxHtml({
        issuerName: params.issuerName,
        issuerAddress: params.issuerAddress,
        issuerPhone: params.issuerPhone,
        issuerEmail: params.issuerEmail,
        issuerInvoiceNumber: params.issuerInvoiceNumber,
        issuerRepresentativeName: params.issuerRepresentativeName,
        issuerLogoUrl: params.issuerLogoUrl,
      })}
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
          <td>${escapeHtml(
            `${params.billingMonthLabel} サービス利用料として`
          )}</td>
        </tr>
        <tr>
          <td>領収金額</td>
          <td><strong>${escapeHtml(params.amount)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="note-box">
      <div><strong>ご案内</strong></div>
      <div>※ 本書はサービス利用料に関する領収書です。</div>
      <div>※ 決済はご登録の決済方法にて処理されています。</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "ログイン情報を確認できませんでした" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as GenerateDocumentBody;
    const documentType = body.document_type;
    const billingId = body.billing_id?.trim() || body.billingId?.trim();

    if (
      !documentType ||
      (documentType !== "invoice" && documentType !== "receipt")
    ) {
      return NextResponse.json(
        { success: false, error: "document_type が不正です" },
        { status: 400 }
      );
    }

    if (!billingId) {
      return NextResponse.json(
        { success: false, error: "billing_id がありません" },
        { status: 400 }
      );
    }

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
        { success: false, error: "対象請求が見つかりません" },
        { status: 404 }
      );
    }

    const customerRow = getCustomerRow(billing.customers);
    const contractRow = getContractRow(billing.contracts);

    const billingAgencyId =
      contractRow?.agency_id ?? customerRow?.agency_id ?? null;

    const visibleAgencyIds = await resolveVisibleAgencyIds(profile);

    if (profile.role !== "headquarters") {
      if (
        !billingAgencyId ||
        !(visibleAgencyIds || []).includes(billingAgencyId)
      ) {
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

    let issuerName = HEADQUARTERS_FALLBACK.company_name;
    let issuerAddress = buildIssuerAddress(
      HEADQUARTERS_FALLBACK.postal_code,
      HEADQUARTERS_FALLBACK.address
    );
    let issuerPhone = HEADQUARTERS_FALLBACK.phone;
    let issuerEmail = HEADQUARTERS_FALLBACK.email;
    let issuerInvoiceNumber = HEADQUARTERS_FALLBACK.invoice_number;
    let issuerRepresentativeName = HEADQUARTERS_FALLBACK.representative_name;
    let issuerLogoUrl = HEADQUARTERS_FALLBACK.logo_url;

    if (profile.role === "headquarters") {
      const { data: headquarters, error: headquartersError } = await supabase
        .from("headquarters_settings")
        .select(
          `
          id,
          company_name,
          representative_name,
          email,
          phone,
          postal_code,
          address,
          note,
          logo_url
        `
        )
        .limit(1)
        .single();

      if (headquartersError) {
        console.error("headquarters_settings read error:", headquartersError);
        return NextResponse.json(
          {
            success: false,
            error: `本部設定の取得に失敗しました: ${headquartersError.message}`,
          },
          { status: 500 }
        );
      }

      const hq = headquarters as HeadquartersSettingsRow | null;

      if (!hq) {
        return NextResponse.json(
          {
            success: false,
            error: "本部設定が見つかりませんでした",
          },
          { status: 500 }
        );
      }

      issuerName = hq.company_name || HEADQUARTERS_FALLBACK.company_name;
      issuerAddress = buildIssuerAddress(
        hq.postal_code || HEADQUARTERS_FALLBACK.postal_code,
        hq.address || HEADQUARTERS_FALLBACK.address
      );
      issuerPhone = hq.phone || HEADQUARTERS_FALLBACK.phone;
      issuerEmail = hq.email || HEADQUARTERS_FALLBACK.email;
      issuerRepresentativeName =
        hq.representative_name || HEADQUARTERS_FALLBACK.representative_name;
      issuerLogoUrl = hq.logo_url || HEADQUARTERS_FALLBACK.logo_url;
    } else if (profile.agency_id) {
      const { data: agencyData } = await supabase
        .from("agencies")
        .select(
          `
          id,
          agency_name,
          name,
          postal_code,
          address,
          phone,
          email,
          representative_name,
          logo_url,
          parent_agency_id
        `
        )
        .eq("id", profile.agency_id)
        .maybeSingle();

      const agency = agencyData as AgencyRow | null;

      if (agency) {
        issuerName = agency.agency_name || agency.name || "代理店未設定";
        issuerAddress = buildIssuerAddress(agency.postal_code, agency.address);
        issuerPhone = agency.phone || "";
        issuerEmail = agency.email || "";
        issuerInvoiceNumber = "未登録";
        issuerRepresentativeName = agency.representative_name || "";
        issuerLogoUrl = agency.logo_url || "";
      }
    }

    const customerName =
      customerRow?.company_name || customerRow?.name || "顧客名未設定";
    const customerEmail = customerRow?.email || "";
    const customerPhone = customerRow?.phone || "";
    const contractName = contractRow?.contract_name || "サービス利用料";
    const amount = formatYen(billing.amount);
    const issuedDate = formatDate(new Date().toISOString());
    const billingMonthLabel = formatMonthLabel(billing.billing_month);
    const invoiceNo = buildInvoiceNo(billing.id, billing.billing_month);
    const receiptNo = buildReceiptNo(billing.id, billing.paid_date);

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
            issuerName,
            issuerAddress,
            issuerPhone,
            issuerEmail,
            issuerInvoiceNumber,
            issuerRepresentativeName,
            issuerLogoUrl,
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
            issuerName,
            issuerAddress,
            issuerPhone,
            issuerEmail,
            issuerInvoiceNumber,
            issuerRepresentativeName,
            issuerLogoUrl,
          });

    return NextResponse.json({
      success: true,
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
            : "帳票生成中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}