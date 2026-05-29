import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import React from "react";
import {
  pdf,
  Document,
  Page,
  Text,
  Image,
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
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  product_name: string | null;
  start_date: string | null;
  repair_form_token: string | null;
};

type CertificateItem = {
  id: string;
  product_name: string | null;
  category: string | null;
  warranty_years: number | null;
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

function templateImage(name: string) {
  const filePath = path.join(
    process.cwd(),
    "public",
    "warranty-template",
    name
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(`テンプレート画像が見つかりません: ${filePath}`);
  }

  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${base64}`;
}

function safeText(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return value.replaceAll("-", "/");
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

function getWarrantyYears(items: CertificateItem[]) {
  const years = items
    .map((item) => Number(item.warranty_years || 0))
    .filter((year) => year > 0);

  return years.length > 0 ? Math.max(...years) : 10;
}

function getMainProduct(certificate: WarrantyCertificate, items: CertificateItem[]) {
  if (certificate.product_name) return certificate.product_name;

  const names = items
    .filter((item) => item.is_active !== false)
    .map((item) => item.product_name || item.category)
    .filter(Boolean) as string[];

  return names.length > 0 ? names.join("、") : "";
}

const styles = StyleSheet.create({
  page: {
    width: 595.28,
    height: 841.89,
    position: "relative",
    fontFamily: "NotoSansJP",
  },
  bg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 595.28,
    height: 841.89,
  },
  text: {
    position: "absolute",
    fontSize: 9,
    color: "#111827",
    fontWeight: 700,
  },
  whitePatch: {
    position: "absolute",
    backgroundColor: "#ffffff",
  },
  productText: {
    position: "absolute",
    fontSize: 9,
    color: "#111827",
    fontWeight: 700,
    textAlign: "center",
  },
  yearsText: {
    position: "absolute",
    fontSize: 25,
    color: "#1F2A44",
    fontWeight: 700,
    textAlign: "center",
  },
});

function WarrantyTemplatePdf({ certificate, items }: PdfProps) {
  const address = [
    certificate.address1,
    certificate.address2,
    certificate.address3,
  ]
    .filter(Boolean)
    .join(" ");

  const product = getMainProduct(certificate, items);
  const years = getWarrantyYears(items);

  return React.createElement(
    Document,
    null,

    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Image, {
        src: templateImage("page-1.png"),
        style: styles.bg,
      }),

      React.createElement(Text, {
        style: [styles.text, { top: 72, left: 58, width: 135, fontSize: 10 }],
      }, safeText(certificate.customer_name)),

      React.createElement(Text, {
        style: [styles.text, { top: 119, left: 57, width: 205, fontSize: 8 }],
      }, `${formatPostalCode(certificate.postal_code)} ${address}`),

      React.createElement(Text, {
        style: [styles.text, { top: 85, left: 470, width: 100, fontSize: 8 }],
      }, safeText(certificate.certificate_no)),

      React.createElement(Text, {
        style: [styles.text, { top: 110, left: 470, width: 100, fontSize: 8 }],
      }, formatDate(certificate.start_date)),

      React.createElement(Text, {
        style: [styles.productText, { top: 281, left: 65, width: 125 }],
      }, product),

      React.createElement(Text, {
        style: [styles.yearsText, { top: 268, left: 444, width: 70 }],
      }, String(years))
    ),

    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Image, {
        src: templateImage("page-2.png"),
        style: styles.bg,
      })
    ),

    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Image, {
        src: templateImage("page-3.png"),
        style: styles.bg,
      }),

      React.createElement(Text, {
        style: [styles.text, { top: 150, left: 178, width: 180, fontSize: 14 }],
      }, safeText(certificate.certificate_no))
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

  const { data: items, error: itemsError } = await supabase
    .from("warranty_certificate_items")
    .select("*")
    .eq("certificate_id", certificateId);

  if (itemsError) {
    return NextResponse.json(
      { success: false, error: "保証対象機器の取得に失敗しました" },
      { status: 500 }
    );
  }

  const certificateData = certificate as WarrantyCertificate;
  const itemRows = (items || []) as CertificateItem[];

  const documentElement = React.createElement(
    WarrantyTemplatePdf as React.ComponentType<PdfProps>,
    {
      certificate: certificateData,
      items: itemRows,
    }
  ) as React.ReactElement<DocumentProps>;

  const instance = pdf(documentElement);
  const pdfBytes = (await instance.toBuffer()) as unknown as Buffer;

  const filename = `warranty-${
    certificateData.certificate_no || certificateData.id
  }.pdf`;

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