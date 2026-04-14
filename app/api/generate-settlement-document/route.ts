import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentProfile,
  type CurrentProfile,
} from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";

type AgencyRow = {
  id: string;
  name: string | null;
  agency_name?: string | null;
  parent_agency_id: string | null;
};

type BillingCustomerRow = {
  id: string;
  company_name: string | null;
  name?: string | null;
  agency_id: string | null;
};

type BillingContractRow = {
  id: string;
  contract_name: string | null;
  agency_id: string | null;
};

type BillingRow = {
  id: string;
  customer_id: string | null;
  contract_id: string | null;
  billing_month: string | null;
  amount: number | null;
  status: string | null;
  paid_date: string | null;
  due_date: string | null;
  customers: BillingCustomerRow | BillingCustomerRow[] | null;
  contracts: BillingContractRow | BillingContractRow[] | null;
};

type RequestBody = {
  agency_id?: string;
  target_month?: string;
  transfer_fee?: number;
};

type SettlementDisplayRow = {
  billingMonth: string;
  customerName: string;
  contractId: string;
  serviceName: string;
  paymentType: string;
  amount: number;
  feeAmount: number;
  systemFee: number;
  payoutAmount: number;
  status: string;
  paidDate: string;
};

const COMPANY_NAME = "StarRevenue株式会社";
const COMPANY_POSTAL = "〒101-0048";
const COMPANY_ADDRESS = "東京都千代田区神田司町2-14 大鷹ビル801";
const COMPANY_TEL = "090-3325-2664";
const COMPANY_EMAIL = "fusumada@star-group2014.com";
const COMPANY_INVOICE_NO = "T9290001093717";

const MONTHLY_SYSTEM_FEE = 11000;
const FEE_RATE = 0.03;

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

function formatMonthKey(value: string | null | undefined) {
  if (!value) return "-";

  const normalized = value.replace("/", "-");

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized.slice(0, 7);
  }

  return normalized;
}

