import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CopyBody = {
  invoice_id?: string;
  invoiceId?: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL が設定されていません"
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が設定されていません"
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey
  );
}

function generateInvoiceNo() {
  const now = new Date();

  const yyyy = now.getFullYear();

  const mm = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const dd = String(
    now.getDate()
  ).padStart(2, "0");

  const hh = String(
    now.getHours()
  ).padStart(2, "0");

  const mi = String(
    now.getMinutes()
  ).padStart(2, "0");

  const ss = String(
    now.getSeconds()
  ).padStart(2, "0");

  return `INV-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export async function POST(req: Request) {
  try {
    const body =
      (await req.json()) as CopyBody;

    const invoiceId =
      body.invoice_id?.trim() ||
      body.invoiceId?.trim();

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

    const {
      data: sourceInvoice,
      error: invoiceError,
    } = await supabase
      .from("warranty_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !sourceInvoice) {
      return NextResponse.json(
        {
          success: false,
          error:
            invoiceError?.message ||
            "請求書が見つかりません",
        },
        { status: 404 }
      );
    }

    const {
      data: sourceItems,
      error: itemsError,
    } = await supabase
      .from("warranty_invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", {
        ascending: true,
      });

    if (itemsError) {
      return NextResponse.json(
        {
          success: false,
          error: itemsError.message,
        },
        { status: 500 }
      );
    }

    const newInvoiceNo =
      generateInvoiceNo();

    const {
      data: insertedInvoice,
      error: insertInvoiceError,
    } = await supabase
      .from("warranty_invoices")
      .insert({
        invoice_no: newInvoiceNo,

        invoice_date:
          sourceInvoice.invoice_date,

        payment_due_date:
          sourceInvoice.payment_due_date,

        subject:
          sourceInvoice.subject,

        bill_to_company_name:
          sourceInvoice.bill_to_company_name,

        bill_to_name:
          sourceInvoice.bill_to_name,

        issuer_company_name:
          sourceInvoice.issuer_company_name,

        issuer_postal_code:
          sourceInvoice.issuer_postal_code,

        issuer_address:
          sourceInvoice.issuer_address,

        issuer_tel:
          sourceInvoice.issuer_tel,

        issuer_email:
          sourceInvoice.issuer_email,

        issuer_contact_name:
          sourceInvoice.issuer_contact_name,

        issuer_invoice_number:
          sourceInvoice.issuer_invoice_number,

        subtotal:
          sourceInvoice.subtotal,

        tax_rate:
          sourceInvoice.tax_rate,

        tax_amount:
          sourceInvoice.tax_amount,

        total_amount:
          sourceInvoice.total_amount,

        bank_account_info:
          sourceInvoice.bank_account_info,

        note:
          sourceInvoice.note,

        closing_label:
          sourceInvoice.closing_label,

        status: "draft",
      })
      .select("id")
      .single();

    if (
      insertInvoiceError ||
      !insertedInvoice
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            insertInvoiceError?.message ||
            "請求書コピーに失敗しました",
        },
        { status: 500 }
      );
    }

    const newInvoiceId =
      insertedInvoice.id;

    const itemRows = (
      sourceItems || []
    ).map((item, index) => ({
      invoice_id: newInvoiceId,

      item_name: item.item_name,

      description:
        item.description,

      quantity: item.quantity,

      unit_price:
        item.unit_price,

      amount: item.amount,

      sort_order: index,
    }));

    if (itemRows.length > 0) {
      const { error: insertItemsError } =
        await supabase
          .from(
            "warranty_invoice_items"
          )
          .insert(itemRows);

      if (insertItemsError) {
        return NextResponse.json(
          {
            success: false,
            error:
              insertItemsError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      invoice_id: newInvoiceId,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "コピー中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}