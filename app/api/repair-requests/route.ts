import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RepairRequestBody = {
  token?: string;
  customer_name?: string;
  customer_name_kana?: string | null;
  phone?: string;
  email?: string | null;
  postal_code?: string | null;
  address?: string | null;
  product_name?: string;
  manufacturer?: string | null;
  model_no?: string | null;
  installation_place?: string | null;
  failure_date?: string | null;
  symptom_category?: string | null;
  symptom_detail?: string;
  error_code?: string | null;
  is_usable?: boolean | null;
};

type AnyRow = Record<string, any>;

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

function getMailFrom() {
  return (
    process.env.WARRANTY_MAIL_FROM ||
    "STAR WARRANTY <onboarding@resend.dev>"
  );
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://starwarranty.vercel.app";
}

function buildRequestNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return `RR-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function normalizeDateForDb(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim().replace(/\//g, "-");

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeToken(value: string | null | undefined) {
  return String(value || "").trim();
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

function joinAddress(row: AnyRow) {
  return [
    pickText(row, ["address", "address1"]),
    pickText(row, ["address2"]),
    pickText(row, ["address3"]),
  ]
    .filter(Boolean)
    .join(" ");
}

function uniqueTexts(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function getProductIdFromItem(item: AnyRow) {
  return pickText(item, [
    "product_id",
    "warranty_product_id",
    "warranty_products_id",
    "equipment_id",
  ]);
}

function getProductNameFromProduct(product: AnyRow | null | undefined) {
  return pickText(product, ["product_name", "name", "category", "product_code"]);
}

function getProductNameFromItem(item: AnyRow, productMap: Map<string, AnyRow>) {
  const directName = pickText(item, ["product_name", "name", "category"]);

  if (directName) {
    return directName;
  }

  const productId = getProductIdFromItem(item);

  if (!productId) {
    return "";
  }

  return getProductNameFromProduct(productMap.get(productId));
}

function buildCustomerReceivedText({
  requestNo,
  customerName,
  phone,
  productName,
  repairStatusUrl,
}: {
  requestNo: string;
  customerName: string;
  phone: string;
  productName: string;
  repairStatusUrl: string;
}) {
  return `
${customerName} 様

このたびは、STAR WARRANTY 修理受付フォームよりご連絡いただきありがとうございます。
以下の内容で修理受付が完了いたしました。

━━━━━━━━━━━━━━━━━━━━
受付番号：${requestNo}
お客様名：${customerName}
電話番号：${phone}
対象機器：${productName}
━━━━━━━━━━━━━━━━━━━━

今後、担当者が受付内容・保証情報・添付写真を確認し、
必要に応じてお電話またはメールにてご連絡いたします。

修理状況は以下のページからご確認いただけます。

${repairStatusUrl}

確認ページでは、以下の情報を入力してください。
・受付番号：${requestNo}
・電話番号：${phone}

※本メールは自動送信です。
※内容にお心当たりがない場合は、恐れ入りますが本メールを破棄してください。

STAR WARRANTY
`;
}

function buildCustomerReceivedHtml({
  requestNo,
  customerName,
  phone,
  productName,
  repairStatusUrl,
}: {
  requestNo: string;
  customerName: string;
  phone: string;
  productName: string;
  repairStatusUrl: string;
}) {
  return `
<!doctype html>
<html lang="ja">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 12px;">
                <div style="font-size:12px;letter-spacing:0.16em;color:#6b7280;font-weight:700;">STAR WARRANTY</div>
                <h1 style="margin:10px 0 0;font-size:22px;line-height:1.4;">修理受付が完了しました</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px;font-size:14px;line-height:1.8;color:#374151;">
                ${customerName} 様<br />
                このたびは、修理受付フォームよりご連絡いただきありがとうございます。<br />
                以下の内容で修理受付が完了いたしました。
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                  <tr>
                    <td style="font-size:12px;color:#6b7280;padding:6px 0;">受付番号</td>
                    <td style="font-size:18px;font-weight:700;text-align:right;padding:6px 0;">${requestNo}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#6b7280;padding:6px 0;">お客様名</td>
                    <td style="font-size:14px;text-align:right;padding:6px 0;">${customerName}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#6b7280;padding:6px 0;">電話番号</td>
                    <td style="font-size:14px;text-align:right;padding:6px 0;">${phone}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#6b7280;padding:6px 0;">対象機器</td>
                    <td style="font-size:14px;text-align:right;padding:6px 0;">${productName}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px;font-size:14px;line-height:1.8;color:#374151;">
                担当者が受付内容・保証情報・添付写真を確認し、必要に応じてお電話またはメールにてご連絡いたします。
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:0 24px 24px;">
                <a href="${repairStatusUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 20px;font-size:14px;font-weight:700;">
                  修理状況を確認する
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px;background:#f9fafb;font-size:12px;line-height:1.7;color:#6b7280;">
                確認ページでは、受付番号「${requestNo}」と電話番号「${phone}」を入力してください。<br />
                ※本メールは自動送信です。
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

