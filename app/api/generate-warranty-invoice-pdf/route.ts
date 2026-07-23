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
  Image,
  StyleSheet,
  Font,
  type DocumentProps,
} from "@react-pdf/renderer";
import { createClient } from "@supabase/supabase-js";
import { normalizeQualifiedInvoiceIssuerNumber } from "@/lib/headquarters/invoice-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WarrantyInvoice = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  payment_due_date: string | null;
  subject: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  bank_account_info: string | null;
  note: string | null;
  status: string | null;
};

type WarrantyInvoiceItem = {
  id: string;
  invoice_id: string;
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  sort_order: number | null;
};

type HeadquartersSettings = {
  company_name: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  logo_url: string | null;
  invoice_number: string | null;
};

type PdfProps = {
  invoice: WarrantyInvoice;
  items: WarrantyInvoiceItem[];
  headquarters: HeadquartersSettings | null;
};

const DEFAULT_COMPANY_NAME = "株式会社スター・ワランティ";
const DEFAULT_PHONE = "0120-992-857";
const DEFAULT_EMAIL = "fusumada@star-group2014.com";
const DEFAULT_POSTAL_CODE = "101-0048";
const DEFAULT_ADDRESS = "東京都千代田区神田司町2-14 大鷹ビル8F";
const DEFAULT_BANK_INFO =
  "住信SBIネット銀行（金融機関コード0038）\n法人第一支店（支店コード106）\n普通 2454033\nカ）スターワランティ";

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

function getPublicImagePath(fileName: string) {
  const filePath = path.join(process.cwd(), "public", fileName);
  return fs.existsSync(filePath) ? filePath : "";
}

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
  return value;
}

function formatPostalCode(value: string | null | undefined) {
  if (!value) return "";
  const raw = String(value).trim();

  if (/^\d{7}$/.test(raw)) {
    return `〒${raw.slice(0, 3)}-${raw.slice(3)}`;
  }

  if (/^\d{3}-\d{4}$/.test(raw)) {
    return `〒${raw}`;
  }

  return raw.startsWith("〒") ? raw : `〒${raw}`;
}

function safeText(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || "-";
}

async function getInvoiceId(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      invoice_id?: string;
      invoiceId?: string;
    };

    return body.invoice_id?.trim() || body.invoiceId?.trim() || "";
  }

  const formData = await req.formData();
  return String(formData.get("invoice_id") || formData.get("invoiceId") || "");
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 9,
    color: "#111827",
    backgroundColor: "#ffffff",
    paddingTop: 26,
    paddingBottom: 24,
    paddingHorizontal: 32,
  },
  header: {
    position: "relative",
    borderBottomWidth: 2,
    borderBottomColor: "#111827",
    paddingBottom: 12,
    marginBottom: 16,
    minHeight: 96,
  },
  headerLogoArea: {
    position: "absolute",
    left: 0,
    top: 4,
    width: 160,
  },
  headerTitleArea: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMetaArea: {
    position: "absolute",
    right: 0,
    top: 14,
    width: 205,
  },
  localLogo: {
    width: 140,
    height: 56,
    objectFit: "contain",
  },
  fallbackBrand: {
    fontSize: 11,
    color: "#111827",
    fontWeight: 700,
    marginTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 5,
    textAlign: "center",
  },
  metaLine: {
    fontSize: 9,
    lineHeight: 1.7,
    textAlign: "right",
  },
  metaDue: {
    fontSize: 10,
    lineHeight: 1.7,
    color: "#B91C1C",
    fontWeight: 700,
    textAlign: "right",
  },
  topRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 12,
  },
  billToBox: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    padding: 9,
    minHeight: 74,
  },
  issuerBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 9,
    minHeight: 74,
  },
  sectionSmall: {
    fontSize: 8,
    color: "#6B7280",
    marginBottom: 5,
  },
  billToName: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 7,
  },
  issuerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  issuerName: {
    fontSize: 12,
    fontWeight: 700,
    flex: 1,
    paddingRight: 8,
  },
  issuerSeal: {
    width: 42,
    height: 42,
    objectFit: "contain",
  },
  line: {
    fontSize: 8.5,
    lineHeight: 1.45,
  },
  subjectBox: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    marginBottom: 10,
  },
  subjectLabel: {
    fontSize: 8,
    color: "#6B7280",
    marginBottom: 3,
  },
  subjectText: {
    fontSize: 12,
    fontWeight: 700,
  },
  amountBox: {
    borderWidth: 2,
    borderColor: "#111827",
    backgroundColor: "#F8FAFC",
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignItems: "center",
  },
  amountLabel: {
    fontSize: 10,
    color: "#111827",
    marginBottom: 5,
    fontWeight: 700,
  },
  amountValue: {
    fontSize: 34,
    fontWeight: 700,
    color: "#111827",
  },
  table: {
    borderWidth: 1,
    borderColor: "#111827",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
  },
  thName: {
    width: "34%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#E5E7EB",
    padding: 6,
    fontWeight: 700,
  },
  thDescription: {
    width: "26%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#E5E7EB",
    padding: 6,
    fontWeight: 700,
  },
  thQty: {
    width: "10%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#E5E7EB",
    padding: 6,
    textAlign: "right",
    fontWeight: 700,
  },
  thUnit: {
    width: "15%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#E5E7EB",
    padding: 6,
    textAlign: "right",
    fontWeight: 700,
  },
  thAmount: {
    width: "15%",
    borderBottomWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#E5E7EB",
    padding: 6,
    textAlign: "right",
    fontWeight: 700,
  },
  tdName: {
    width: "34%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 6,
  },
  tdDescription: {
    width: "26%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 6,
  },
  tdQty: {
    width: "10%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 6,
    textAlign: "right",
  },
  tdUnit: {
    width: "15%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 6,
    textAlign: "right",
  },
  tdAmount: {
    width: "15%",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 6,
    textAlign: "right",
  },
  totalArea: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  bankBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#ffffff",
    padding: 10,
    minHeight: 76,
  },
  totalBox: {
    width: 220,
    borderWidth: 1,
    borderColor: "#111827",
  },
  totalRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#111827",
  },
  totalRowLast: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
  },
  totalLabel: {
    width: "42%",
    padding: 7,
    borderRightWidth: 1,
    borderColor: "#111827",
    fontWeight: 700,
  },
  totalValue: {
    width: "58%",
    padding: 7,
    textAlign: "right",
  },
  totalValueStrong: {
    width: "58%",
    padding: 7,
    textAlign: "right",
    fontSize: 13,
    fontWeight: 700,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 5,
  },
  bankText: {
    fontSize: 8.5,
    lineHeight: 1.55,
  },
  noteBox: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
    minHeight: 44,
    marginBottom: 8,
  },
  noteText: {
    fontSize: 8.5,
    lineHeight: 1.5,
  },
  footer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#D1D5DB",
    fontSize: 7.5,
    color: "#4B5563",
  },
});

