import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

type SendDocumentBody = {
  to_email?: string;
  subject?: string;
  billing_id?: string;
  billingId?: string;
  document_type?: "invoice" | "receipt";
};

function buildPlainEmailHtml(params: {
  subject: string;
  documentType: "invoice" | "receipt";
}) {
  const label = params.documentType === "invoice" ? "請求書" : "領収書";

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
                  ${label}送付のご案内
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="font-size:14px; line-height:1.9; color:#374151;">
                  いつもお世話になっております。<br />
                  ${label}をPDFで添付しておりますので、ご確認をお願いいたします。
                </div>

                <div style="margin-top:20px; padding:16px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; font-size:13px; line-height:1.8; color:#6b7280;">
                  ※ 添付ファイルが開けない場合は、ご連絡ください。<br />
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
    const body = (await req.json()) as SendDocumentBody;

    const toEmail = body.to_email?.trim();
    const billingId = body.billing_id?.trim() || body.billingId?.trim();
    const documentType = body.document_type;
    const subject =
      body.subject?.trim() ||
      (documentType === "receipt" ? "領収書送付" : "請求書送付");

    if (!toEmail || !billingId || !documentType) {
      return NextResponse.json(
        { success: false, error: "missing params" },
        { status: 400 }
      );
    }

    if (documentType !== "invoice" && documentType !== "receipt") {
      return NextResponse.json(
        { success: false, error: "invalid document_type" },
        { status: 400 }
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(req.url).origin;

    const pdfRes = await fetch(`${origin}/api/generate-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        billing_id: billingId,
        document_type: documentType,
      }),
      cache: "no-store",
    });

    if (!pdfRes.ok) {
      const errorText = await pdfRes.text();
      console.error("generate-pdf failed:", errorText);

      return NextResponse.json(
        { success: false, error: "pdf generation failed" },
        { status: 500 }
      );
    }

    const pdfArrayBuffer = await pdfRes.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    const filename =
      documentType === "invoice"
        ? `invoice-${billingId}.pdf`
        : `receipt-${billingId}.pdf`;

    const html = buildPlainEmailHtml({
      subject,
      documentType,
    });

    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: [toEmail],
      subject,
      html,
      attachments: [
        {
          filename,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { success: false, error: "send failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { success: false, error: "server error" },
      { status: 500 }
    );
  }
}