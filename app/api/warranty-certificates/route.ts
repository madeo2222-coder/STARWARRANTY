import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CertificateItemInput = {
  product_id: string;
  is_enabled: boolean;
};

type CreateWarrantyCertificateBody = {
  certificate_no?: string;
  customer_name?: string;
  customer_name_kana?: string | null;
  postal_code?: string | null;
  address1?: string | null;
  address2?: string | null;
  address3?: string | null;
  property_name?: string | null;
  property_room?: string | null;
  start_date?: string;
  introducer_name?: string | null;
  seller_name?: string | null;
  note?: string | null;
  items?: CertificateItemInput[];
};

export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_products")
      .select("id, product_code, product_name, category, warranty_years, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      products: data || [],
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

export async function POST(req: Request) {
  try {
    const supabase = getAdminClient();
    const body = (await req.json()) as CreateWarrantyCertificateBody;

    if (!body.certificate_no?.trim()) {
      return NextResponse.json(
        { success: false, error: "保証書番号がありません" },
        { status: 400 }
      );
    }

    if (!body.customer_name?.trim()) {
      return NextResponse.json(
        { success: false, error: "施主名がありません" },
        { status: 400 }
      );
    }

    if (!body.start_date) {
      return NextResponse.json(
        { success: false, error: "保証開始日がありません" },
        { status: 400 }
      );
    }

    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: "対象機器データがありません" },
        { status: 400 }
      );
    }

    const enabledCount = body.items.filter((item) => item.is_enabled).length;

    if (enabledCount === 0) {
      return NextResponse.json(
        { success: false, error: "保証対象機器を1つ以上選択してください" },
        { status: 400 }
      );
    }

    const { data: certificate, error: certificateError } = await supabase
      .from("warranty_certificates")
      .insert({
        certificate_no: body.certificate_no.trim(),
        customer_name: body.customer_name.trim(),
        customer_name_kana: body.customer_name_kana?.trim() || null,
        postal_code: body.postal_code?.trim() || null,
        address1: body.address1?.trim() || null,
        address2: body.address2?.trim() || null,
        address3: body.address3?.trim() || null,
        property_name: body.property_name?.trim() || null,
        property_room: body.property_room?.trim() || null,
        start_date: body.start_date,
        introducer_name: body.introducer_name?.trim() || null,
        seller_name: body.seller_name?.trim() || null,
        note: body.note?.trim() || null,
        status: "active",
      })
      .select("id, certificate_no")
      .single();

    if (certificateError || !certificate) {
      return NextResponse.json(
        {
          success: false,
          error: certificateError?.message || "保証書ヘッダ保存に失敗しました",
        },
        { status: 500 }
      );
    }

    const itemRows = body.items.map((item) => ({
      certificate_id: certificate.id,
      product_id: item.product_id,
      is_enabled: item.is_enabled,
    }));

    const { error: itemsError } = await supabase
      .from("warranty_certificate_items")
      .insert(itemRows);

    if (itemsError) {
      return NextResponse.json(
        {
          success: false,
          error: itemsError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      certificate,
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