function WarrantyInvoicePdf({
  invoice,
  items,
  headquarters,
}: PdfProps): React.ReactElement {
  const billToName =
    invoice.bill_to_company_name || invoice.bill_to_name || "宛先未設定";

  const issuerName = headquarters?.company_name || DEFAULT_COMPANY_NAME;
  const issuerPhone = headquarters?.phone || DEFAULT_PHONE;
  const issuerEmail = headquarters?.email || DEFAULT_EMAIL;
  const issuerInvoiceNumber = normalizeQualifiedInvoiceIssuerNumber(
    headquarters?.invoice_number
  );
  const issuerAddress = [
    formatPostalCode(headquarters?.postal_code || DEFAULT_POSTAL_CODE),
    headquarters?.address || DEFAULT_ADDRESS,
  ]
    .filter(Boolean)
    .join(" ");

  const localLogoPath = getPublicImagePath("star-warranty-logo.jpg");
  const localSealPath = getPublicImagePath("star-warranty-seal.jpg");

  const bankInfo = invoice.bank_account_info || DEFAULT_BANK_INFO;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          { style: styles.headerLogoArea },
          localLogoPath
            ? React.createElement(Image, {
                style: styles.localLogo,
                src: localLogoPath,
              })
            : React.createElement(
                Text,
                { style: styles.fallbackBrand },
                "STAR WARRANTY"
              )
        ),
        React.createElement(
          View,
          { style: styles.headerTitleArea },
          React.createElement(Text, { style: styles.title }, "請 求 書")
        ),
        React.createElement(
          View,
          { style: styles.headerMetaArea },
          React.createElement(
            Text,
            { style: styles.metaLine },
            `請求書番号：${safeText(invoice.invoice_no)}`
          ),
          React.createElement(
            Text,
            { style: styles.metaLine },
            `請求日：${formatDate(invoice.invoice_date)}`
          ),
          React.createElement(
            Text,
            { style: styles.metaDue },
            `支払期限：${formatDate(invoice.payment_due_date)}`
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.topRow },
        React.createElement(
          View,
          { style: styles.billToBox },
          React.createElement(Text, { style: styles.sectionSmall }, "ご請求先"),
          React.createElement(
            Text,
            { style: styles.billToName },
            `${billToName} 御中`
          ),
          invoice.bill_to_name
            ? React.createElement(
                Text,
                { style: styles.line },
                `ご担当者：${invoice.bill_to_name}`
              )
            : null
        ),
        React.createElement(
          View,
          { style: styles.issuerBox },
          React.createElement(Text, { style: styles.sectionSmall }, "発行元"),
          React.createElement(
            View,
            { style: styles.issuerNameRow },
            React.createElement(Text, { style: styles.issuerName }, issuerName),
            localSealPath
              ? React.createElement(Image, {
                  style: styles.issuerSeal,
                  src: localSealPath,
                })
              : null
          ),
          React.createElement(Text, { style: styles.line }, issuerAddress || "-"),
          React.createElement(
            Text,
            { style: styles.line },
            `TEL：${safeText(issuerPhone)}`
          ),
          React.createElement(
            Text,
            { style: styles.line },
            `Email：${safeText(issuerEmail)}`
          ),
          React.createElement(
            Text,
            { style: styles.line },
            `適格請求書発行事業者登録番号：${
              issuerInvoiceNumber || "未設定"
            }`
          ),
          headquarters?.representative_name
            ? React.createElement(
                Text,
                { style: styles.line },
                `担当者：${headquarters.representative_name}`
              )
            : null
        )
      ),

      React.createElement(
        View,
        { style: styles.subjectBox },
        React.createElement(Text, { style: styles.subjectLabel }, "件名"),
        React.createElement(
          Text,
          { style: styles.subjectText },
          safeText(invoice.subject)
        )
      ),

      React.createElement(
        View,
        { style: styles.amountBox },
        React.createElement(Text, { style: styles.amountLabel }, "ご請求金額"),
        React.createElement(
          Text,
          { style: styles.amountValue },
          formatYen(invoice.total_amount)
        )
      ),

      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.thName }, "摘要"),
          React.createElement(Text, { style: styles.thDescription }, "説明"),
          React.createElement(Text, { style: styles.thQty }, "数量"),
          React.createElement(Text, { style: styles.thUnit }, "単価"),
          React.createElement(Text, { style: styles.thAmount }, "明細金額")
        ),
        ...items.map((item) =>
          React.createElement(
            View,
            { key: item.id, style: styles.row },
            React.createElement(
              Text,
              { style: styles.tdName },
              safeText(item.item_name)
            ),
            React.createElement(
              Text,
              { style: styles.tdDescription },
              safeText(item.description)
            ),
            React.createElement(
              Text,
              { style: styles.tdQty },
              Number(item.quantity || 0).toLocaleString("ja-JP")
            ),
            React.createElement(
              Text,
              { style: styles.tdUnit },
              formatYen(item.unit_price)
            ),
            React.createElement(
              Text,
              { style: styles.tdAmount },
              formatYen(item.amount)
            )
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.totalArea },
        React.createElement(
          View,
          { style: styles.bankBox },
          React.createElement(Text, { style: styles.sectionTitle }, "お振込先"),
          React.createElement(Text, { style: styles.bankText }, bankInfo),
          React.createElement(
            Text,
            { style: styles.bankText },
            "※恐れ入りますが、振込手数料は貴社負担にてお願いいたします。"
          )
        ),
        React.createElement(
          View,
          { style: styles.totalBox },
          React.createElement(
            View,
            { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "小計"),
            React.createElement(
              Text,
              { style: styles.totalValue },
              formatYen(invoice.subtotal)
            )
          ),
          React.createElement(
            View,
            { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "消費税"),
            React.createElement(
              Text,
              { style: styles.totalValue },
              formatYen(invoice.tax_amount)
            )
          ),
          React.createElement(
            View,
            { style: styles.totalRowLast },
            React.createElement(Text, { style: styles.totalLabel }, "合計"),
            React.createElement(
              Text,
              { style: styles.totalValueStrong },
              formatYen(invoice.total_amount)
            )
          )
        )
      ),

      React.createElement(Text, { style: styles.sectionTitle }, "備考"),
      React.createElement(
        View,
        { style: styles.noteBox },
        React.createElement(
          Text,
          { style: styles.noteText },
          invoice.note ||
            headquarters?.note ||
            "※2026/4/1より株式会社バリュー・エージェントから業務譲渡し、株式会社スター・ワランティにて運営しております。\nご不明点がございましたら発行元までご連絡ください。"
        )
      )
    )
  );
}

