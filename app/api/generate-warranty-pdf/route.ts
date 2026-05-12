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
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GenerateWarrantyInvoicePdfBody = {
  invoice_id?: string;
  invoiceId?: string;
};

type WarrantyInvoice = {
  id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  payment_due_date: string | null;
  subject: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  bill_to_postal_code: string | null;
  bill_to_address: string | null;
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

type PdfProps = {
  invoice: WarrantyInvoice;
  items: WarrantyInvoiceItem[];
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
  if (!raw) return "";

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
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 24,
    letterSpacing: 2,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 22,
  },
  billToBox: {
    width: "48%",
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    paddingBottom: 10,
  },
  issuerBox: {
    width: "48%",
    alignItems: "flex-start",
  },
  billToName: {
    fontSize: 17,
    fontWeight: 700,
    marginBottom: 8,
  },
  line: {
    fontSize: 9.5,
    lineHeight: 1.5,
    marginBottom: 3,
  },
  issuerName: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 7,
  },
  metaBox: {
    marginBottom: 18,
    gap: 4,
  },
  metaText: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  subjectBox: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 12,
    marginBottom: 18,
  },
  subjectLabel: {
    fontSize: 9,
    color: "#6B7280",
    marginBottom: 4,
  },
  subjectText: {
    fontSize: 13,
    fontWeight: 700,
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
  table: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
  },
  thName: {
    width: "34%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    fontWeight: 700,
  },
  thDescription: {
    width: "26%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    fontWeight: 700,
  },
  thQty: {
    width: "10%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    textAlign: "right",
    fontWeight: 700,
  },
  thUnit: {
    width: "15%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    textAlign: "right",
    fontWeight: 700,
  },
  thAmount: {
    width: "15%",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    textAlign: "right",
    fontWeight: 700,
  },
  tdName: {
    width: "34%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
  },
  tdDescription: {
    width: "26%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
  },
  tdQty: {
    width: "10%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
    textAlign: "right",
  },
  tdUnit: {
    width: "15%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
    textAlign: "right",
  },
  tdAmount: {
    width: "15%",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
    textAlign: "right",
  },
  totalWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 20,
  },
  totalBox: {
    width: "42%",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  totalRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
  },
  totalRowLast: {
    flexDirection: "row",
  },
  totalLabel: {
    width: "45%",
    backgroundColor: "#F9FAFB",
    padding: 8,
    borderRightWidth: 1,
    borderColor: "#D1D5DB",
  },
  totalValue: {
    width: "55%",
    padding: 8,
    textAlign: "right",
  },
  totalValueStrong: {
    width: "55%",
    padding: 8,
    textAlign: "right",
    fontSize: 13,
    fontWeight: 700,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 7,
  },
  noteBox: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    padding: 10,
    minHeight: 52,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 9.5,
    lineHeight: 1.6,
  },
});

function WarrantyInvoicePdf(props: PdfProps): React.ReactElement {
  const invoice = props.invoice;
  const items = props.items;

  const billToName =
    invoice.bill_to_company_name || invoice.bill_to_name || "宛先未設定";

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.title }, "請 求 書"),

      React.createElement(
        View,
        { style: styles.topRow },
        React.createElement(
          View,
          { style: styles.billToBox },
          React.createElement(Text, { style: styles.billToName }, `${billToName} 御中`),
          invoice.bill_to_name
            ? React.createElement(
                Text,
                { style: styles.line },
                `ご担当者：${invoice.bill_to_name}`
              )
            : null,
          invoice.bill_to_postal_code
            ? React.createElement(
                Text,
                { style: styles.line },
                formatPostalCode(invoice.bill_to_postal_code)
              )
            : null,
          invoice.bill_to_address
            ? React.createElement(
                Text,
                { style: styles.line },
                invoice.bill_to_address
              )
            : null
        ),

        React.createElement(
          View,
          { style: styles.issuerBox },
         React.createElement(
  Text,
  { style: styles.issuerName },
  "STAR WARRANTY"
)
        )
      )
    )
  );
}

export async function POST(req: Request) {
  try {
    ensureJapaneseFont();

    const body = (await req.json()) as GenerateWarrantyInvoicePdfBody;
    const invoiceId = body.invoice_id?.trim() || body.invoiceId?.trim();

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

    const invoiceData = invoice as WarrantyInvoice;
    const itemRows = (items || []) as WarrantyInvoiceItem[];

    const documentElement = React.createElement(
      WarrantyInvoicePdf as React.ComponentType<PdfProps>,
      {
        invoice: invoiceData,
        items: itemRows,
      }
    ) as React.ReactElement<DocumentProps>;

    const instance = pdf(documentElement);
    const pdfBytes = (await instance.toBuffer()) as unknown as Buffer;

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