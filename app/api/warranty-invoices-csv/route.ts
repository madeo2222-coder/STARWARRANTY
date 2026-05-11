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

function escapeCsv(value: unknown) {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "draft":
      return "下書き";
    case "issued":
      return "発行済み";
    case "unpaid":
      return "未入金";
    case "paid":
      return "入金済み";
    case "cancelled":
      return "取消";
    default:
      return status || "";
  }
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_invoices")
      .select(
        `
          invoice_no,
          invoice_date,
          payment_due_date,
          bill_to_company_name,
          bill_to_name,
          subject,
          subtotal,
          tax_amount,
          total_amount,
          status,
          created_at
        `
      )
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    const rows = data || [];

    const header = [
      "請求書番号",
      "請求日",
      "支払期限",
      "宛先会社名",
      "宛先担当者名",
      "件名",
      "小計",
      "消費税",
      "合計",
      "ステータス",
      "作成日",
    ];

    const csvLines = [
      header.join(","),
      ...rows.map((row) =>
        [
          escapeCsv(row.invoice_no),
          escapeCsv(row.invoice_date),
          escapeCsv(row.payment_due_date),
          escapeCsv(row.bill_to_company_name),
          escapeCsv(row.bill_to_name),
          escapeCsv(row.subject),
          escapeCsv(row.subtotal),
          escapeCsv(row.tax_amount),
          escapeCsv(row.total_amount),
          escapeCsv(statusLabel(row.status)),
          escapeCsv(row.created_at),
        ].join(",")
      ),
    ];

    const csvContent = "\uFEFF" + csvLines.join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type":
          "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="warranty-invoices.csv"',
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "CSV出力に失敗しました",
      },
      { status: 500 }
    );
  }
}