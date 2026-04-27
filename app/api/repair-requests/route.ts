import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "token がありません" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_certificates")
      .select(
        `
        id,
        certificate_no,
        customer_name,
        start_date,
        warranty_certificate_items (
          is_enabled,
          warranty_products (
            product_name
          )
        )
      `
      )
      .eq("repair_form_token", token)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          success: false,
          error: error?.message || "対象の保証書が見つかりません",
        },
        { status: 404 }
      );
    }

   const products =
  (data.warranty_certificate_items ?? [])
    .filter((item: any) => item.is_enabled)
    .map((item: any) => item.warranty_products?.product_name || "")
    .filter((name: string) => name.length > 0);
    return NextResponse.json({
      success: true,
      certificate: {
        id: data.id,
        certificate_no: data.certificate_no,
        customer_name: data.customer_name,
        start_date: data.start_date,
        products,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RepairRequestBody;
    const supabase = getAdminClient();

    if (!body.token) {
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
      .select("id, certificate_no")
      .eq("repair_form_token", body.token)
      .single();

    if (certificateError || !certificate) {
      return NextResponse.json(
        {
          success: false,
          error: certificateError?.message || "対象の保証書が見つかりません",
        },
        { status: 404 }
      );
    }

    const requestNo = buildRequestNo();

    const { data: inserted, error: insertError } = await supabase
      .from("repair_requests")
      .insert({
        request_no: requestNo,
        certificate_no: certificate.certificate_no,
        certificate_id: certificate.id,
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
        failure_date: body.failure_date || null,
        symptom_category: body.symptom_category?.trim() || null,
        symptom_detail: body.symptom_detail.trim(),
        error_code: body.error_code?.trim() || null,
        is_usable:
          typeof body.is_usable === "boolean" ? body.is_usable : null,
        status: "received",
      })
      .select("id, request_no")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        {
          success: false,
          error: insertError?.message || "修理受付の保存に失敗しました",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request: inserted,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "保存に失敗しました",
      },
      { status: 500 }
    );
  }
}