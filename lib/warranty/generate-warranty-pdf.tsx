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
import type { SupabaseClient } from "@supabase/supabase-js";

type AnyRow = Record<string, unknown>;

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
  product_code: string | null;
  product_name: string | null;
  name: string | null;
  category: string | null;
  warranty_years: number | null;
  is_active: boolean | null;
  sort_order: number | null;
};

type DisplayProduct = {
  name: string;
  category: string;
  years: number | null;
  sort_order: number | null;
};

type CoveredLayout = {
  columnCount: number;
  titleFontSize: number;
  leadFontSize: number;
  itemNameFontSize: number;
  itemSubFontSize: number;
  itemMinHeight: number;
  itemPaddingBottom: number;
  itemMarginBottom: number;
  columnGap: number;
};

type PdfProps = {
  certificate: WarrantyCertificate;
  items: CertificateItem[];
  productMap: Map<string, WarrantyProduct>;
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
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0)
    )
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

function getSortOrderFromProduct(product: WarrantyProduct | null | undefined) {
  const sortOrder = Number(product?.sort_order || 0);
  return sortOrder > 0 ? sortOrder : null;
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

function getSortOrderFromItem(
  item: CertificateItem,
  productMap: Map<string, WarrantyProduct>
) {
  const productId = getProductIdFromItem(item);

  if (!productId) {
    return null;
  }

  return getSortOrderFromProduct(productMap.get(productId));
}

function isActiveItem(item: CertificateItem) {
  if ("is_active" in item && item.is_active === false) return false;
  if ("is_enabled" in item && item.is_enabled === false) return false;
  return true;
}

function isActiveProduct(product: WarrantyProduct | null | undefined) {
  if (!product) return true;
  if ("is_active" in product && product.is_active === false) return false;
  return true;
}

function getDisplayProducts(
  items: CertificateItem[],
  productMap: Map<string, WarrantyProduct>
) {
  const activeItems = items.filter((item) => isActiveItem(item));

  const displayProducts = activeItems
    .map((item) => {
      const productId = getProductIdFromItem(item);
      const productMaster = productId ? productMap.get(productId) : undefined;

      if (!isActiveProduct(productMaster)) {
        return null;
      }

      const name = getProductNameFromItem(item, productMap);
      const category = getCategoryFromItem(item, productMap);
      const years = getWarrantyYearsFromItem(item, productMap);
      const sortOrder = getSortOrderFromItem(item, productMap);

      return {
        name,
        category,
        years,
        sort_order: sortOrder,
      };
    })
    .filter((product): product is DisplayProduct => {
      return product !== null && product.name.length > 0;
    });

  const uniqueMap = new Map<string, DisplayProduct>();

  for (const product of displayProducts) {
    const key = `${product.name}-${product.category}-${product.years || ""}`;

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, product);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => {
    const aOrder = a.sort_order ?? 9999;
    const bOrder = b.sort_order ?? 9999;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.name.localeCompare(b.name, "ja");
  });
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

function getMainProductForFirstPage(
  certificate: WarrantyCertificate,
  items: CertificateItem[],
  productMap: Map<string, WarrantyProduct>
) {
  const products = getDisplayProducts(items, productMap);
  const names = products.map((item) => item.name).filter(Boolean);

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return names.join("、");
  }

  if (names.length >= 3) {
    return "加入対象設備一式";
  }

  const certificateProductName = safeText(certificate.product_name);

  if (certificateProductName.length > 18) {
    return "加入対象設備一式";
  }

  return certificateProductName || "加入対象設備一式";
}

function splitIntoColumns<T>(items: T[], columnCount: number) {
  const perColumn = Math.ceil(items.length / columnCount);

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const start = columnIndex * perColumn;
    const end = start + perColumn;
    return items.slice(start, end);
  });
}

