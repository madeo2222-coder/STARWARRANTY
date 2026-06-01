import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  invoice_id?: string;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const invoiceId = body.invoice_id?.trim();

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: "invoice_id がありません" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: invoice, error: fetchError } = await supabase
      .from("warranty_invoices")
      .select("id, invoice_no, status, paid_at")
      .eq("id", invoiceId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      );
    }

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "対象の請求書が見つかりません" },
        { status: 404 }
      );
    }

    if (invoice.status === "cancelled") {
      return NextResponse.json(
        { success: false, error: "取消済み請求書は入金済みにできません" },
        { status: 400 }
      );
    }

    if (invoice.status === "paid") {
      return NextResponse.json({
        success: true,
        already_paid: true,
      });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("warranty_invoices")
      .update({
        status: "paid",
        paid_at: now,
        updated_at: now,
      })
      .eq("id", invoiceId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paid_at: now,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "入金処理に失敗しました",
      },
      { status: 500 }
    );
  }
}