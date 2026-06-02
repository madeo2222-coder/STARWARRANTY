import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import React from "react";
import QRCode from "qrcode";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyRow = Record<string, any>;

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
  product_id: string | null;
  warranty_product_id: string | null;
  warranty_products_id: string | null;
  equipment_id: string | null;
  product_name: string | null;
  name: string | null;
  category: string | null;
  warranty_years: number | null;
  is_active: boolean | null;
  is_enabled: boolean | null;
};

type WarrantyProduct = {
  id: string;
  product_name: string | null;
  name: string | null;
  category: string | null;
  product_code: string | null;
  warranty_years: number | null;
};

type DisplayProduct = {
  name: string;
  category: string;
  years: number | null;
};

type PdfProps = {
  certificate: WarrantyCertificate;
  items: CertificateItem[];
  productMap: Map<string, WarrantyProduct>;
  repairUrl: string;
  qrDataUrl: string;
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

function pickText(row: AnyRow | null | undefined, keys: string[]) {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function uniqueTexts(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function getProductIdFromItem(item: CertificateItem) {
  return pickText(item as AnyRow, [
    "product_id",
    "warranty_product_id",
    "warranty_products_id",
    "equipment_id",
  ]);
}

function getProductNameFromProduct(product: WarrantyProduct | null | undefined) {
  return pickText(product as AnyRow, [
    "product_name",
    "name",
    "category",
    "product_code",
  ]);
}

function getProductCategoryFromProduct(
  product: WarrantyProduct | null | undefined
) {
  return pickText(product as AnyRow, ["category"]);
}

function getWarrantyYearsFromProduct(
  product: WarrantyProduct | null | undefined
) {
  const years = Number(product?.warranty_years || 0);
  return years > 0 ? years : null;
}

function getProductNameFromItem(
  item: CertificateItem,
  productMap: Map<string, WarrantyProduct>
) {
  const directName = pickText(item as AnyRow, [
    "product_name",
    "name",
    "category",
  ]);

  if (directName) {
    return directName;
  }

  const productId = getProductIdFromItem(item);

  if (!productId) {
    return "";
  }

  return getProductNameFromProduct(productMap.get(productId));
}

function getCategoryFromItem(
  item: CertificateItem,
  productMap: Map<string, WarrantyProduct>
) {
  const directCategory = pickText(item as AnyRow, ["category"]);

  if (directCategory) {
    return directCategory;
  }

  const productId = getProductIdFromItem(item);

  if (!productId) {
    return "";
  }

  return getProductCategoryFromProduct(productMap.get(productId));
}

function getWarrantyYearsFromItem(
  item: CertificateItem,
  productMap: Map<string, WarrantyProduct>
) {
  const itemYears = Number(item.warranty_years || 0);

  if (itemYears > 0) {
    return itemYears;
  }

  const productId = getProductIdFromItem(item);

  if (!productId) {
    return null;
  }

  return getWarrantyYearsFromProduct(productMap.get(productId));
}

function isActiveItem(item: CertificateItem) {
  if ("is_active" in item && item.is_active === false) return false;
  if ("is_enabled" in item && item.is_enabled === false) return false;
  return true;
}

function getDisplayProducts(
  items: CertificateItem[],
  productMap: Map<string, WarrantyProduct>
) {
  const activeItems = items.filter((item) => isActiveItem(item));

  const displayProducts = activeItems
    .map((item) => {
      const name = getProductNameFromItem(item, productMap);
      const category = getCategoryFromItem(item, productMap);
      const years = getWarrantyYearsFromItem(item, productMap);

      return {
        name,
        category,
        years,
      };
    })
    .filter((product) => product.name.length > 0);

  const uniqueMap = new Map<string, DisplayProduct>();

  for (const product of displayProducts) {
    const key = `${product.name}-${product.category}-${product.years || ""}`;

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, product);
    }
  }

  return Array.from(uniqueMap.values());
}

function getWarrantyYears(
  items: CertificateItem[],
  productMap: Map<string, WarrantyProduct>
) {
  const years = getDisplayProducts(items, productMap)
    .map((item) => Number(item.years || 0))
    .filter((year) => year > 0);

  return years.length > 0 ? Math.max(...years) : 10;
}

function getMainProduct(
  certificate: WarrantyCertificate,
  items: CertificateItem[],
  productMap: Map<string, WarrantyProduct>
) {
  if (certificate.product_name) return certificate.product_name;

  const names = getDisplayProducts(items, productMap).map((item) => item.name);

  return names.length > 0 ? names.join("、") : "";
}

function splitIntoColumns<T>(items: T[], columnCount: number) {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

const styles = StyleSheet.create({
  page: {
    position: "relative",
    fontFamily: "NotoSansJP",
    padding: 0,
  },
  bg: {
    width: "100%",
    height: "100%",
  },
  text: {
    position: "absolute",
    fontSize: 8,
    color: "#111827",
    fontWeight: 700,
  },
  whiteBox: {
    position: "absolute",
    backgroundColor: "#ffffff",
  },
  productText: {
    position: "absolute",
    fontSize: 8,
    color: "#111827",
    fontWeight: 700,
    textAlign: "center",
  },
  yearsText: {
    position: "absolute",
    fontSize: 22,
    color: "#1F2A44",
    fontWeight: 700,
    textAlign: "center",
  },
  qrImage: {
    position: "absolute",
    width: 66,
    height: 66,
  },
  qrCaption: {
    position: "absolute",
    fontSize: 6,
    color: "#111827",
    textAlign: "center",
  },
  coveredArea: {
    position: "absolute",
    top: 190,
    left: 52,
    width: 490,
    minHeight: 455,
    backgroundColor: "#ffffff",
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  coveredTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  coveredLead: {
    fontSize: 8,
    color: "#374151",
    textAlign: "center",
    marginBottom: 10,
  },
  coveredColumns: {
    flexDirection: "row",
    gap: 8,
  },
  coveredColumn: {
    flex: 1,
    gap: 6,
  },
  coveredItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 5,
    minHeight: 25,
  },
  coveredItemName: {
    fontSize: 8.5,
    fontWeight: 700,
    color: "#111827",
  },
  coveredItemSub: {
    marginTop: 2,
    fontSize: 6.5,
    color: "#6b7280",
  },
});

function CoveredProductsList({
  products,
}: {
  products: DisplayProduct[];
}) {
  const columns = splitIntoColumns(products.slice(0, 39), 3);

  return React.createElement(
    View,
    { style: styles.coveredArea },

    React.createElement(
      Text,
      { style: styles.coveredTitle },
      "延長保証の対象となる対象設備機器"
    ),

    React.createElement(
      Text,
      { style: styles.coveredLead },
      "本保証書で選択された加入保証のみを表示しています。"
    ),

    React.createElement(
      View,
      { style: styles.coveredColumns },
      ...columns.map((column, columnIndex) =>
        React.createElement(
          View,
          { key: `column-${columnIndex}`, style: styles.coveredColumn },
          ...column.map((product, itemIndex) =>
            React.createElement(
              View,
              {
                key: `${product.name}-${columnIndex}-${itemIndex}`,
                style: styles.coveredItem,
              },
              React.createElement(
                Text,
                { style: styles.coveredItemName },
                product.name
              ),
              React.createElement(
                Text,
                { style: styles.coveredItemSub },
                `${product.category || "対象設備"} / ${
                  product.years ? `${product.years}年` : "保証期間"
                }`
              )
            )
          )
        )
      )
    )
  );
}

function WarrantyTemplatePdf({
  certificate,
  items,
  productMap,
  repairUrl,
  qrDataUrl,
}: PdfProps) {
  const address = [
    certificate.address1,
    certificate.address2,
    certificate.address3,
  ]
    .filter(Boolean)
    .join(" ");

  const product = getMainProduct(certificate, items, productMap);
  const years = getWarrantyYears(items, productMap);
  const displayProducts = getDisplayProducts(items, productMap);

  return React.createElement(
    Document,
    null,

    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: false },
      React.createElement(Image, {
        src: templateImage("page-1.png"),
        style: styles.bg,
      }),

      React.createElement(View, {
        style: [styles.whiteBox, { top: 65, left: 65, width: 120, height: 16 }],
      }),
      React.createElement(
        Text,
        {
          style: [styles.text, { top: 69, left: 67, width: 118, fontSize: 9 }],
        },
        safeText(certificate.customer_name)
      ),

      React.createElement(View, {
        style: [styles.whiteBox, { top: 113, left: 55, width: 215, height: 18 }],
      }),
      React.createElement(
        Text,
        {
          style: [styles.text, { top: 116, left: 57, width: 210, fontSize: 7 }],
        },
        `${formatPostalCode(certificate.postal_code)} ${address}`
      ),

      React.createElement(View, {
        style: [styles.whiteBox, { top: 80, left: 468, width: 100, height: 13 }],
      }),
      React.createElement(
        Text,
        {
          style: [styles.text, { top: 82, left: 470, width: 100, fontSize: 7 }],
        },
        safeText(certificate.certificate_no)
      ),

      React.createElement(View, {
        style: [
          styles.whiteBox,
          { top: 105, left: 468, width: 100, height: 13 },
        ],
      }),
      React.createElement(
        Text,
        {
          style: [styles.text, { top: 107, left: 470, width: 100, fontSize: 7 }],
        },
        formatDate(certificate.start_date)
      ),

      React.createElement(View, {
        style: [styles.whiteBox, { top: 283, left: 69, width: 118, height: 12 }],
      }),
      React.createElement(
        Text,
        {
          style: [styles.productText, { top: 283, left: 69, width: 118 }],
        },
        product
      ),

      React.createElement(View, {
        style: [styles.whiteBox, { top: 274, left: 456, width: 45, height: 31 }],
      }),
      React.createElement(
        Text,
        {
          style: [styles.yearsText, { top: 274, left: 455, width: 50 }],
        },
        `${years}年`
      ),

      React.createElement(View, {
        style: [styles.whiteBox, { top: 540, left: 65, width: 78, height: 78 }],
      }),
      React.createElement(Image, {
        src: qrDataUrl,
        style: [styles.qrImage, { top: 546, left: 71 }],
      }),
      React.createElement(
        Text,
        {
          style: [styles.qrCaption, { top: 615, left: 61, width: 88 }],
        },
        "修理受付はこちら"
      )
    ),

    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: false },
      React.createElement(Image, {
        src: templateImage("page-2.png"),
        style: styles.bg,
      })
    ),

    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: false },
      React.createElement(Image, {
        src: templateImage("page-3.png"),
        style: styles.bg,
      }),

      React.createElement(View, {
        style: [styles.whiteBox, { top: 150, left: 178, width: 190, height: 20 }],
      }),
      React.createElement(
        Text,
        {
          style: [styles.text, { top: 153, left: 182, width: 180, fontSize: 12 }],
        },
        safeText(certificate.certificate_no)
      ),

      displayProducts.length > 0
        ? React.createElement(CoveredProductsList, {
            products: displayProducts,
          })
        : React.createElement(
            View,
            { style: styles.coveredArea },
            React.createElement(
              Text,
              { style: styles.coveredTitle },
              "延長保証の対象となる対象設備機器"
            ),
            React.createElement(
              Text,
              { style: styles.coveredLead },
              "対象設備機器が登録されていません。"
            )
          )
    )
  );
}

