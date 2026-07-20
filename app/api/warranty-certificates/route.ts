import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createWarrantyCertificate,
  WarrantyCertificateRegistrationError,
  type WarrantyCertificateItemInput,
} from "@/lib/warranty/register-certificate";
import {
  HeadquartersAuthError,
  requireHeadquartersBearer,
} from "@/lib/auth/headquarters";

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
  items?: WarrantyCertificateItemInput[];
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

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    await requireHeadquartersBearer(request, supabase);

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
    if (error instanceof HeadquartersAuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
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
    await requireHeadquartersBearer(req, supabase);
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

    const certificate = await createWarrantyCertificate(supabase, {
      certificate_no: body.certificate_no,
      customer_name: body.customer_name,
      customer_name_kana: body.customer_name_kana,
      postal_code: body.postal_code,
      address1: body.address1,
      address2: body.address2,
      address3: body.address3,
      property_name: body.property_name,
      property_room: body.property_room,
      start_date: body.start_date,
      introducer_name: body.introducer_name,
      seller_name: body.seller_name,
      note: body.note,
      items: body.items,
    });

    return NextResponse.json({
      success: true,
      certificate,
    });
  } catch (error) {
    if (error instanceof HeadquartersAuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "保存に失敗しました",
      },
      {
        status:
          error instanceof WarrantyCertificateRegistrationError &&
          error.kind === "validation"
            ? 400
            : 500,
      }
    );
  }
}
