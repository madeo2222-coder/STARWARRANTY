import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY!);

type InvoiceRow = {
  id: string;
  invoice_no: string | null;
  bill_to_company_name: string | null;
  bill_to_name: string | null;
  bill_to_email?: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
  status: string | null;
};

type SendLogRow = {
  id: string;
  invoice_id: string | null;
  send_type: string | null;
  sent_at: string | null;
};

type ReminderStage = {
  sendType: "auto_reminder_1" | "auto_reminder_2" | "auto_reminder_3";
  minOverdueDays: number;
  label: string;
  subjectPrefix: string;
  toneText: string;
};

type RunResult = {
  invoice_id: string;
  invoice_no: string | null;
  status: "skipped" | "sent" | "failed";
  reason?: string;
  to_email?: string;
  send_type?: string;
};

const reminderStages: ReminderStage[] = [
  {
    sendType: "auto_reminder_3",
    minOverdueDays: 14,
    label: "最終督促",
    subjectPrefix: "【重要】請求書ご確認のお願い",
    toneText:
      "度々のご案内となり恐れ入りますが、現時点で入金確認が取れておりません。至急ご確認をお願いいたします。",
  },
  {
    sendType: "auto_reminder_2",
    minOverdueDays: 7,
    label: "再督促",
    subjectPrefix: "【再送】請求書ご確認のお願い",
    toneText:
      "先日ご案内いたしました請求書につきまして、現時点で入金確認が取れておりません。お手数ですが、ご確認をお願いいたします。",
  },
  {
    sendType: "auto_reminder_1",
    minOverdueDays: 3,
    label: "初回督促",
    subjectPrefix: "請求書ご確認のお願い",
    toneText:
      "請求書につきまして、支払期限を過ぎております。念のためご案内いたしますので、ご確認をお願いいたします。",
  },
];

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

