import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import React from "react";
import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  type DocumentProps,
} from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentProfile,
  type CurrentProfile,
} from "@/lib/auth/getCurrentProfile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

type GeneratePdfBody = {
  document_type?: DocumentType;
  billing_id?: string;
  billingId?: string;
};

type PdfProps = {
  documentType: DocumentType;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  contractName: string;
  billingMonthLabel: string;
  dueDate: string;
  paidDate: string;
  amountText: string;
  documentNo: string;
  issuerName: string;
  issuerAddress: string;
  issuerPhone: string;
  issuerEmail: string;
  issuerInvoiceNumber: string;
  issuerRepresentativeName: string;
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

let fontRegistered = false;

function ensureJapaneseFont() {
  if (fontRegistered) return;

  const fontPath = path.join(
    process.cwd(),
    "public",
    "fonts",
    "NotoSansJP-Regular.ttf"
  );

  if (!fs.existsSync(fontPath)) {
    throw new Error(
      "日本語フォントが見つかりません。public/fonts/NotoSansJP-Regular.ttf を配置してください"
    );
  }

  Font.register({
    family: "NotoSansJP",
    src: fontPath,
  });

  fontRegistered = true;
}

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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function formatYen(value: number | null | undefined) {
  return `¥${Number(value ?? 0).toLocaleString()}`;
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

async function fetchIssuerInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: CurrentProfile
) {
  let issuerName = HEADQUARTERS_FALLBACK.company_name;
  let issuerAddress = buildIssuerAddress(
    HEADQUARTERS_FALLBACK.postal_code,
    HEADQUARTERS_FALLBACK.address
  );
  let issuerPhone = HEADQUARTERS_FALLBACK.phone;
  let issuerEmail = HEADQUARTERS_FALLBACK.email;
  let issuerInvoiceNumber = HEADQUARTERS_FALLBACK.invoice_number;
  let issuerRepresentativeName = HEADQUARTERS_FALLBACK.representative_name;

  if (profile.role === "headquarters") {
    const { data: headquarters, error } = await supabase
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

    if (error) {
      console.error("headquarters_settings read error:", error);
      throw new Error(`本部設定の取得に失敗しました: ${error.message}`);
    }

    const hq = headquarters as HeadquartersSettingsRow | null;

    if (!hq) {
      throw new Error("本部設定が見つかりませんでした");
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
    }
  }

  return {
    issuerName,
    issuerAddress,
    issuerPhone,
    issuerEmail,
    issuerInvoiceNumber,
    issuerRepresentativeName,
  };
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 10,
    color: "#111827",
    backgroundColor: "#ffffff",
    paddingTop: 34,
    paddingBottom: 40,
    paddingHorizontal: 36,
  },
  title: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 24,
    letterSpacing: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    marginBottom: 18,
  },
  customerBox: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    padding: 14,
    minHeight: 92,
  },
  issuerBox: {
    width: "48%",
    alignItems: "flex-start",
  },
  customerName: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 10,
  },
  customerLine: {
    fontSize: 10,
    marginBottom: 4,
  },
  issuerName: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
  },
  issuerLine: {
    fontSize: 9.5,
    marginBottom: 4,
    lineHeight: 1.5,
  },
  metaRow: {
    marginBottom: 18,
    gap: 4,
  },
  metaText: {
    fontSize: 10,
    lineHeight: 1.6,
  },
  amountBox: {
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 11,
    color: "#1D4ED8",
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1D4ED8",
  },
  lead: {
    fontSize: 11,
    marginBottom: 14,
    lineHeight: 1.7,
  },
  table: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    marginBottom: 22,
  },
  row: {
    flexDirection: "row",
  },
  cellHeadLeft: {
    width: "28%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontWeight: 700,
  },
  cellHeadRight: {
    width: "72%",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontWeight: 700,
  },
  cellLeft: {
    width: "28%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  cellRight: {
    width: "72%",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  noteTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
  },
  noteBox: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    padding: 12,
    minHeight: 72,
  },
  noteText: {
    fontSize: 9.5,
    lineHeight: 1.7,
    marginBottom: 4,
  },
});

