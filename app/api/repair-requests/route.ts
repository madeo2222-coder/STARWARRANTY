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

type WarrantyCertificateRow = {
  id: string;
  certificate_no: string | null;
  customer_name: string | null;
  customer_name_kana: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  postal_code: string | null;
  address: string | null;
  address2: string | null;
  address3: string | null;
  product_name: string | null;
  manufacturer: string | null;
  model_no: string | null;
  start_date: string | null;
  seller_name: string | null;
};

type WarrantyCertificateItemRow = {
  id: string;
  product_name: string | null;
  category: string | null;
  is_active: boolean | null;
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

function joinAddress(certificate: WarrantyCertificateRow) {
  return [certificate.address, certificate.address2, certificate.address3]
    .filter(Boolean)
    .join(" ");
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
      .select(
        `
        id,
        certificate_no,
        customer_name,
        customer_name_kana,
        customer_phone,
        customer_email,
        postal_code,
        address,
        address2,
        address3,
        product_name,
        manufacturer,
        model_no,
        start_date,
        seller_name
      `
      )
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

    const certificateRow = certificate as WarrantyCertificateRow;

    const { data: itemRows, error: itemError } = await supabase
      .from("warranty_certificate_items")
      .select("id, product_name, category, is_active")
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

    const activeItems = ((itemRows || []) as WarrantyCertificateItemRow[]).filter(
      (item) => item.is_active !== false
    );

    const products = activeItems
      .map((item) => item.product_name || item.category || "")
      .filter((name) => name.trim().length > 0);

    const firstActiveItem = activeItems.find(
      (item) => item.product_name || item.category
    );

    return NextResponse.json({
      success: true,
      certificate: {
        id: certificateRow.id,
        certificate_no: certificateRow.certificate_no || "",
        customer_name: certificateRow.customer_name || "",
        customer_name_kana: certificateRow.customer_name_kana || "",
        customer_phone: certificateRow.customer_phone || "",
        customer_email: certificateRow.customer_email || "",
        postal_code: certificateRow.postal_code || "",
        address: joinAddress(certificateRow),
        product_name:
          certificateRow.product_name ||
          firstActiveItem?.product_name ||
          firstActiveItem?.category ||
          "",
        manufacturer: certificateRow.manufacturer || "",
        model_no: certificateRow.model_no || "",
        start_date: certificateRow.start_date || "",
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
      .select("id, certificate_no, seller_name")
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

    const certificateRow = certificate as {
      id: string;
      certificate_no: string | null;
      seller_name: string | null;
    };

    const requestNo = buildRequestNo();

    const { data: inserted, error: insertError } = await supabase
      .from("repair_requests")
      .insert({
        request_no: requestNo,
        certificate_no: certificateRow.certificate_no,
        certificate_id: certificateRow.id,
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
        agency_name: certificateRow.seller_name || null,
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

    try {
      const resendKey = process.env.RESEND_API_KEY;
      const notifyEmail = process.env.WARRANTY_NOTIFY_EMAIL;

      if (resendKey && resendKey !== "dummy" && notifyEmail) {
        const resend = new (await import("resend")).Resend(resendKey);

        await resend.emails.send({
          from: "STAR WARRANTY <onboarding@resend.dev>",
          to: notifyEmail,
          subject: `【新規修理受付】${requestNo}`,
          text: `
新しい修理受付が登録されました。

受付番号：${requestNo}
お客様名：${body.customer_name}
電話番号：${body.phone}
対象機器：${body.product_name}

管理画面で確認してください。
`,
        });
      }
    } catch (e) {
      console.error("admin notify mail error", e);
    }

    try {
      const resendKey = process.env.RESEND_API_KEY;

      if (resendKey && resendKey !== "dummy" && body.email) {
        const resend = new (await import("resend")).Resend(resendKey);

        const repairStatusUrl = `https://starwarranty.vercel.app/repair-status?request_no=${encodeURIComponent(
          requestNo
        )}`;

        await resend.emails.send({
          from: "STAR WARRANTY <onboarding@resend.dev>",
          to: body.email,
          subject: `【修理受付完了】${requestNo}`,
          text: `
この度は修理受付ありがとうございます。

以下内容にて受付完了いたしました。

受付番号：
${requestNo}

お客様名：
${body.customer_name}

対象機器：
${body.product_name}

修理状況確認ページ：
${repairStatusUrl}

今後、確認・手配が進み次第、
ステータス更新を行います。

STAR WARRANTY
`,
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