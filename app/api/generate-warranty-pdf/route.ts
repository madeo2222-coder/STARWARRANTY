import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type WarrantyCertificatePdfRow = {
  id: string;
  certificate_no: string;
  customer_name: string;
  customer_name_kana: string | null;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  property_name: string | null;
  property_room: string | null;
  start_date: string;
  end_date: string | null;
  introducer_name: string | null;
  seller_name: string | null;
  status: string;
  note: string | null;
  repair_form_token: string;
  warranty_certificate_items: {
    is_enabled: boolean;
    coverage_limit_amount: number | null;
    note: string | null;
    warranty_products: {
      product_name: string;
      category: string | null;
      warranty_years: number | null;
    } | null;
  }[];
};

type HeadquartersSettings = {
  company_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
};

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

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function buildAddress(data: WarrantyCertificatePdfRow) {
  return [data.address1, data.address2, data.address3].filter(Boolean).join(" ");
}

function escapeHtml(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id がありません" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const [
      { data: certificate, error: certificateError },
      { data: hqRows, error: hqError },
    ] = await Promise.all([
      supabase
        .from("warranty_certificates")
        .select(`
          id,
          certificate_no,
          customer_name,
          customer_name_kana,
          postal_code,
          address1,
          address2,
          address3,
          property_name,
          property_room,
          start_date,
          end_date,
          introducer_name,
          seller_name,
          status,
          note,
          repair_form_token,
          warranty_certificate_items (
            is_enabled,
            coverage_limit_amount,
            note,
            warranty_products (
              product_name,
              category,
              warranty_years
            )
          )
        `)
        .eq("id", id)
        .single(),
      supabase
        .from("headquarters_settings")
        .select("company_name, phone, postal_code, address")
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    if (certificateError || !certificate) {
      return NextResponse.json(
        {
          success: false,
          error: certificateError?.message || "保証書が見つかりません",
        },
        { status: 404 }
      );
    }

    if (hqError) {
      return NextResponse.json(
        { success: false, error: hqError.message },
        { status: 500 }
      );
    }

    const cert = certificate as unknown as WarrantyCertificatePdfRow;
    const hq = ((hqRows || [])[0] || null) as HeadquartersSettings | null;

    const operatorName = hq?.company_name || "株式会社スター・ワランティ";
    const operatorPhone = hq?.phone || "0120-992-857";
    const operatorPostalCode = hq?.postal_code || "";
    const operatorAddress = hq?.address || "";

    const enabledItems = (cert.warranty_certificate_items || []).filter(
      (item) => item.is_enabled
    );

    const appBaseUrl = getAppBaseUrl();
    const repairFormUrl = `${appBaseUrl}/repair-request-form?token=${cert.repair_form_token}`;
  const qrDataUrl = await QRCode.toDataURL(repairFormUrl, {
  width: 180,
  margin: 1,
});
    const enabledItemsHtml =
      enabledItems.length === 0
        ? `<div class="muted">対象機器はありません。</div>`
        : enabledItems
            .map((item) => {
              const productName = escapeHtml(
                item.warranty_products?.product_name || "-"
              );
              const category = escapeHtml(
                item.warranty_products?.category || "-"
              );
              const years = escapeHtml(
                String(item.warranty_products?.warranty_years || "-")
              );
              const limit = item.coverage_limit_amount
                ? `${Number(item.coverage_limit_amount).toLocaleString("ja-JP")}円`
                : "再調達価格まで";

              return `
                <div class="item-box">
                  <div class="item-title">${productName}</div>
                  <div class="item-sub">${category} / ${years}年保証</div>
                  <div class="item-sub">保証限度額：${escapeHtml(limit)}</div>
                </div>
              `;
            })
            .join("");

    const appendixItemsHtml =
      enabledItems.length === 0
        ? `<div class="muted">対象機器はありません。</div>`
        : enabledItems
            .map(
              (item) =>
                `<div class="bullet">・${escapeHtml(
                  item.warranty_products?.product_name || "-"
                )}</div>`
            )
            .join("");

    const html = `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(cert.certificate_no)} 保証書</title>
  <style>
    @page {
      size: A4;
      margin: 14mm;
    }

    body {
      margin: 0;
      color: #111827;
      font-family: "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }

    .page {
      page-break-after: always;
      min-height: 257mm;
      box-sizing: border-box;
    }

    .page:last-child {
      page-break-after: auto;
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    .header-left {
      width: 58%;
    }

    .header-right {
      width: 38%;
      border: 1px solid #d1d5db;
      padding: 10px;
      box-sizing: border-box;
    }

    .small-label {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 2px;
    }

    .title {
      font-size: 28px;
      font-weight: 700;
      margin: 8px 0 12px;
    }

    .customer-name {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 14px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .sub-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .card {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 14px;
      box-sizing: border-box;
    }

    .item-box {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px;
      margin-top: 8px;
    }

    .item-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .item-sub,
    .bullet,
    .text {
      font-size: 14px;
      line-height: 1.8;
    }

    .muted {
      color: #6b7280;
      font-size: 14px;
    }

    .footer-note {
      margin-top: 10px;
      font-size: 12px;
      color: #4b5563;
      line-height: 1.7;
    }

    .repair-card {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }

    .repair-text {
      flex: 1;
    }

    .qr-box {
      width: 160px;
      text-align: center;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 8px;
      box-sizing: border-box;
    }

    .qr-image {
      width: 140px;
      height: 140px;
      display: block;
      margin: 0 auto;
    }

    .qr-label {
      margin-top: 6px;
      font-size: 12px;
      font-weight: 700;
    }

    .print-bar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      padding: 10px 14px;
      display: flex;
      gap: 10px;
    }

    .print-btn {
      border: none;
      background: #111827;
      color: #fff;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 14px;
      cursor: pointer;
    }

    .back-btn {
      border: 1px solid #d1d5db;
      background: #fff;
      color: #111827;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 14px;
      text-decoration: none;
      display: inline-block;
    }

    @media print {
      .print-bar {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
    <a class="back-btn" href="/warranty-certificates/detail?id=${escapeHtml(cert.id)}">戻る</a>
  </div>

  <div class="page">
    <div class="header-row">
      <div class="header-left">
        <div class="small-label">保証書番号</div>
        <div class="text">${escapeHtml(cert.certificate_no)}</div>
        <div class="small-label" style="margin-top:8px;">保証開始日</div>
        <div class="text">${escapeHtml(formatDate(cert.start_date))}</div>
      </div>
      <div class="header-right">
        <div class="small-label">保証運営事務局</div>
        <div class="sub-title">${escapeHtml(operatorName)}</div>
        <div class="text">${escapeHtml(operatorPostalCode || "-")}</div>
        <div class="text">${escapeHtml(operatorAddress || "-")}</div>
        <div class="text">${escapeHtml(operatorPhone || "-")}</div>
      </div>
    </div>

    <div class="customer-name">${escapeHtml(cert.customer_name)} 様</div>
    <div class="title">住設ワランティ保証書</div>

    <div class="card">
      <div class="small-label">対象物件ご住所</div>
      <div class="text">
        ${escapeHtml(cert.postal_code ? `〒${cert.postal_code} ` : "")}${escapeHtml(buildAddress(cert) || "-")}
      </div>
      ${
        cert.property_name || cert.property_room
          ? `<div class="text">${escapeHtml(
              [cert.property_name, cert.property_room].filter(Boolean).join(" ")
            )}</div>`
          : ""
      }
    </div>

    <div class="card">
      <div class="section-title">保証概要</div>
      <div class="bullet">・保証期間：保証開始日から起算して10年</div>
      <div class="bullet">・修理回数：無制限</div>
      <div class="bullet">・保証対象：通常使用状況下における自然故障</div>
      <div class="bullet">・保証限度額：再調達価格まで</div>
      <div class="footer-note">※メーカー保証期間中は、恐れ入りますが各メーカーへ直接お問合せください。</div>
    </div>

    <div style="margin-top:20px; text-align:center;">
  <div style="font-size:12px; margin-bottom:8px;">
    修理受付はこちら
  </div>
  <img src="${qrDataUrl}" style="width:120px; height:120px;" />
  <div style="font-size:10px; margin-top:6px;">
   ${repairFormUrl}
  </div>
</div>

    <div class="card">
      <div class="section-title">対象機器</div>
      ${enabledItemsHtml}
    </div>

    <div class="card">
      <div class="section-title">故障かな？と思ったら</div>
      <div class="repair-card">
        <div class="repair-text">
          <div class="bullet">・対象機器の取扱説明書を確認し、適切な使用方法かご確認ください。</div>
          <div class="bullet">・保証期間内かどうか、自然故障に該当するかをご確認ください。</div>
          <div class="bullet">・修理のお申し込みは右記QRコードから受付します。</div>
          <div class="footer-note">修理受付URL: ${escapeHtml(repairFormUrl)}</div>
        </div>
        <div class="qr-box">
          <img class="qr-image" src="${qrDataUrl}" alt="修理受付QRコード" />
          <div class="qr-label">修理受付はこちら</div>
        </div>
      </div>
    </div>

    <div class="footer-note">
      本書は大切に保管してください。紛失の場合は本保証を受けられない場合があります。
    </div>
  </div>

  <div class="page">
    <div class="title">住設ワランティ 保証規定</div>

    <div class="card">
      <div class="sub-title">1. 保証内容</div>
      <div class="text">
        本保証書に記載した対象機器に発生した自然故障に対して、保証期間内に修理対応を行います。
        修理不能または修理費用が保証限度額を超える場合は、同等品提供等で対応する場合があります。
      </div>
    </div>

    <div class="card">
      <div class="sub-title">2. 有効期間</div>
      <div class="text">
        保証開始日から起算して10年間を保証期間とします。メーカー保証期間中はメーカー保証が優先されます。
      </div>
    </div>

    <div class="card">
      <div class="sub-title">3. 保証範囲</div>
      <div class="text">
        対象機器の取扱説明書および注意書きに従った正常な使用状態で生じた故障を対象とします。
      </div>
    </div>

    <div class="card">
      <div class="sub-title">4. 保証限度額・修理回数</div>
      <div class="text">
        保証限度額は再調達価格まで、修理回数は無制限です。技術料、部品代、出張費用を含めて保証範囲内で対応します。
      </div>
    </div>

    <div class="card">
      <div class="sub-title">5. 修理依頼方法</div>
      <div class="text">
        修理依頼は保証書記載の修理受付フォームから行ってください。事前連絡なく他窓口へ依頼された場合、本保証を利用できない場合があります。
      </div>
    </div>

    <div class="card">
      <div class="sub-title">6. </div>
      <div class="text">
        火災・地震・落雷・水害等の外的要因、誤使用、改造、消耗品交換、施工不良起因、業務用利用、故障ではないナンセンスコール等は対象外です。
      </div>
    </div>

    <div class="card">
      <div class="sub-title">7. 変更連絡・保管</div>
      <div class="text">
        氏名、住所、電話番号、部屋番号等に変更がある場合は速やかにご連絡ください。本保証書は再発行できない場合があるため、大切に保管してください。
      </div>
    </div>

    <div class="card">
      <div class="sub-title">8. 個人情報</div>
      <div class="text">
        本保証の運営に必要な範囲で個人情報を利用します。詳細は運営会社の個人情報保護方針に従います。
      </div>
    </div>

    <div class="footer-note">※詳細な正式文言は、今後テンプレートに合わせて最終調整します。</div>
  </div>

  <div class="page">
    <div class="title">【別紙】保証対象機器一覧</div>
    <div class="small-label">保証書番号：${escapeHtml(cert.certificate_no)}</div>

    <div class="card" style="margin-top:12px;">
      <div class="sub-title">延長保証の対象となる設備機器</div>
      ${appendixItemsHtml}
    </div>

    <div class="card">
      <div class="sub-title">加入情報</div>
      <div class="text">施主名：${escapeHtml(cert.customer_name)}</div>
      <div class="text">保証開始日：${escapeHtml(formatDate(cert.start_date))}</div>
      <div class="text">紹介者名：${escapeHtml(cert.introducer_name || "-")}</div>
      <div class="text">販売店名：${escapeHtml(cert.seller_name || "-")}</div>
    </div>

    ${
      cert.note
        ? `
          <div class="card">
            <div class="sub-title">備考</div>
            <div class="text">${escapeHtml(cert.note)}</div>
          </div>
        `
        : ""
    }
  </div>
</body>
</html>
    `;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "保証書HTML生成に失敗しました",
      },
      { status: 500 }
    );
  }
}