function getCoveredLayout(count: number): CoveredLayout {
  if (count <= 12) {
    return {
      columnCount: 2,
      titleFontSize: 14,
      leadFontSize: 8.8,
      itemNameFontSize: 10.6,
      itemSubFontSize: 7,
      itemMinHeight: 39,
      itemPaddingBottom: 7,
      itemMarginBottom: 7,
      columnGap: 22,
    };
  }

  if (count <= 24) {
    return {
      columnCount: 3,
      titleFontSize: 12,
      leadFontSize: 8,
      itemNameFontSize: 8.6,
      itemSubFontSize: 6.2,
      itemMinHeight: 28,
      itemPaddingBottom: 5,
      itemMarginBottom: 5,
      columnGap: 12,
    };
  }

  return {
    columnCount: 4,
    titleFontSize: 11,
    leadFontSize: 7,
    itemNameFontSize: 6.9,
    itemSubFontSize: 5,
    itemMinHeight: 21,
    itemPaddingBottom: 3,
    itemMarginBottom: 4,
    columnGap: 8,
  };
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
  recipientBox: {
    position: "absolute",
    top: 49,
    left: 51,
    width: 194,
    height: 88,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  recipientName: {
    width: "100%",
    color: "#111827",
    fontSize: 11.5,
    lineHeight: 1.35,
    textAlign: "center",
    marginBottom: 5,
  },
  recipientPostalCode: {
    width: "100%",
    color: "#374151",
    fontSize: 7.5,
    lineHeight: 1.35,
    textAlign: "center",
    marginBottom: 2,
  },
  recipientAddress: {
    width: "100%",
    color: "#111827",
    fontSize: 7.2,
    lineHeight: 1.45,
    textAlign: "center",
  },
  certificateNumber: {
    position: "absolute",
    top: 80,
    left: 467,
    width: 101,
    color: "#111827",
    fontSize: 7,
    lineHeight: 1.3,
    textAlign: "center",
  },
  warrantyStartDate: {
    position: "absolute",
    top: 105,
    left: 467,
    width: 101,
    color: "#111827",
    fontSize: 7,
    lineHeight: 1.3,
    textAlign: "center",
  },
  productText: {
    position: "absolute",
    top: 280,
    left: 54,
    width: 136,
    minHeight: 26,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: "#ffffff",
    fontSize: 8.2,
    lineHeight: 1.25,
    color: "#111827",
    textAlign: "center",
  },
  productNote: {
    position: "absolute",
    top: 305,
    left: 54,
    width: 136,
    backgroundColor: "#ffffff",
    color: "#4B5563",
    fontSize: 5.2,
    lineHeight: 1.25,
    textAlign: "center",
  },
  yearsBox: {
    position: "absolute",
    top: 273,
    left: 448,
    width: 66,
    height: 37,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  yearsText: {
    width: "100%",
    fontSize: 20,
    lineHeight: 1.15,
    color: "#1F2A44",
    textAlign: "center",
  },
  qrBlock: {
    position: "absolute",
    top: 558,
    left: 57,
    width: 99,
    height: 98,
    alignItems: "center",
  },
  qrImage: {
    width: 68,
    height: 68,
  },
  qrCaption: {
    width: "100%",
    marginTop: 3,
    fontSize: 6.2,
    lineHeight: 1.25,
    color: "#111827",
    textAlign: "center",
  },
  coveredArea: {
    position: "absolute",
    top: 184,
    left: 42,
    width: 512,
    height: 610,
    backgroundColor: "#ffffff",
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  coveredTitle: {
    fontWeight: 700,
    color: "#111827",
    textAlign: "center",
    marginBottom: 7,
  },
  coveredLead: {
    color: "#374151",
    textAlign: "center",
    marginBottom: 15,
  },
  coveredColumns: {
    flexDirection: "row",
  },
  coveredColumn: {
    flex: 1,
  },
  coveredItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  coveredItemName: {
    fontWeight: 700,
    color: "#111827",
  },
  coveredItemSub: {
    marginTop: 2,
    color: "#6b7280",
  },
});

function CoveredProductsList({
  products,
}: {
  products: DisplayProduct[];
}) {
  const visibleProducts = products.slice(0, 39);
  const layout = getCoveredLayout(visibleProducts.length);
  const columns = splitIntoColumns(visibleProducts, layout.columnCount);

  return React.createElement(
    View,
    { style: styles.coveredArea },

    React.createElement(
      Text,
      {
        style: [
          styles.coveredTitle,
          {
            fontSize: layout.titleFontSize,
          },
        ],
      },
      "延長保証の対象となる対象設備機器"
    ),

    React.createElement(
      Text,
      {
        style: [
          styles.coveredLead,
          {
            fontSize: layout.leadFontSize,
          },
        ],
      },
      "本保証書で選択された加入保証のみを表示しています。"
    ),

    React.createElement(
      View,
      { style: styles.coveredColumns },
      ...columns.map((column, columnIndex) =>
        React.createElement(
          View,
          {
            key: `column-${columnIndex}`,
            style: [
              styles.coveredColumn,
              {
                marginRight:
                  columnIndex === columns.length - 1 ? 0 : layout.columnGap,
              },
            ],
          },
          ...column.map((product, itemIndex) =>
            React.createElement(
              View,
              {
                key: `${product.name}-${columnIndex}-${itemIndex}`,
                style: [
                  styles.coveredItem,
                  {
                    minHeight: layout.itemMinHeight,
                    paddingBottom: layout.itemPaddingBottom,
                    marginBottom: layout.itemMarginBottom,
                  },
                ],
              },
              React.createElement(
                Text,
                {
                  style: [
                    styles.coveredItemName,
                    {
                      fontSize: layout.itemNameFontSize,
                    },
                  ],
                },
                product.name
              ),
              React.createElement(
                Text,
                {
                  style: [
                    styles.coveredItemSub,
                    {
                      fontSize: layout.itemSubFontSize,
                    },
                  ],
                },
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
  qrDataUrl,
}: PdfProps) {
  const address = [
    certificate.address1,
    certificate.address2,
    certificate.address3,
  ]
    .filter(Boolean)
    .join(" ");

  const product = getMainProductForFirstPage(certificate, items, productMap);
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

      React.createElement(
        View,
        { style: styles.recipientBox },
        React.createElement(
          Text,
          { style: styles.recipientName },
          safeText(certificate.customer_name)
        ),
        React.createElement(
          Text,
          { style: styles.recipientPostalCode },
          formatPostalCode(certificate.postal_code)
        ),
        React.createElement(
          Text,
          { style: styles.recipientAddress },
          address
        )
      ),

      React.createElement(
        Text,
        { style: styles.certificateNumber },
        safeText(certificate.certificate_no)
      ),
      React.createElement(
        Text,
        { style: styles.warrantyStartDate },
        formatDate(certificate.start_date)
      ),

      React.createElement(
        Text,
        { style: styles.productText },
        product
      ),
      React.createElement(
        Text,
        { style: styles.productNote },
        "※詳細は別紙リストをご確認ください"
      ),

      React.createElement(
        View,
        { style: styles.yearsBox },
        React.createElement(Text, { style: styles.yearsText }, `${years}年`)
      ),

      React.createElement(
        View,
        { style: styles.qrBlock },
        React.createElement(Image, {
          src: qrDataUrl,
          style: styles.qrImage,
        }),
        React.createElement(Text, { style: styles.qrCaption }, "修理受付はこちら")
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
              {
                style: [
                  styles.coveredTitle,
                  {
                    fontSize: 12,
                  },
                ],
              },
              "延長保証の対象となる対象設備機器"
            ),
            React.createElement(
              Text,
              {
                style: [
                  styles.coveredLead,
                  {
                    fontSize: 8,
                  },
                ],
              },
              "対象設備機器が登録されていません。"
            )
          )
    )
  );
}

async function getProductMap(
  supabase: SupabaseClient,
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

export class WarrantyPdfGenerationError extends Error {
  readonly status: 404 | 500;

  constructor(status: 404 | 500, message: string) {
    super(message);
    this.name = "WarrantyPdfGenerationError";
    this.status = status;
  }
}

export type GeneratedWarrantyPdf = {
  buffer: Buffer;
  filename: string;
};

export async function generateWarrantyPdf(
  supabase: SupabaseClient,
  certificateId: string,
  appBaseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "")
): Promise<GeneratedWarrantyPdf> {
  ensureJapaneseFont();

  const { data: certificate, error: certificateError } = await supabase
    .from("warranty_certificates")
    .select("*")
    .eq("id", certificateId)
    .single();

  if (certificateError || !certificate) {
    throw new WarrantyPdfGenerationError(
      404,
      "保証書データが見つかりません"
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("warranty_certificate_items")
    .select("*")
    .eq("certificate_id", certificateId);

  if (itemsError) {
    throw new WarrantyPdfGenerationError(
      500,
      `保証対象機器の取得に失敗しました: ${itemsError.message}`
    );
  }

  const certificateData = certificate as WarrantyCertificate;
  const itemRows = (items || []) as CertificateItem[];
  const productMap = await getProductMap(supabase, itemRows);

  const repairUrl = certificateData.repair_form_token
    ? `${appBaseUrl}/repair-request-form?token=${certificateData.repair_form_token}`
    : `${appBaseUrl}/repair-request-form`;

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
      qrDataUrl,
    }
  ) as React.ReactElement<DocumentProps>;

  const instance = pdf(documentElement);
  const pdfBytes = (await instance.toBuffer()) as unknown as Buffer;

  const filename = `warranty-${
    certificateData.certificate_no || certificateData.id
  }.pdf`;

  return { buffer: pdfBytes, filename };
}
