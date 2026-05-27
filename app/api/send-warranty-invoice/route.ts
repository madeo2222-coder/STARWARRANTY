import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY!);

type SendWarrantyInvoiceBody = {
  invoice_id?: string;
  invoiceId?: string;
  to_email?: string;
  subject?: string;
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

function buildEmailHtml(params: { subject: string }) {
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
                  請求書PDFを添付しておりますので、ご確認をお願いいたします。
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
    });

    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: [toEmail],
      subject,
      html,
      attachments: [
        {
          filename: `warranty-invoice-${invoiceId}.pdf`,
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

    const supabase = getAdminClient();

    // 🔥 ここ追加（ステータス更新）
    await supabase
      .from("warranty_invoices")
      .update({ status: "issued" })
      .eq("id", invoiceId);

    const { error: logError } = await supabase
      .from("warranty_invoice_send_logs")
      .insert({
        invoice_id: invoiceId,
        to_email: toEmail,
        subject,
        send_type: "invoice",
        sent_at: new Date().toISOString(),
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
        error: "サーバーエラー",
      },
      { status: 500 }
    );
  }
}