function DocumentPdf(props: PdfProps): React.ReactElement {
  const isInvoice = props.documentType === "invoice";

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        Text,
        { style: styles.title },
        isInvoice ? "請 求 書" : "領 収 書"
      ),

      React.createElement(
        View,
        { style: styles.topRow },
        React.createElement(
          View,
          { style: styles.customerBox },
          React.createElement(
            Text,
            { style: styles.customerName },
            `${props.customerName} 御中`
          ),
          React.createElement(
            Text,
            { style: styles.customerLine },
            `メール：${props.customerEmail || "-"}`
          ),
          React.createElement(
            Text,
            { style: styles.customerLine },
            `電話：${props.customerPhone || "-"}`
          )
        ),
        React.createElement(
          View,
          { style: styles.issuerBox },
          React.createElement(Text, { style: styles.issuerName }, props.issuerName),
          React.createElement(
            Text,
            { style: styles.issuerLine },
            props.issuerAddress || "-"
          ),
          React.createElement(
            Text,
            { style: styles.issuerLine },
            `TEL：${props.issuerPhone || "-"}`
          ),
          React.createElement(
            Text,
            { style: styles.issuerLine },
            `Email：${props.issuerEmail || "-"}`
          ),
          props.issuerRepresentativeName
            ? React.createElement(
                Text,
                { style: styles.issuerLine },
                `担当者：${props.issuerRepresentativeName}`
              )
            : null,
          React.createElement(
            Text,
            { style: styles.issuerLine },
            `登録番号：${props.issuerInvoiceNumber || "未登録"}`
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(
          Text,
          { style: styles.metaText },
          `${isInvoice ? "請求番号" : "領収書番号"}：${props.documentNo}`
        ),
        React.createElement(
          Text,
          { style: styles.metaText },
          `発行日：${formatDate(new Date().toISOString())}`
        ),
        React.createElement(
          Text,
          { style: styles.metaText },
          isInvoice
            ? `請求対象：${props.billingMonthLabel}`
            : `領収日：${props.paidDate}`
        )
      ),

      React.createElement(
        View,
        { style: styles.amountBox },
        React.createElement(
          Text,
          { style: styles.amountLabel },
          isInvoice ? "ご請求金額" : "領収金額"
        ),
        React.createElement(Text, { style: styles.amountValue }, props.amountText)
      ),

      React.createElement(
        Text,
        { style: styles.lead },
        isInvoice
          ? "下記のとおりご請求申し上げます。"
          : "下記金額を領収いたしました。"
      ),

      React.createElement(
        View,
        { style: styles.table },

        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.cellHeadLeft }, "項目"),
          React.createElement(Text, { style: styles.cellHeadRight }, "内容")
        ),

        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.cellLeft }, "契約名"),
          React.createElement(Text, { style: styles.cellRight }, props.contractName)
        ),

        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.cellLeft },
            isInvoice ? "請求対象月" : "対象月"
          ),
          React.createElement(
            Text,
            { style: styles.cellRight },
            props.billingMonthLabel
          )
        ),

        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.cellLeft },
            isInvoice ? "支払期限" : "但し書き"
          ),
          React.createElement(
            Text,
            { style: styles.cellRight },
            isInvoice
              ? props.dueDate
              : `${props.billingMonthLabel} サービス利用料として`
          )
        ),

        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.cellLeft },
            isInvoice ? "請求金額" : "領収金額"
          ),
          React.createElement(Text, { style: styles.cellRight }, props.amountText)
        )
      ),

      React.createElement(Text, { style: styles.noteTitle }, "備考"),

      React.createElement(
        View,
        { style: styles.noteBox },
        React.createElement(
          Text,
          { style: styles.noteText },
          "・本帳票はシステム登録情報をもとに発行しています。"
        ),
        React.createElement(
          Text,
          { style: styles.noteText },
          "・正式な条件は契約内容および登録済みの決済方法に従います。"
        ),
        React.createElement(
          Text,
          { style: styles.noteText },
          "・ご不明点は発行元までご連絡ください。"
        )
      )
    )
  );
}

export async function POST(req: Request) {
  try {
    ensureJapaneseFont();

    const supabase = await createClient();
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "ログイン情報を確認できませんでした" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as GeneratePdfBody;
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
      console.error("generate-pdf billing error:", error);
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

    const issuer = await fetchIssuerInfo(supabase, profile);

   const customerName =
  customerRow?.company_name || customerRow?.name || "顧客名未設定";

const documentElement = React.createElement(
  DocumentPdf as React.ComponentType<PdfProps>,
  {
    documentType,
    customerName,
    customerEmail: customerRow?.email || "",
    customerPhone: customerRow?.phone || "",
    contractName: contractRow?.contract_name || "サービス利用料",
    billingMonthLabel: formatMonthLabel(billing.billing_month),
    dueDate: formatDate(billing.due_date),
    paidDate: formatDate(billing.paid_date),
    amountText: formatYen(billing.amount),
    documentNo:
      documentType === "invoice"
        ? buildInvoiceNo(billing.id, billing.billing_month)
        : buildReceiptNo(billing.id, billing.paid_date),
    issuerName: issuer.issuerName,
    issuerAddress: issuer.issuerAddress,
    issuerPhone: issuer.issuerPhone,
    issuerEmail: issuer.issuerEmail,
    issuerInvoiceNumber: issuer.issuerInvoiceNumber,
    issuerRepresentativeName: issuer.issuerRepresentativeName,
  }
) as React.ReactElement<DocumentProps>;

const instance = pdf(documentElement);

const pdfBytes = (await instance.toBuffer()) as unknown as Buffer;

const filename =
  documentType === "invoice"
    ? `invoice-${billing.id}.pdf`
    : `receipt-${billing.id}.pdf`;

return new NextResponse(pdfBytes as unknown as BodyInit, {
  status: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "no-store",
  },
});
  } catch (error) {
    console.error("generate-pdf route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "PDF生成中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}