function formatMonthLabel(value: string | null | undefined) {
  const key = formatMonthKey(value);

  if (!/^\d{4}-\d{2}$/.test(key)) {
    return key;
  }

  const [y, m] = key.split("-");
  return `${y}年${m}月分`;
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

function buildSettlementNo(agencyId: string, targetMonth: string) {
  return `SET-${targetMonth.replace(/[^0-9]/g, "")}-${agencyId
    .slice(0, 8)
    .toUpperCase()}`;
}

function sharedStyles() {
  return `
    body {
      margin: 0;
      background: #f3f4f6;
      color: #111827;
      font-family: Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      line-height: 1.7;
    }
    .page {
      max-width: 1100px;
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
      font-size: 38px;
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
      font-size: 14px;
    }
    .company-name {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .recipient-box {
      margin-top: 20px;
      padding: 20px;
      border: 1px solid #d1d5db;
      border-radius: 14px;
      background: #fafafa;
    }
    .recipient-name {
      font-size: 30px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-top: 24px;
    }
    .card {
      padding: 16px;
      border-radius: 14px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .card.blue {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-color: #bfdbfe;
    }
    .card-label {
      font-size: 13px;
      color: #4b5563;
      margin-bottom: 6px;
      font-weight: 700;
    }
    .card-value {
      font-size: 28px;
      font-weight: 800;
      line-height: 1.2;
    }
    .card.blue .card-label,
    .card.blue .card-value {
      color: #1d4ed8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      border: 1px solid #d1d5db;
      background: #f9fafb;
      padding: 10px;
      text-align: left;
      font-size: 13px;
      white-space: nowrap;
    }
    td {
      border: 1px solid #d1d5db;
      padding: 10px;
      font-size: 13px;
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

function createSettlementHtml(params: {
  targetMonth: string;
  agencyName: string;
  settlementNo: string;
  issuedDate: string;
  rows: SettlementDisplayRow[];
  totalAmount: number;
  totalFeeAmount: number;
  totalSystemFee: number;
  transferFee: number;
  totalPayout: number;
}) {
  const rowsHtml = params.rows
    .map((row) => {
      return `
        <tr>
          <td>${escapeHtml(row.billingMonth)}</td>
          <td>${escapeHtml(row.customerName)}</td>
          <td>${escapeHtml(row.contractId)}</td>
          <td>${escapeHtml(row.serviceName)}</td>
          <td>${escapeHtml(row.paymentType)}</td>
          <td>${escapeHtml(formatYen(row.amount))}</td>
          <td>${escapeHtml(formatYen(row.feeAmount))}</td>
          <td>${escapeHtml(formatYen(row.systemFee))}</td>
          <td>${escapeHtml(formatYen(row.payoutAmount))}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.paidDate)}</td>
        </tr>
      `.trim();
    })
    .join("");

  return `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>代理店精算書</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="page">
    <div class="topbar">
      <div>
        <h1 class="title">代理店精算書</h1>
        <div class="subline">精算書番号：${escapeHtml(params.settlementNo)}</div>
        <div class="subline">発行日：${escapeHtml(params.issuedDate)}</div>
        <div class="subline">精算対象月：${escapeHtml(
          formatMonthLabel(params.targetMonth)
        )}</div>
      </div>

      <div class="company-box">
        <div class="company-name">${escapeHtml(COMPANY_NAME)}</div>
        <div>${escapeHtml(COMPANY_POSTAL)}</div>
        <div>${escapeHtml(COMPANY_ADDRESS)}</div>
        <div>TEL：${escapeHtml(COMPANY_TEL)}</div>
        <div>Email：${escapeHtml(COMPANY_EMAIL)}</div>
        <div>登録番号：${escapeHtml(COMPANY_INVOICE_NO)}</div>
      </div>
    </div>

    <div class="recipient-box">
      <div class="recipient-name">${escapeHtml(params.agencyName)} 御中</div>
      <div>対象：${escapeHtml(formatMonthLabel(params.targetMonth))}</div>
    </div>

    <div class="summary-grid">
      <div class="card">
        <div class="card-label">総回収額</div>
        <div class="card-value">${escapeHtml(formatYen(params.totalAmount))}</div>
      </div>
      <div class="card">
        <div class="card-label">手数料合計（3.0%）</div>
        <div class="card-value">${escapeHtml(
          formatYen(params.totalFeeAmount)
        )}</div>
      </div>
      <div class="card">
        <div class="card-label">システム利用料</div>
        <div class="card-value">${escapeHtml(
          formatYen(params.totalSystemFee)
        )}</div>
      </div>
      <div class="card">
        <div class="card-label">振込手数料</div>
        <div class="card-value">${escapeHtml(
          formatYen(params.transferFee)
        )}</div>
      </div>
      <div class="card blue">
        <div class="card-label">差引振込額</div>
        <div class="card-value">${escapeHtml(formatYen(params.totalPayout))}</div>
      </div>
    </div>

    <div class="section-title">精算明細</div>
    <table>
      <thead>
        <tr>
          <th>請求月</th>
          <th>顧客名</th>
          <th>契約ID</th>
          <th>サービス名</th>
          <th>決済種別</th>
          <th>引落金額</th>
          <th>手数料（3.0%）</th>
          <th>システム利用料</th>
          <th>振込対象額</th>
          <th>ステータス</th>
          <th>引落日</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="note-box">
      <div><strong>備考</strong></div>
      <div>・手数料は引落金額の 3.0% で計算しています。</div>
      <div>・システム利用料は月額 ${escapeHtml(
        formatYen(MONTHLY_SYSTEM_FEE)
      )} です。</div>
      <div>・振込手数料は代理店負担です。</div>
      <div>・クレジットカード：月末締め翌々月15日入金</div>
      <div>・口座振替：月末締め翌月15日入金</div>
      <div>・現時点では決済種別をDB保持していないため、決済種別は一律「登録決済」として表示しています。</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
