import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReminderInvoiceRow = {
  id: string;
  invoice_no: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
  status: string | null;
};

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

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

function getOverdueDays(
  paymentDueDate: string | null
) {
  if (!paymentDueDate) return 0;

  const due = new Date(paymentDueDate);
  const now = new Date();

  const diff =
    now.getTime() - due.getTime();

  return Math.floor(
    diff / (1000 * 60 * 60 * 24)
  );
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_invoices")
      .select(
        `
          id,
          invoice_no,
          bill_to_company_name,
          bill_to_name,
          total_amount,
          payment_due_date,
          status
        `
      )
      .in("status", [
        "issued",
        "unpaid",
      ])
      .order("payment_due_date", {
        ascending: true,
      });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const overdueInvoices = (
      data || []
    )
      .filter((row) => {
        if (!row.payment_due_date)
          return false;

        return (
          new Date(
            row.payment_due_date
          ).getTime() <
          new Date().getTime()
        );
      })
      .map((row) => ({
        ...row,
        overdue_days: getOverdueDays(
          row.payment_due_date
        ),
      }));

    return NextResponse.json({
      success: true,
      count: overdueInvoices.length,
      invoices: overdueInvoices,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "自動督促チェックに失敗しました",
      },
      { status: 500 }
    );
  }
}