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

type WarrantyCertificate = {
  id: string;
  certificate_no: string | null;
  customer_name: string | null;
  customer_name_kana: string | null;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  property_name: string | null;
  property_room: string | null;
  product_name: string | null;
  manufacturer: string | null;
  model_no: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  introducer_name: string | null;
  seller_name: string | null;
  created_at: string | null;
};

type CertificateItem = {
  id: string;
  certificate_id: string | null;
  product_name: string | null;
  category: string | null;
  warranty_years: number | null;
  max_amount: number | null;
  is_active: boolean | null;
};

type PdfProps = {
  certificate: WarrantyCertificate;
  items: CertificateItem[];
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

function safeText(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value;
}

function formatPostalCode(value: string | null | undefined) {
  if (!value) return "-";

  const raw = String(value).trim();

  if (/^\d{7}$/.test(raw)) {
    return `〒${raw.slice(0, 3)}-${raw.slice(3)}`;
  }

  if (/^\d{3}-\d{4}$/.test(raw)) {
    return `〒${raw}`;
  }

  return raw.startsWith("〒") ? raw : `〒${raw}`;
}

function formatYen(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "有効";
    case "expired":
      return "期限切れ";
    case "cancelled":
      return "取消";
    default:
      return status || "未設定";
  }
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
    marginBottom: 22,
    letterSpacing: 2,
  },
  section: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "50%",
    marginBottom: 9,
  },
  label: {
    fontSize: 8,
    color: "#6B7280",
    marginBottom: 3,
  },
  value: {
    fontSize: 10.5,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  fullCell: {
    width: "100%",
    marginBottom: 9,
  },
  table: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  row: {
    flexDirection: "row",
  },
  thProduct: {
    width: "35%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    fontWeight: 700,
  },
  thCategory: {
    width: "25%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    fontWeight: 700,
  },
  thYears: {
    width: "15%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    fontWeight: 700,
  },
  thAmount: {
    width: "25%",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 8,
    fontWeight: 700,
  },
  tdProduct: {
    width: "35%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
  },
  tdCategory: {
    width: "25%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
  },
  tdYears: {
    width: "15%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
  },
  tdAmount: {
    width: "25%",
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
    padding: 8,
  },
  note: {
    fontSize: 8.5,
    color: "#6B7280",
    lineHeight: 1.6,
    marginTop: 10,
  },
});

