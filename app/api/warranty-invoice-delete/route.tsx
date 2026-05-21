import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const body = await req.json();
    const invoiceId = String(body.invoice_id || "");

    if (!invoiceId) {
      return NextResponse.json(
        {
          success: false,
          error: "invoice_id がありません",
        },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { error: itemsError } = await supabase
      .from("warranty_invoice_items")
      .delete()
      .eq("invoice_id", invoiceId);

    if (itemsError) {
      return NextResponse.json(
        {
          success: false,
          error: itemsError.message,
        },
        { status: 500 }
      );
    }

    const { error: logsError } = await supabase
      .from("warranty_invoice_send_logs")
      .delete()
      .eq("invoice_id", invoiceId);

    if (logsError) {
      return NextResponse.json(
        {
          success: false,
          error: logsError.message,
        },
        { status: 500 }
      );
    }

    const { error: invoiceError } = await supabase
      .from("warranty_invoices")
      .delete()
      .eq("id", invoiceId);

    if (invoiceError) {
      return NextResponse.json(
        {
          success: false,
          error: invoiceError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "請求書の削除に失敗しました",
      },
      { status: 500 }
    );
  }
}