function formatYen(value: number | null | undefined) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function buildReminderEmailHtml(params: {
  invoiceNo: string;
  paymentDueDate: string;
  totalAmount: number | null;
  stageLabel: string;
  toneText: string;
}) {
  return `
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>${params.stageLabel}</title>
  </head>
  <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif; color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6; margin:0; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; width:100%; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding:24px; background:#991b1b;">
                <div style="font-size:22px; line-height:1.4; font-weight:700; color:#ffffff;">
                  ${params.stageLabel}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;">
                <div style="font-size:14px; line-height:1.9; color:#374151;">
                  いつもお世話になっております。<br />
                  ${params.toneText}<br /><br />
                  <strong>請求書番号：</strong>${params.invoiceNo}<br />
                  <strong>請求金額：</strong>${formatYen(params.totalAmount)}<br />
                  <strong>支払期限：</strong>${params.paymentDueDate}<br /><br />
                  請求書PDFを添付しておりますので、ご確認をお願いいたします。
                </div>

                <div style="margin-top:20px; padding:16px; background:#fef2f2; border:1px solid #fecaca; border-radius:12px; font-size:13px; line-height:1.8; color:#7f1d1d;">
                  ※ 既にお支払い済みの場合は、行き違いのご案内となりますのでご容赦ください。<br />
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

function getOverdueDays(paymentDueDate: string | null) {
  if (!paymentDueDate) return 0;

  const due = new Date(paymentDueDate);
  const now = new Date();

  const diff = now.getTime() - due.getTime();

  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getNextReminderStage(
  overdueDays: number,
  invoiceId: string,
  logs: SendLogRow[]
) {
  const invoiceLogs = logs.filter((log) => log.invoice_id === invoiceId);

  for (const stage of reminderStages) {
    if (overdueDays < stage.minOverdueDays) {
      continue;
    }

    const alreadySentThisStage = invoiceLogs.some(
      (log) => log.send_type === stage.sendType
    );

    if (!alreadySentThisStage) {
      return stage;
    }
  }

  return null;
}

async function runAutoReminders(req: Request) {
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
          bill_to_email,
          total_amount,
          payment_due_date,
          status
        `
      )
      .in("status", ["issued", "unpaid"])
      .order("payment_due_date", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const { data: sendLogs, error: sendLogsError } = await supabase
      .from("warranty_invoice_send_logs")
      .select("id, invoice_id, send_type, sent_at")
      .in("send_type", [
        "auto_reminder_1",
        "auto_reminder_2",
        "auto_reminder_3",
      ]);

    if (sendLogsError) {
      return NextResponse.json(
        {
          success: false,
          error: sendLogsError.message,
        },
        { status: 500 }
      );
    }

    const today = new Date();
    const autoReminderLogs = (sendLogs || []) as SendLogRow[];

    const overdueInvoices = ((data || []) as InvoiceRow[]).filter((invoice) => {
      if (!invoice.payment_due_date) return false;

      return new Date(invoice.payment_due_date).getTime() < today.getTime();
    });

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      new URL(req.url).origin;

    const results: RunResult[] = [];

    for (const invoice of overdueInvoices) {
      const overdueDays = getOverdueDays(invoice.payment_due_date);

      const nextStage = getNextReminderStage(
        overdueDays,
        invoice.id,
        autoReminderLogs
      );

      if (!nextStage) {
        results.push({
          invoice_id: invoice.id,
          invoice_no: invoice.invoice_no,
          status: "skipped",
          reason:
            overdueDays < 3
              ? "3日未満の期限超過のためスキップ"
              : "送信可能な自動督促はすべて送信済みのためスキップ",
        });
        continue;
      }

      const toEmail = invoice.bill_to_email?.trim();

      if (!toEmail) {
        results.push({
          invoice_id: invoice.id,
          invoice_no: invoice.invoice_no,
          status: "skipped",
          reason: "送信先メールが未登録のためスキップ",
          send_type: nextStage.sendType,
        });
        continue;
      }

      try {
        const pdfRes = await fetch(
          `${origin}/api/generate-warranty-invoice-pdf`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: req.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              invoice_id: invoice.id,
            }),
            cache: "no-store",
          }
        );

        if (!pdfRes.ok) {
          results.push({
            invoice_id: invoice.id,
            invoice_no: invoice.invoice_no,
            status: "failed",
            reason: "PDF生成に失敗しました",
            to_email: toEmail,
            send_type: nextStage.sendType,
          });
          continue;
        }

        const pdfArrayBuffer = await pdfRes.arrayBuffer();
        const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

        const subject = `【株式会社スター・ワランティ】${
          nextStage.subjectPrefix
        } (${invoice.invoice_no || ""})`;

        const html = buildReminderEmailHtml({
          invoiceNo: invoice.invoice_no || "-",
          paymentDueDate: invoice.payment_due_date || "-",
          totalAmount: invoice.total_amount,
          stageLabel: nextStage.label,
          toneText: nextStage.toneText,
        });

        const { error: sendError } = await resend.emails.send({
          from: "Star Warranty <onboarding@resend.dev>",
          to: [toEmail],
          subject,
          html,
          attachments: [
            {
              filename: `warranty-invoice-${nextStage.sendType}-${invoice.id}.pdf`,
              content: pdfBase64,
            },
          ],
        });

        if (sendError) {
          results.push({
            invoice_id: invoice.id,
            invoice_no: invoice.invoice_no,
            status: "failed",
            reason: "メール送信に失敗しました",
            to_email: toEmail,
            send_type: nextStage.sendType,
          });
          continue;
        }

        const { error: logError } = await supabase
          .from("warranty_invoice_send_logs")
          .insert({
            invoice_id: invoice.id,
            to_email: toEmail,
            subject,
            send_type: nextStage.sendType,
            sent_at: new Date().toISOString(),
          });

        if (logError) {
          console.error("auto reminder log insert error:", logError);
        }

        results.push({
          invoice_id: invoice.id,
          invoice_no: invoice.invoice_no,
          status: "sent",
          to_email: toEmail,
          send_type: nextStage.sendType,
        });
      } catch (error) {
        results.push({
          invoice_id: invoice.id,
          invoice_no: invoice.invoice_no,
          status: "failed",
          reason:
            error instanceof Error
              ? error.message
              : "自動督促送信中に不明なエラーが発生しました",
          to_email: toEmail,
          send_type: nextStage.sendType,
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked: overdueInvoices.length,
      sent: results.filter((result) => result.status === "sent").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "自動督促送信に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runAutoReminders(req);
}

export async function POST(req: Request) {
  return runAutoReminders(req);
}