function WarrantyCertificatePdf(props: PdfProps): React.ReactElement {
  const certificate = props.certificate;
  const items = props.items;

  const address = [
    certificate.address1,
    certificate.address2,
    certificate.address3,
  ]
    .filter(Boolean)
    .join(" ");

  const property = [certificate.property_name, certificate.property_room]
    .filter(Boolean)
    .join(" ");

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.title }, "保 証 書"),

      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "基本情報"),
        React.createElement(
          View,
          { style: styles.grid },
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "保証書番号"),
            React.createElement(
              Text,
              { style: styles.value },
              safeText(certificate.certificate_no)
            )
          ),
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "状態"),
            React.createElement(
              Text,
              { style: styles.value },
              statusLabel(certificate.status)
            )
          ),
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "施主名"),
            React.createElement(
              Text,
              { style: styles.value },
              safeText(certificate.customer_name)
            )
          ),
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "施主名カナ"),
            React.createElement(
              Text,
              { style: styles.value },
              safeText(certificate.customer_name_kana)
            )
          ),
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "保証開始日"),
            React.createElement(
              Text,
              { style: styles.value },
              formatDate(certificate.start_date)
            )
          ),
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "保証終了日"),
            React.createElement(
              Text,
              { style: styles.value },
              formatDate(certificate.end_date)
            )
          ),
          React.createElement(
            View,
            { style: styles.fullCell },
            React.createElement(Text, { style: styles.label }, "住所"),
            React.createElement(
              Text,
              { style: styles.value },
              `${formatPostalCode(certificate.postal_code)} ${address || "-"}`
            )
          ),
          React.createElement(
            View,
            { style: styles.fullCell },
            React.createElement(Text, { style: styles.label }, "物件名・部屋番号"),
            React.createElement(Text, { style: styles.value }, property || "-")
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "保証対象機器"),
        items.length === 0
          ? React.createElement(Text, { style: styles.value }, "保証対象機器は登録されていません。")
          : React.createElement(
              View,
              { style: styles.table },
              React.createElement(
                View,
                { style: styles.row },
                React.createElement(Text, { style: styles.thProduct }, "商品名"),
                React.createElement(Text, { style: styles.thCategory }, "カテゴリ"),
                React.createElement(Text, { style: styles.thYears }, "年数"),
                React.createElement(Text, { style: styles.thAmount }, "保証限度額")
              ),
              ...items.map((item) =>
                React.createElement(
                  View,
                  { key: item.id, style: styles.row },
                  React.createElement(
                    Text,
                    { style: styles.tdProduct },
                    safeText(item.product_name)
                  ),
                  React.createElement(
                    Text,
                    { style: styles.tdCategory },
                    safeText(item.category)
                  ),
                  React.createElement(
                    Text,
                    { style: styles.tdYears },
                    item.warranty_years ? `${item.warranty_years}年` : "-"
                  ),
                  React.createElement(
                    Text,
                    { style: styles.tdAmount },
                    formatYen(item.max_amount)
                  )
                )
              )
            )
      ),

      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "販売・紹介情報"),
        React.createElement(
          View,
          { style: styles.grid },
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "紹介者名"),
            React.createElement(
              Text,
              { style: styles.value },
              safeText(certificate.introducer_name)
            )
          ),
          React.createElement(
            View,
            { style: styles.cell },
            React.createElement(Text, { style: styles.label }, "販売店名"),
            React.createElement(
              Text,
              { style: styles.value },
              safeText(certificate.seller_name)
            )
          )
        )
      ),

      React.createElement(
        Text,
        { style: styles.note },
        "※本保証書は登録内容に基づきシステムから発行されています。修理受付は保証書詳細のQRコードまたは修理受付フォームから行ってください。"
      )
    )
  );
}

async function generatePdfById(certificateId: string) {
  ensureJapaneseFont();

  const supabase = getAdminClient();

  const { data: certificate, error: certificateError } = await supabase
    .from("warranty_certificates")
    .select("*")
    .eq("id", certificateId)
    .single();

  if (certificateError || !certificate) {
    return NextResponse.json(
      { success: false, error: "保証書データが見つかりません" },
      { status: 404 }
    );
  }

  const { data: items } = await supabase
    .from("warranty_certificate_items")
    .select("*")
    .eq("certificate_id", certificateId);

  const certificateData = certificate as WarrantyCertificate;
  const itemRows = (items || []) as CertificateItem[];

  const documentElement = React.createElement(
    WarrantyCertificatePdf as React.ComponentType<PdfProps>,
    {
      certificate: certificateData,
      items: itemRows,
    }
  ) as React.ReactElement<DocumentProps>;

  const instance = pdf(documentElement);
  const pdfBytes = (await instance.toBuffer()) as unknown as Buffer;

  const filename = `warranty-${certificateData.certificate_no || certificateData.id}.pdf`;

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const certificateId = url.searchParams.get("id")?.trim();

    if (!certificateId) {
      return NextResponse.json(
        { success: false, error: "id がありません" },
        { status: 400 }
      );
    }

    return await generatePdfById(certificateId);
  } catch (error) {
    console.error("generate-warranty-pdf GET route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "保証書PDF生成中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; certificate_id?: string };
    const certificateId = body.id?.trim() || body.certificate_id?.trim();

    if (!certificateId) {
      return NextResponse.json(
        { success: false, error: "id がありません" },
        { status: 400 }
      );
    }

    return await generatePdfById(certificateId);
  } catch (error) {
    console.error("generate-warranty-pdf POST route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "保証書PDF生成中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}