async function getProductMap(
  supabase: any,
  itemRows: CertificateItem[]
) {
  const productIds = uniqueTexts(
  itemRows.map((item: CertificateItem) => getProductIdFromItem(item))
);

  if (productIds.length === 0) {
    return new Map<string, WarrantyProduct>();
  }

  const { data: productRows, error: productError } = await supabase
    .from("warranty_products")
    .select("*")
    .in("id", productIds);

  if (productError) {
    throw new Error(`保証対象機器マスタの取得に失敗しました: ${productError.message}`);
  }

  return new Map(
    ((productRows || []) as WarrantyProduct[]).map((product) => [
      safeText(product.id),
      product,
    ])
  );
}

async function generatePdfById(certificateId: string, requestUrl: string) {
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
  const productMap = await getProductMap(supabase, itemRows);

  const origin = new URL(requestUrl).origin;

  const repairUrl = certificateData.repair_form_token
    ? `${origin}/repair-request-form?token=${certificateData.repair_form_token}`
    : `${origin}/repair-request-form`;

  const qrDataUrl = await QRCode.toDataURL(repairUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 260,
  });

  const documentElement = React.createElement(
    WarrantyTemplatePdf as React.ComponentType<PdfProps>,
    {
      certificate: certificateData,
      items: itemRows,
      productMap,
      repairUrl,
      qrDataUrl,
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

    return await generatePdfById(certificateId, req.url);
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

    return await generatePdfById(certificateId, req.url);
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