function buildAdminNotifyText({
  requestNo,
  customerName,
  phone,
  email,
  productName,
  symptomCategory,
  symptomDetail,
  detailUrl,
}: {
  requestNo: string;
  customerName: string;
  phone: string;
  email: string;
  productName: string;
  symptomCategory: string;
  symptomDetail: string;
  detailUrl: string;
}) {
  return `
新しい修理受付が登録されました。

━━━━━━━━━━━━━━━━━━━━
受付番号：${requestNo}
お客様名：${customerName}
電話番号：${phone}
メール：${email || "-"}
対象機器：${productName}
症状区分：${symptomCategory || "-"}
━━━━━━━━━━━━━━━━━━━━

故障内容：
${symptomDetail}

管理画面：
${detailUrl}

STAR WARRANTY
`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = normalizeToken(searchParams.get("token"));

    if (!token) {
      return NextResponse.json(
        { success: false, error: "token がありません" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: certificate, error: certificateError } = await supabase
      .from("warranty_certificates")
      .select("*")
      .eq("repair_form_token", token)
      .maybeSingle();

    if (certificateError) {
      console.error("repair request certificate GET error:", certificateError);

      return NextResponse.json(
        {
          success: false,
          error: `保証書情報の取得に失敗しました: ${certificateError.message}`,
        },
        { status: 500 }
      );
    }

    if (!certificate) {
      return NextResponse.json(
        {
          success: false,
          error: "対象の保証書が見つかりません",
        },
        { status: 404 }
      );
    }

    const certificateRow = certificate as AnyRow;

    const { data: itemRows, error: itemError } = await supabase
      .from("warranty_certificate_items")
      .select("*")
      .eq("certificate_id", certificateRow.id);

    if (itemError) {
      console.error("repair request certificate items GET error:", itemError);

      return NextResponse.json(
        {
          success: false,
          error: `保証対象機器の取得に失敗しました: ${itemError.message}`,
        },
        { status: 500 }
      );
    }

    const allItems = (itemRows || []) as AnyRow[];

    const activeItems = allItems.filter((item) => {
      if ("is_active" in item) return item.is_active !== false;
      if ("is_enabled" in item) return item.is_enabled !== false;
      return true;
    });

    const productIds = uniqueTexts(activeItems.map((item) => getProductIdFromItem(item)));

    let productMap = new Map<string, AnyRow>();

    if (productIds.length > 0) {
      const { data: productRows, error: productError } = await supabase
        .from("warranty_products")
        .select("*")
        .in("id", productIds);

      if (productError) {
        console.error("repair request warranty products GET error:", productError);

        return NextResponse.json(
          {
            success: false,
            error: `保証対象機器マスタの取得に失敗しました: ${productError.message}`,
          },
          { status: 500 }
        );
      }

      productMap = new Map(
        ((productRows || []) as AnyRow[]).map((product) => [
          pickText(product, ["id"]),
          product,
        ])
      );
    }

    const products = uniqueTexts(
      activeItems.map((item) => getProductNameFromItem(item, productMap))
    );

    const firstActiveItem = activeItems.find((item) =>
      getProductNameFromItem(item, productMap)
    );

    const firstProductName = firstActiveItem
      ? getProductNameFromItem(firstActiveItem, productMap)
      : "";

    return NextResponse.json({
      success: true,
      certificate: {
        id: pickText(certificateRow, ["id"]),
        certificate_no: pickText(certificateRow, ["certificate_no"]),
        customer_name: pickText(certificateRow, ["customer_name"]),
        customer_name_kana: pickText(certificateRow, ["customer_name_kana"]),
        customer_phone: pickText(certificateRow, [
          "customer_phone",
          "phone",
          "customer_tel",
          "tel",
        ]),
        customer_email: pickText(certificateRow, [
          "customer_email",
          "email",
          "mail",
        ]),
        postal_code: pickText(certificateRow, ["postal_code", "zip_code"]),
        address: joinAddress(certificateRow),
        product_name:
          pickText(certificateRow, ["product_name"]) || firstProductName,
        manufacturer:
          pickText(certificateRow, ["manufacturer"]) ||
          pickText(firstActiveItem, ["manufacturer"]),
        model_no:
          pickText(certificateRow, ["model_no", "model_number"]) ||
          pickText(firstActiveItem, ["model_no", "model_number"]),
        start_date: pickText(certificateRow, ["start_date"]),
        products,
      },
    });
  } catch (error) {
    console.error("repair request GET route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "保証書情報の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RepairRequestBody;
    const supabase = getAdminClient();

    const token = normalizeToken(body.token);

    if (!token) {
      return NextResponse.json(
        { success: false, error: "token がありません" },
        { status: 400 }
      );
    }

    if (!body.customer_name?.trim()) {
      return NextResponse.json(
        { success: false, error: "お名前がありません" },
        { status: 400 }
      );
    }

    if (!body.phone?.trim()) {
      return NextResponse.json(
        { success: false, error: "電話番号がありません" },
        { status: 400 }
      );
    }

    if (!body.product_name?.trim()) {
      return NextResponse.json(
        { success: false, error: "対象機器がありません" },
        { status: 400 }
      );
    }

    if (!body.symptom_detail?.trim()) {
      return NextResponse.json(
        { success: false, error: "故障内容がありません" },
        { status: 400 }
      );
    }

    const { data: certificate, error: certificateError } = await supabase
      .from("warranty_certificates")
      .select("*")
      .eq("repair_form_token", token)
      .maybeSingle();

    if (certificateError) {
      console.error("repair request certificate POST error:", certificateError);

      return NextResponse.json(
        {
          success: false,
          error: `保証書情報の取得に失敗しました: ${certificateError.message}`,
        },
        { status: 500 }
      );
    }

    if (!certificate) {
      return NextResponse.json(
        {
          success: false,
          error: "対象の保証書が見つかりません",
        },
        { status: 404 }
      );
    }

    const certificateRow = certificate as AnyRow;
    const requestNo = buildRequestNo();

    const { data: inserted, error: insertError } = await supabase
      .from("repair_requests")
      .insert({
        request_no: requestNo,
        certificate_no: pickText(certificateRow, ["certificate_no"]),
        certificate_id: pickText(certificateRow, ["id"]),
        customer_name: body.customer_name.trim(),
        customer_name_kana: body.customer_name_kana?.trim() || null,
        phone: body.phone.trim(),
        email: body.email?.trim() || null,
        postal_code: body.postal_code?.trim() || null,
        address: body.address?.trim() || null,
        product_name: body.product_name.trim(),
        manufacturer: body.manufacturer?.trim() || null,
        model_no: body.model_no?.trim() || null,
        installation_place: body.installation_place?.trim() || null,
        failure_date: normalizeDateForDb(body.failure_date),
        symptom_category: body.symptom_category?.trim() || null,
        symptom_detail: body.symptom_detail.trim(),
        error_code: body.error_code?.trim() || null,
        is_usable:
          typeof body.is_usable === "boolean" ? body.is_usable : null,
        status: "received",
        agency_name: pickText(certificateRow, ["seller_name", "agency_name"]) || null,
      })
      .select("id, request_no")
      .single();

    if (insertError || !inserted) {
      console.error("repair request insert error:", insertError);

      return NextResponse.json(
        {
          success: false,
          error: insertError?.message || "修理受付の保存に失敗しました",
        },
        { status: 500 }
      );
    }

    const baseUrl = getBaseUrl();
    const repairStatusUrl = `${baseUrl}/repair-status?request_no=${encodeURIComponent(
      requestNo
    )}&phone=${encodeURIComponent(body.phone.trim())}`;

    const detailUrl = `${baseUrl}/repair-requests/detail?request_no=${encodeURIComponent(
      requestNo
    )}`;

    try {
      const resendKey = process.env.RESEND_API_KEY;
      const notifyEmail = process.env.WARRANTY_NOTIFY_EMAIL;

      if (resendKey && resendKey !== "dummy" && notifyEmail) {
        const resend = new (await import("resend")).Resend(resendKey);

        await resend.emails.send({
          from: getMailFrom(),
          to: notifyEmail,
          subject: `【STAR WARRANTY】新規修理受付 ${requestNo}`,
          text: buildAdminNotifyText({
            requestNo,
            customerName: body.customer_name.trim(),
            phone: body.phone.trim(),
            email: body.email?.trim() || "",
            productName: body.product_name.trim(),
            symptomCategory: body.symptom_category?.trim() || "",
            symptomDetail: body.symptom_detail.trim(),
            detailUrl,
          }),
        });
      }
    } catch (e) {
      console.error("admin notify mail error", e);
    }

    try {
      const resendKey = process.env.RESEND_API_KEY;

      if (resendKey && resendKey !== "dummy" && body.email) {
        const resend = new (await import("resend")).Resend(resendKey);

        await resend.emails.send({
          from: getMailFrom(),
          to: body.email,
          subject: `【STAR WARRANTY】修理受付完了のお知らせ（${requestNo}）`,
          text: buildCustomerReceivedText({
            requestNo,
            customerName: body.customer_name.trim(),
            phone: body.phone.trim(),
            productName: body.product_name.trim(),
            repairStatusUrl,
          }),
          html: buildCustomerReceivedHtml({
            requestNo,
            customerName: body.customer_name.trim(),
            phone: body.phone.trim(),
            productName: body.product_name.trim(),
            repairStatusUrl,
          }),
        });
      }
    } catch (e) {
      console.error("customer notify mail error", e);
    }

    return NextResponse.json({
      success: true,
      request: inserted,
    });
  } catch (error) {
    console.error("repair request POST route error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "修理受付の保存に失敗しました",
      },
      { status: 500 }
    );
  }
}