function getCustomerRow(
  value: BillingCustomerRow | BillingCustomerRow[] | null
): BillingCustomerRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getContractRow(
  value: BillingContractRow | BillingContractRow[] | null
): BillingContractRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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

    const body = (await request.json()) as RequestBody;
    const agencyId = body.agency_id?.trim();
    const targetMonth = formatMonthKey(body.target_month);
    const transferFee = Number(body.transfer_fee ?? 0);

    if (!agencyId || !targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
      return NextResponse.json(
        { success: false, error: "agency_id と target_month は必須です" },
        { status: 400 }
      );
    }

    const visibleAgencyIds = await resolveVisibleAgencyIds(profile);

    if (profile.role !== "headquarters") {
      if (!(visibleAgencyIds || []).includes(agencyId)) {
        return NextResponse.json(
          { success: false, error: "この代理店データへのアクセス権限がありません" },
          { status: 403 }
        );
      }
    }

    const supabase = await createClient();

    const { data: agencyData, error: agencyError } = await supabase
      .from("agencies")
      .select("id, name, agency_name, parent_agency_id")
      .eq("id", agencyId)
      .maybeSingle();

    if (agencyError || !agencyData) {
      return NextResponse.json(
        { success: false, error: "代理店データ取得に失敗しました" },
        { status: 500 }
      );
    }

    const agency = agencyData as AgencyRow;

    const { data: billingsData, error: billingsError } = await supabase
      .from("billings")
      .select(
        `
        id,
        customer_id,
        contract_id,
        billing_month,
        amount,
        status,
        paid_date,
        due_date,
        customers:customer_id (
          id,
          company_name,
          name,
          agency_id
        ),
        contracts:contract_id (
          id,
          contract_name,
          agency_id
        )
      `
      )
      .order("paid_date", { ascending: true });

    if (billingsError) {
      console.error(
        "generate-settlement-document billings error:",
        billingsError
      );
      return NextResponse.json(
        { success: false, error: "精算対象データ取得に失敗しました" },
        { status: 500 }
      );
    }

   const billingRows: BillingRow[] = Array.isArray(billingsData)
  ? (billingsData as unknown as BillingRow[])
  : [];

   const filteredRows: BillingRow[] = billingRows.filter((row) => {
  const contractRow = getContractRow(row.contracts);
  const customerRow = getCustomerRow(row.customers);

  const rowAgencyId = contractRow?.agency_id ?? customerRow?.agency_id ?? null;

  if (rowAgencyId !== agencyId) return false;
  if (row.status !== "paid") return false;
  if (formatMonthKey(row.billing_month) !== targetMonth) return false;

  return true;
});

   const rows: SettlementDisplayRow[] = filteredRows.map((row, index) => {
  const customerRow = getCustomerRow(row.customers);
  const contractRow = getContractRow(row.contracts);

  const amount = Number(row.amount ?? 0);
  const feeAmount = Math.round(amount * FEE_RATE);
  const systemFee = index === 0 ? MONTHLY_SYSTEM_FEE : 0;
  const payoutAmount = Math.max(0, amount - feeAmount - systemFee);

  return {
    billingMonth: formatMonthLabel(row.billing_month),
    customerName:
      customerRow?.company_name || customerRow?.name || "顧客名未設定",
    contractId: row.contract_id || "-",
    serviceName: contractRow?.contract_name || "サービス利用料",
    paymentType: "登録決済",
    amount,
    feeAmount,
    systemFee,
    payoutAmount,
    status: row.status === "paid" ? "回収済" : row.status || "-",
    paidDate: formatDate(row.paid_date),
  };
});

    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    const totalFeeAmount = rows.reduce((sum, row) => sum + row.feeAmount, 0);
    const totalSystemFee = rows.reduce((sum, row) => sum + row.systemFee, 0);
    const totalPayout = Math.max(
      0,
      totalAmount - totalFeeAmount - totalSystemFee - transferFee
    );

    const issuedDate = formatDate(new Date().toISOString());
    const agencyName = agency.name || agency.agency_name || "代理店未設定";
    const settlementNo = buildSettlementNo(agency.id, targetMonth);

    const html = createSettlementHtml({
      targetMonth,
      agencyName,
      settlementNo,
      issuedDate,
      rows,
      totalAmount,
      totalFeeAmount,
      totalSystemFee,
      transferFee,
      totalPayout,
    });

    return NextResponse.json({
      success: true,
      settlement: {
        agency_id: agency.id,
        agency_name: agencyName,
        target_month: targetMonth,
        settlement_no: settlementNo,
        issued_date: issuedDate,
        total_amount: totalAmount,
        total_fee_amount: totalFeeAmount,
        total_system_fee: totalSystemFee,
        transfer_fee: transferFee,
        total_payout: totalPayout,
        row_count: rows.length,
      },
      html,
    });
  } catch (error) {
    console.error("generate-settlement-document route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "精算書生成中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}