export async function POST(req: Request) {
  try {
    ensureJapaneseFont();

    const invoiceId = (await getInvoiceId(req)).trim();

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: "invoice_id がありません" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: invoice, error: invoiceError } = await supabase
      .from("warranty_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: "請求書データが見つかりません" },
        { status: 404 }
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from("warranty_invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true });

    if (itemsError) {
      return NextResponse.json(
        { success: false, error: "請求明細の取得に失敗しました" },
        { status: 500 }
      );
    }

    const { data: headquarters } = await supabase
      .from("headquarters_settings")
      .select(
        "company_name, representative_name, email, phone, postal_code, address, note, logo_url, invoice_number"
      )
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const documentElement = React.createElement(
      WarrantyInvoicePdf as React.ComponentType<PdfProps>,
      {
        invoice: invoice as WarrantyInvoice,
        items: (items || []) as WarrantyInvoiceItem[],
        headquarters: headquarters as HeadquartersSettings | null,
      }
    ) as React.ReactElement<DocumentProps>;

    const instance = pdf(documentElement);
    const pdfBytes = (await instance.toBuffer()) as unknown as Buffer;

    const invoiceData = invoice as WarrantyInvoice;
    const filename = `warranty-invoice-${
      invoiceData.invoice_no || invoiceData.id
    }.pdf`;

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("generate-warranty-invoice-pdf route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "請求書PDF生成中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}
