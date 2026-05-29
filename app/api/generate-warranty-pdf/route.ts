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
  repair_form_token: string | null;
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
  repairUrl: string;
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
  return value.replaceAll("-", "/");
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

function getWarrantyYears(items: CertificateItem[]) {
  const years = items
    .map((item) => Number(item.warranty_years || 0))
    .filter((year) => year > 0);

  return years.length > 0 ? Math.max(...years) : 10;
}

function getMainProduct(certificate: WarrantyCertificate, items: CertificateItem[]) {
  if (certificate.product_name) return certificate.product_name;

  const names = items
    .map((item) => item.product_name)
    .filter(Boolean) as string[];

  return names.length > 0 ? names.join("、") : "-";
}

const navy = "#1F2A44";
const gold = "#B48A3C";
const lightGray = "#F4F6FA";
const border = "#D4D9E2";

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 9,
    color: "#111827",
    backgroundColor: "#ffffff",
    paddingTop: 34,
    paddingBottom: 34,
    paddingHorizontal: 46,
    position: "relative",
  },
  cornerTop: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 170,
    height: 170,
    backgroundColor: navy,
  },
  cornerBottom: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 170,
    height: 170,
    backgroundColor: navy,
  },
  goldLineTop: {
    position: "absolute",
    top: 18,
    left: 42,
    width: 500,
    height: 1,
    backgroundColor: gold,
  },
  goldLineBottom: {
    position: "absolute",
    bottom: 18,
    right: 42,
    width: 500,
    height: 1,
    backgroundColor: gold,
  },
  logoBox: {
    alignItems: "center",
    marginBottom: 8,
  },
  logoMark: {
    width: 86,
    height: 40,
    borderWidth: 1,
    borderColor: navy,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 7,
    color: navy,
    marginTop: 3,
  },
  title: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: 700,
    color: navy,
    marginBottom: 18,
    letterSpacing: 2,
  },
  topArea: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  customerCard: {
    width: "42%",
    borderWidth: 1,
    borderColor: border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  metaCard: {
    width: "38%",
    paddingTop: 8,
  },
  customerName: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  label: {
    fontSize: 7,
    color: "#6B7280",
    marginBottom: 3,
  },
  value: {
    fontSize: 9.5,
    fontWeight: 700,
    lineHeight: 1.45,
  },
  metaLine: {
    fontSize: 9,
    marginBottom: 8,
    fontWeight: 700,
  },
  summaryCards: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 16,
  },
  summaryCard: {
    width: "31%",
    borderWidth: 1,
    borderColor: navy,
    borderRadius: 4,
  },
  summaryHeader: {
    backgroundColor: navy,
    color: "#ffffff",
    textAlign: "center",
    fontSize: 10,
    paddingVertical: 7,
    fontWeight: 700,
  },
  summaryBody: {
    minHeight: 74,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  summaryBig: {
    fontSize: 25,
    fontWeight: 700,
    color: navy,
  },
  summarySmall: {
    fontSize: 8,
    textAlign: "center",
    lineHeight: 1.5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: navy,
    borderLeftWidth: 3,
    borderLeftColor: navy,
    paddingLeft: 8,
    marginBottom: 8,
  },
  bullet: {
    fontSize: 8.5,
    lineHeight: 1.55,
    marginBottom: 2,
  },
  alertBox: {
    borderWidth: 1,
    borderColor: "#6B7280",
    borderRadius: 8,
    padding: 11,
    backgroundColor: lightGray,
    marginTop: 8,
    marginBottom: 10,
  },
  alertText: {
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
  },
  qrRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  qrBox: {
    width: 88,
    height: 88,
    borderWidth: 1,
    borderColor: navy,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  qrText: {
    fontSize: 8,
    textAlign: "center",
    color: navy,
  },
  qrInfo: {
    flex: 1,
    justifyContent: "center",
  },
  phone: {
    fontSize: 24,
    fontWeight: 700,
    color: navy,
    marginTop: 6,
  },
  officeBox: {
    borderTopWidth: 1,
    borderTopColor: navy,
    paddingTop: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  officeTitle: {
    width: "24%",
    fontSize: 10,
    fontWeight: 700,
    color: navy,
  },
  officeName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 3,
  },
  officeText: {
    fontSize: 7.5,
    lineHeight: 1.4,
  },
  ruleTitle: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: 700,
    color: navy,
    marginBottom: 18,
    letterSpacing: 1,
  },
  ruleText: {
    fontSize: 6.8,
    lineHeight: 1.55,
    marginBottom: 4,
  },
  listTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: navy,
    marginTop: 20,
    marginBottom: 20,
  },
  listSubTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: navy,
    marginBottom: 18,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#9CA3AF",
    paddingVertical: 10,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  iconText: {
    fontSize: 10,
    color: navy,
    fontWeight: 700,
  },
  listItemName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#374151",
  },
});

