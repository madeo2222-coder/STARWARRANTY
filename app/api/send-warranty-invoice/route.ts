import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY!);

type SendWarrantyInvoiceBody = {
  invoice_id?: string;
  invoiceId?: string;
  to_email?: string;
  subject?: string;
};

type InvoiceRow = {
  id: string;
  invoice_no: string | null;
  status: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
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

function getMailFrom() {
  return (
    process.env.WARRANTY_MAIL_FROM ||
    "STAR WARRANTY <onboarding@resend.dev>"
  );
}

function formatYen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function buildEmailHtml(params: {
  subject: string;
  invoiceNo: string;
  totalAmount: number | null;
  paymentDueDate: string | null;
}) {
  return `
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${params.subject}</title>
  </head>

  <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif; color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6; margin:0; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; width:100%; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding:24px; background:#111827;">
                <div style="font-size:22px; line-height:1.4; font-weight:700; color:#ffffff;">
                  請求書送付のご案内
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;">
                <div style="font-size:14px; line-height:1.9; color:#374151;">
                  いつもお世話になっております。<br />
                  請求書PDFを添付しておりますので、ご確認をお願いいたします。<br /><br />

                  <strong>請求書番号：</strong>${params.invoiceNo}<br />
                  <strong>請求金額：</strong>${formatYen(params.totalAmount)}<br />
                  <strong>支払期限：</strong>${params.paymentDueDate || "-"}
                </div>

                <div style="margin-top:20px; padding:16px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; font-size:13px; line-height:1.8; color:#6b7280;">
                  ※ 添付ファイルが開けない場合はご連絡ください。<br />
                  ※ 本メールはシステムから送信されています。
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SendWarrantyInvoiceBody;

    const invoiceId = body.invoice_id?.trim() || body.invoiceId?.trim();
    const toEmail = body.to_email?.trim();

    const subject =
      body.subject?.trim() ||
      "【株式会社スター・ワランティ】請求書送付のご案内";

    if (!invoiceId || !toEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "invoice_id または to_email がありません",
        },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: invoice, error: fetchError } = await supabase
      .from("warranty_invoices")
      .select("id, invoice_no, status, total_amount, payment_due_date")
      .eq("id", invoiceId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        {
          success: false,
          error: fetchError.message,
        },
        { status: 500 }
      );
    }

    if (!invoice) {
      return NextResponse.json(
        {
          success: false,
          error: "対象の請求書が見つかりません",
        },
        { status: 404 }
      );
    }

    const invoiceRow = invoice as InvoiceRow;

    if (invoiceRow.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: "取消済み請求書は送信できません",
        },
        { status: 400 }
      );
    }

    if (invoiceRow.status === "paid") {
      return NextResponse.json(
        {
          success: false,
          error: "入金済み請求書は通常送信できません",
        },
        { status: 400 }
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(req.url).origin;

    const pdfRes = await fetch(`${origin}/api/generate-warranty-invoice-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        invoice_id: invoiceId,
      }),
      cache: "no-store",
    });

    if (!pdfRes.ok) {
      const errorText = await pdfRes.text();

      console.error("generate-warranty-invoice-pdf failed:", errorText);

      return NextResponse.json(
        {
          success: false,
          error: "PDF生成に失敗しました",
        },
        { status: 500 }
      );
    }

    const pdfArrayBuffer = await pdfRes.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    const html = buildEmailHtml({
      subject,
      invoiceNo: invoiceRow.invoice_no || "-",
      totalAmount: invoiceRow.total_amount,
      paymentDueDate: invoiceRow.payment_due_date,
    });

    const { data, error } = await resend.emails.send({
      from: getMailFrom(),
      to: [toEmail],
      subject,
      html,
      attachments: [
        {
          filename: `warranty-invoice-${invoiceRow.invoice_no || invoiceId}.pdf`,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          error: "メール送信に失敗しました",
        },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    if (invoiceRow.status === "draft") {
      const { error: updateError } = await supabase
        .from("warranty_invoices")
        .update({
          status: "issued",
          updated_at: now,
        })
        .eq("id", invoiceId);

      if (updateError) {
        console.error("warranty invoice status update error:", updateError);
      }
    }

    const { error: logError } = await supabase
      .from("warranty_invoice_send_logs")
      .insert({
        invoice_id: invoiceId,
        to_email: toEmail,
        subject,
        send_type: "invoice",
        sent_at: now,
      });

    if (logError) {
      console.error("warranty_invoice_send_logs insert error:", logError);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "請求書メール送信に失敗しました",
      },
      { status: 500 }
    );
  }
}