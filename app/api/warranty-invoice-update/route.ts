import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvoiceItemInput = {
  item_name?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
};

type UpdateWarrantyInvoiceBody = {
  invoice_id?: string;
  invoiceId?: string;
  invoice_date?: string;
  payment_due_date?: string;
  subject?: string;
  bill_to_company_name?: string;
  bill_to_name?: string;
  note?: string;
  status?: string;
  items?: InvoiceItemInput[];
};

const ALLOWED_STATUSES = ["draft", "issued", "unpaid", "paid", "cancelled"];

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
    const body = (await req.json()) as UpdateWarrantyInvoiceBody;

    const invoiceId = body.invoice_id?.trim() || body.invoiceId?.trim();

    if (!invoiceId) {
      return NextResponse.json(
        {
          success: false,
          error: "invoice_id がありません",
        },
        { status: 400 }
      );
    }

    const status = body.status?.trim() || "draft";

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "status が不正です",
        },
        { status: 400 }
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];

    const validItems = items.filter((item) =>
      String(item.item_name || "").trim()
    );

    if (validItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "明細を1行以上入力してください",
        },
        { status: 400 }
      );
    }

    const subtotal = validItems.reduce((sum, item) => {
      return (
        sum +
        Number(item.quantity || 0) * Number(item.unit_price || 0)
      );
    }, 0);

    const taxRate = 0.1;
    const taxAmount = Math.floor(subtotal * taxRate);
    const totalAmount = subtotal + taxAmount;

    const supabase = getAdminClient();

    const { error: invoiceError } = await supabase
      .from("warranty_invoices")
      .update({
        invoice_date: body.invoice_date || null,
        payment_due_date: body.payment_due_date || null,
        subject: body.subject?.trim() || null,
        bill_to_company_name: body.bill_to_company_name?.trim() || null,
        bill_to_name: body.bill_to_name?.trim() || null,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        note: body.note?.trim() || null,
        status,
        updated_at: new Date().toISOString(),
      })
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

    const { error: deleteError } = await supabase
      .from("warranty_invoice_items")
      .delete()
      .eq("invoice_id", invoiceId);

    if (deleteError) {
      return NextResponse.json(
        {
          success: false,
          error: deleteError.message,
        },
        { status: 500 }
      );
    }

    const itemRows = validItems.map((item, index) => ({
      invoice_id: invoiceId,
      item_name: String(item.item_name || "").trim(),
      description: String(item.description || "").trim() || null,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      amount: Number(item.quantity || 0) * Number(item.unit_price || 0),
      sort_order: index,
    }));

    const { error: insertError } = await supabase
      .from("warranty_invoice_items")
      .insert(itemRows);

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "更新中に不明なエラーが発生しました",
      },
      { status: 500 }
    );
  }
}