const defaultEquipmentList = [
  "給湯器",
  "システムキッチン",
  "システムバス",
  "換気扇",
  "洗面化粧台",
  "温水洗浄便座（2台分）",
  "壁掛けエアコン（2台分）",
  "24時間換気システム",
];

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

  const years = getWarrantyYears(items);
  const mainProduct = getMainProduct(certificate, items);

  const activeItems = items.filter((item) => item.is_active !== false);
  const listItems =
    activeItems.length > 0
      ? activeItems.map((item) => item.product_name || item.category || "対象機器")
      : defaultEquipmentList;

  return React.createElement(
    Document,
    null,

    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(View, { style: styles.cornerTop }),
      React.createElement(View, { style: styles.cornerBottom }),
      React.createElement(View, { style: styles.goldLineTop }),
      React.createElement(View, { style: styles.goldLineBottom }),

      React.createElement(
        View,
        { style: styles.topArea },
        React.createElement(
          View,
          { style: styles.customerCard },
          React.createElement(Text, { style: styles.customerName }, `${safeText(certificate.customer_name)} 様`),
          React.createElement(Text, { style: styles.label }, "対象物件ご住所"),
          React.createElement(
            Text,
            { style: styles.value },
            `${formatPostalCode(certificate.postal_code)} ${address || "-"}`
          )
        ),
        React.createElement(
          View,
          { style: styles.metaCard },
          React.createElement(
            Text,
            { style: styles.metaLine },
            `保証書番号：${safeText(certificate.certificate_no)}`
          ),
          React.createElement(
            Text,
            { style: styles.metaLine },
            `保証開始日：${formatDate(certificate.start_date)}`
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.logoBox },
        React.createElement(
          View,
          { style: styles.logoMark },
          React.createElement(Text, { style: { fontSize: 16, color: navy } }, "★★★")
        ),
        React.createElement(Text, { style: styles.logoText }, "STAR WARRANTY")
      ),

      React.createElement(Text, { style: styles.title }, "スター・ワランティ保証書"),

      React.createElement(
        View,
        { style: styles.summaryCards },
        React.createElement(
          View,
          { style: styles.summaryCard },
          React.createElement(Text, { style: styles.summaryHeader }, "対象製品"),
          React.createElement(
            View,
            { style: styles.summaryBody },
            React.createElement(Text, { style: styles.summarySmall }, mainProduct)
          )
        ),
        React.createElement(
          View,
          { style: styles.summaryCard },
          React.createElement(Text, { style: styles.summaryHeader }, "保証限度額"),
          React.createElement(
            View,
            { style: styles.summaryBody },
            React.createElement(Text, { style: styles.summarySmall }, "再調達価格まで")
          )
        ),
        React.createElement(
          View,
          { style: styles.summaryCard },
          React.createElement(Text, { style: styles.summaryHeader }, "保証期間"),
          React.createElement(
            View,
            { style: styles.summaryBody },
            React.createElement(Text, { style: styles.summarySmall }, "保証開始日から起算して"),
            React.createElement(Text, { style: styles.summaryBig }, `${years}年`)
          )
        )
      ),

      React.createElement(Text, { style: styles.sectionTitle }, "保証概要"),
      React.createElement(Text, { style: styles.bullet }, "● 対象製品・・・・・上記表中（保証対象機器欄）をご覧ください。"),
      React.createElement(Text, { style: styles.bullet }, `● 保証期間・・・・・保証開始日から起算して${years}年。`),
      React.createElement(Text, { style: styles.bullet }, "　※メーカー保証期間中は、恐れ入りますが各メーカーへ直接お問合せ下さい。"),
      React.createElement(Text, { style: styles.bullet }, "● 保証限度額・・・・詳細は上記表中（支払限度額欄）をご覧ください。"),
      React.createElement(Text, { style: styles.bullet }, "● 修理回数・・・・・無制限"),
      React.createElement(Text, { style: styles.bullet }, "● 保証対象・・・・・通常使用状況下における自然故障（各対象機器メーカーに準ずる）"),

      React.createElement(Text, { style: [styles.sectionTitle, { marginTop: 12 }] }, "故障かな？・・・と思ったら"),
      React.createElement(
        View,
        { style: styles.alertBox },
        React.createElement(Text, { style: styles.alertText }, "まずは当窓口へご連絡ください。")
      ),

      React.createElement(
        View,
        { style: styles.qrRow },
        React.createElement(
          View,
          { style: styles.qrBox },
          React.createElement(Text, { style: styles.qrText }, "修理受付"),
          React.createElement(Text, { style: styles.qrText }, "QR")
        ),
        React.createElement(
          View,
          { style: styles.qrInfo },
          React.createElement(Text, { style: styles.bullet }, "● ご使用方法をご確認ください。対象機器の取扱い説明書をお読みいただき、適切な使用方法かご確認ください。"),
          React.createElement(Text, { style: styles.bullet }, "● 保証期間をご確認ください。一般家庭での通常使用状況下での自然故障が本保証の対象です。"),
          React.createElement(Text, { style: styles.bullet }, "● 詳しくは裏面の保証規定をご確認ください。修理のお申し込みは修理受付フォームよりお問合せ下さい。"),
          React.createElement(Text, { style: { fontSize: 6.5, color: "#6B7280", marginTop: 3 } }, props.repairUrl)
        )
      ),

      React.createElement(Text, { style: styles.phone }, "0120-992-857"),
      React.createElement(Text, { style: { fontSize: 8, marginBottom: 10 } }, "（窓口時間：9:30〜17:00 年末年始除く）"),

      React.createElement(Text, { style: styles.sectionTitle }, "注意事項"),
      React.createElement(Text, { style: styles.bullet }, "● 本書は大切に保管してください。紛失の場合は本保証を受けられない場合がございます。"),
      React.createElement(Text, { style: styles.bullet }, "● 本保証は無料修理をお約束するもので、金銭の提供を行うものではありません。"),
      React.createElement(Text, { style: styles.bullet }, "● 破損、火災、落雷、水害などの外的要因による故障及び破損は対象外となります。"),

      React.createElement(
        View,
        { style: styles.officeBox },
        React.createElement(Text, { style: styles.officeTitle }, "保証運営事務局"),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.officeName }, "株式会社スター・ワランティ"),
          React.createElement(Text, { style: styles.officeText }, "〒101-0048 東京都千代田区神田司町2-14-6 大鷹ビル8F"),
          React.createElement(Text, { style: styles.officeText }, "03-3525-7430　03-3525-7431"),
          React.createElement(Text, { style: styles.officeText }, "info@st-w.jp")
        )
      )
    ),

    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(View, { style: styles.cornerTop }),
      React.createElement(View, { style: styles.cornerBottom }),
      React.createElement(View, { style: styles.goldLineTop }),
      React.createElement(View, { style: styles.goldLineBottom }),

      React.createElement(Text, { style: styles.ruleTitle }, "スター・ワランティ 保証規定"),

      React.createElement(Text, { style: styles.ruleText }, `1．保証内容　住設ワランティにおいては、販売店と株式会社スター・ワランティは共同して、本保証書に記載した保証対象機器に発生した故障、トラブルに対する修理業務に関わる一連の作業を、本保証に加入されたお客様に代わり行います。ただし、販売店の判断により、対象機器の修理を行わず、代替品に交換する場合があります。`),
      React.createElement(Text, { style: styles.ruleText }, `2．有効期間　本保証の有効期間は、本保証書に記載した保証開始日から起算して${years}年間とします。ただし、対象設備機器のメーカー保証期間中は本保証を利用できず、メーカー保証期間終了日の翌日から保証期間満了日までの間は本保証を利用することができます。`),
      React.createElement(Text, { style: styles.ruleText }, "3．保証範囲　本保証は、対象機器の取扱説明書および本体貼付ラベルなどの注意書に従った正常な使用状態で生じた自然故障を対象とします。"),
      React.createElement(Text, { style: styles.ruleText }, "4．保証限度額、修理回数制限、代替品　対象設備機器の再調達価格を保証限度額とし、この範囲内で修理費用が無料となります。また、延長保証期間内において保証対象設備機器に係る修理回数に制限はありません。ただし、修理不能の場合または修理費用が保証限度額を超過する場合は、同一機種又は同等品を代替品として提供する場合があります。"),
      React.createElement(Text, { style: styles.ruleText }, "5．修理依頼方法　対象設備機器に保証対象故障が生じた場合は、表面記載の修理受付フォームよりお問合せください。"),
      React.createElement(Text, { style: styles.ruleText }, "6．保証対象外故障・修理　次のような場合には、保証期間内でも本保証の対象とはなりません。"),
      React.createElement(Text, { style: styles.ruleText }, "（1）本保証書に必要事項の記載がない場合、あるいは字句を書き換えられた場合。"),
      React.createElement(Text, { style: styles.ruleText }, "（2）所定の保証料の支払がなされていなかった場合。"),
      React.createElement(Text, { style: styles.ruleText }, "（3）自然消耗、摩耗、さび、かび、腐敗、変質、変色、ねずみ食い、虫食い、対象機器以外の商品故障、移動、輸送、移設、落下、使用上の誤り、不当な修理や改造による故障および損傷。"),
      React.createElement(Text, { style: styles.ruleText }, "（4）火災、地震、水害、落雷、塩害、ガス害、その他の天災地変、公害、異常電圧など外的要因による故障または損傷。"),
      React.createElement(Text, { style: styles.ruleText }, "（5）業務用に使用された場合の故障および損傷。"),
      React.createElement(Text, { style: styles.ruleText }, "（6）対象機器取扱説明書記載の本来お客様に処置していただくべきお手入れ、点検、電池交換、消耗品の交換。"),
      React.createElement(Text, { style: styles.ruleText }, "（7）施工時の不具合に起因する場合。"),
      React.createElement(Text, { style: styles.ruleText }, "（8）調査の結果、対象機器に異常のなかったもの。"),
      React.createElement(Text, { style: styles.ruleText }, "（9）本保証の有効期間外に対象機器の修理依頼がなされた故障。"),
      React.createElement(Text, { style: styles.ruleText }, "7．保証書記載事項に関する変更　本保証の加入者様の氏名、住所、電話番号、部屋番号等に変更が生じる場合は、事前に販売店または当社までご連絡ください。"),
      React.createElement(Text, { style: styles.ruleText }, "8．第三者の意見　故障および損傷の特定などについて見解の相違が発生した場合には、中立的な第三者の意見を求めることがあります。"),
      React.createElement(Text, { style: styles.ruleText }, "9．保証書の保管　本保証書は再発行致しませんので、保証書の保管・管理に十分ご注意ください。"),
      React.createElement(Text, { style: styles.ruleText }, "10．解約　本保証は原則として解約できません。"),
      React.createElement(Text, { style: styles.ruleText }, "11．個人情報　本保証をご利用頂くにあたり、当社の個人情報保護方針をご確認ください。")
    ),

    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(View, { style: styles.cornerTop }),
      React.createElement(View, { style: styles.cornerBottom }),
      React.createElement(View, { style: styles.goldLineTop }),
      React.createElement(View, { style: styles.goldLineBottom }),

      React.createElement(
        View,
        { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
        React.createElement(Text, { style: { backgroundColor: navy, color: "#fff", padding: 8, fontSize: 15, fontWeight: 700 } }, "別紙"),
        React.createElement(
          View,
          { style: styles.logoMark },
          React.createElement(Text, { style: { fontSize: 15, color: navy } }, "★★★")
        )
      ),

      React.createElement(Text, { style: styles.listTitle }, "保証対象設備機器リスト"),
      React.createElement(
        Text,
        { style: { fontSize: 13, fontWeight: 700, color: navy, marginBottom: 22 } },
        `保証書番号： ${safeText(certificate.certificate_no)}`
      ),
      React.createElement(View, { style: { height: 1, backgroundColor: "#6B7280", marginBottom: 24 } }),
      React.createElement(Text, { style: styles.listSubTitle }, "延長保証の対象となる対象設備機器（新品に限る）"),

      ...listItems.map((name, index) =>
        React.createElement(
          View,
          { key: `${name}-${index}`, style: styles.listRow },
          React.createElement(
            View,
            { style: styles.iconCircle },
            React.createElement(Text, { style: styles.iconText }, String(index + 1))
          ),
          React.createElement(Text, { style: styles.listItemName }, name)
        )
      )
    )
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

  const origin = new URL(requestUrl).origin;
  const repairUrl = certificateData.repair_form_token
    ? `${origin}/repair-request-form?token=${certificateData.repair_form_token}`
    : `${origin}/repair-request-form`;

  const documentElement = React.createElement(
    WarrantyCertificatePdf as React.ComponentType<PdfProps>,
    {
      certificate: certificateData,
      items: itemRows,
      repairUrl,
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