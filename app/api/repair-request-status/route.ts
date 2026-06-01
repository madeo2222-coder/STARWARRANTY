import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

type AnyBody = Record<string, any>;

function getMailFrom() {
  return (
    process.env.WARRANTY_MAIL_FROM ||
    "STAR WARRANTY <onboarding@resend.dev>"
  );
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://starwarranty.vercel.app";
}

function getStatusLabel(status: string) {
  switch (status) {
    case "received":
      return "受付完了";
    case "checking":
      return "内容確認中";
    case "manufacturer_checking":
      return "メーカー確認中";
    case "repair_arranging":
      return "修理手配中";
    case "visit_scheduling":
      return "訪問日程調整中";
    case "completed":
      return "修理完了";
    case "out_of_warranty":
      return "保証対象外";
    case "cancelled":
      return "キャンセル";
    default:
      return status;
  }
}

function getStatusMessage(status: string) {
  switch (status) {
    case "received":
      return "修理受付が完了しています。担当者が内容確認を進めています。";
    case "checking":
      return "受付内容・保証情報・添付写真を確認しています。";
    case "manufacturer_checking":
      return "メーカーへ確認中です。回答があり次第、次の対応へ進みます。";
    case "repair_arranging":
      return "修理手配を進めています。";
    case "visit_scheduling":
      return "訪問日程の調整段階です。担当者からの案内をお待ちください。";
    case "completed":
      return "修理対応が完了しました。";
    case "out_of_warranty":
      return "確認の結果、保証対象外となっています。";
    case "cancelled":
      return "この修理受付はキャンセルされています。";
    default:
      return "現在の受付状況を確認しています。";
  }
}

function makeSafeDetailPath(requestNo: string) {
  return `/repair-requests/detail?request_no=${encodeURIComponent(requestNo)}`;
}

function normalizeDateForDb(value: string | null | undefined) {
  if (!value) return null;

  const normalized = String(value).trim().replace(/\//g, "-");

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeOptionalText(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function normalizeRequiredText(value: unknown) {
  return String(value || "").trim();
}

function normalizeIsUsable(value: unknown) {
  const text = String(value || "").trim();

  if (text === "yes" || text === "true") return true;
  if (text === "no" || text === "false") return false;

  return null;
}

async function readBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as AnyBody;

    return {
      requestNo: normalizeRequiredText(body.request_no),
      status: normalizeRequiredText(body.status),
      nextPath: normalizeRequiredText(body.next_path) || "/repair-requests",
      action: normalizeRequiredText(body.action) || "update",
      body,
    };
  }

  const formData = await request.formData();

  const body: AnyBody = {};
  formData.forEach((value, key) => {
    body[key] = value;
  });

  return {
    requestNo: normalizeRequiredText(formData.get("request_no")),
    status: normalizeRequiredText(formData.get("status")),
    nextPath:
      normalizeRequiredText(formData.get("next_path")) || "/repair-requests",
    action: normalizeRequiredText(formData.get("action")) || "update",
    body,
  };
}

function buildStatusMailText({
  requestNo,
  status,
  phone,
  statusUrl,
}: {
  requestNo: string;
  status: string;
  phone: string;
  statusUrl: string;
}) {
  return `
修理状況が更新されました。

━━━━━━━━━━━━━━━━━━━━
受付番号：${requestNo}
現在のステータス：${getStatusLabel(status)}
━━━━━━━━━━━━━━━━━━━━

${getStatusMessage(status)}

修理状況は以下のページからご確認いただけます。

${statusUrl}

確認ページでは、以下の情報を入力してください。
・受付番号：${requestNo}
・電話番号：${phone || "-"}

※本メールは自動送信です。
※行き違いでご連絡済みの場合はご容赦ください。

STAR WARRANTY
`;
}

function buildStatusMailHtml({
  requestNo,
  status,
  phone,
  statusUrl,
}: {
  requestNo: string;
  status: string;
  phone: string;
  statusUrl: string;
}) {
  return `
<!doctype html>
<html lang="ja">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 12px;">
                <div style="font-size:12px;letter-spacing:0.16em;color:#6b7280;font-weight:700;">STAR WARRANTY</div>
                <h1 style="margin:10px 0 0;font-size:22px;line-height:1.4;">修理状況が更新されました</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px;font-size:14px;line-height:1.8;color:#374151;">
                修理受付の進行状況に更新がありました。
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                  <tr>
                    <td style="font-size:12px;color:#6b7280;padding:6px 0;">受付番号</td>
                    <td style="font-size:18px;font-weight:700;text-align:right;padding:6px 0;">${requestNo}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#6b7280;padding:6px 0;">現在のステータス</td>
                    <td style="font-size:16px;font-weight:700;text-align:right;padding:6px 0;">${getStatusLabel(status)}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 20px;font-size:14px;line-height:1.8;color:#374151;">
                ${getStatusMessage(status)}
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:0 24px 24px;">
                <a href="${statusUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 20px;font-size:14px;font-weight:700;">
                  修理状況を確認する
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px;background:#f9fafb;font-size:12px;line-height:1.7;color:#6b7280;">
                確認ページでは、受付番号「${requestNo}」と電話番号「${phone || "-"}」を入力してください。<br />
                ※本メールは自動送信です。
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

async function sendStatusMail({
  requestNo,
  status,
  email,
  phone,
}: {
  requestNo: string;
  status: string;
  email: string | null;
  phone: string | null;
}) {
  if (!email) return;

  try {
    const statusUrl = `${getBaseUrl()}/repair-status?request_no=${encodeURIComponent(
      requestNo
    )}&phone=${encodeURIComponent(phone || "")}`;

    await resend.emails.send({
      from: getMailFrom(),
      to: email,
      subject: `【STAR WARRANTY】修理状況更新のお知らせ（${requestNo}）`,
      text: buildStatusMailText({
        requestNo,
        status,
        phone: phone || "",
        statusUrl,
      }),
      html: buildStatusMailHtml({
        requestNo,
        status,
        phone: phone || "",
        statusUrl,
      }),
    });
  } catch (e) {
    console.error("mail error:", e);
  }
}

export async function POST(request: Request) {
  try {
    const { requestNo, status, nextPath, action, body } = await readBody(
      request
    );

    if (!requestNo) {
      return NextResponse.json(
        { success: false, error: "受付番号がありません" },
        { status: 400 }
      );
    }

    const { data: current, error: fetchError } = await supabase
      .from("repair_requests")
      .select("*")
      .eq("request_no", requestNo)
      .maybeSingle();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: "データ取得失敗" },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    if (action === "delete") {
      const { data: attachmentRows } = await supabase
        .from("repair_request_attachments")
        .select("id, file_path")
        .eq("repair_request_id", current.id);

      const filePaths = (attachmentRows || [])
        .map((attachment) => String(attachment.file_path || "").trim())
        .filter(Boolean);

      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("repair_request_attachments")
          .remove(filePaths);

        if (storageError) {
          console.error("repair request storage delete error:", storageError);
        }
      }

      await supabase
        .from("repair_request_attachments")
        .delete()
        .eq("repair_request_id", current.id);

      await supabase
        .from("repair_request_histories")
        .delete()
        .eq("repair_request_id", current.id);

      await supabase
        .from("repair_request_status_logs")
        .delete()
        .eq("request_no", requestNo);

      const { error: deleteError } = await supabase
        .from("repair_requests")
        .delete()
        .eq("request_no", requestNo);

      if (deleteError) {
        return NextResponse.json(
          { success: false, error: "削除失敗" },
          { status: 500 }
        );
      }

      const redirectUrl = new URL("/repair-requests", request.url);
      redirectUrl.searchParams.set("deleted", "1");

      return NextResponse.redirect(redirectUrl);
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: "ステータスがありません" },
        { status: 400 }
      );
    }

    const oldStatus = String(current.status || "");
    const isStatusChanged = oldStatus !== status;

    const updatePayload = {
      status,
      assigned_to: normalizeOptionalText(body.assigned_to),
      customer_name: normalizeRequiredText(body.customer_name),
      customer_name_kana: normalizeOptionalText(body.customer_name_kana),
      phone: normalizeRequiredText(body.phone),
      email: normalizeOptionalText(body.email),
      postal_code: normalizeOptionalText(body.postal_code),
      address: normalizeOptionalText(body.address),
      product_name: normalizeRequiredText(body.product_name),
      manufacturer: normalizeOptionalText(body.manufacturer),
      model_no: normalizeOptionalText(body.model_no),
      installation_place: normalizeOptionalText(body.installation_place),
      failure_date: normalizeDateForDb(body.failure_date),
      symptom_category: normalizeOptionalText(body.symptom_category),
      symptom_detail: normalizeRequiredText(body.symptom_detail),
      error_code: normalizeOptionalText(body.error_code),
      is_usable: normalizeIsUsable(body.is_usable),
      admin_note: normalizeOptionalText(body.admin_note),
      updated_at: now,
    };

    if (!updatePayload.customer_name) {
      return NextResponse.json(
        { success: false, error: "お客様名がありません" },
        { status: 400 }
      );
    }

    if (!updatePayload.phone) {
      return NextResponse.json(
        { success: false, error: "電話番号がありません" },
        { status: 400 }
      );
    }

    if (!updatePayload.product_name) {
      return NextResponse.json(
        { success: false, error: "対象機器がありません" },
        { status: 400 }
      );
    }

    if (!updatePayload.symptom_detail) {
      return NextResponse.json(
        { success: false, error: "故障内容がありません" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("repair_requests")
      .update(updatePayload)
      .eq("request_no", requestNo);

    if (updateError) {
      console.error("repair request update error:", updateError);

      return NextResponse.json(
        { success: false, error: "更新失敗" },
        { status: 500 }
      );
    }

    if (isStatusChanged) {
      await supabase.from("repair_request_status_logs").insert({
        request_no: requestNo,
        old_status: oldStatus,
        new_status: status,
        created_at: now,
      });

      await supabase.from("repair_request_histories").insert({
        repair_request_id: current.id,
        action_type: "status_update",
        title: `ステータス変更：${getStatusLabel(oldStatus)} → ${getStatusLabel(
          status
        )}`,
        detail: `受付番号 ${requestNo} のステータスを「${getStatusLabel(
          oldStatus
        )}」から「${getStatusLabel(status)}」へ変更しました。`,
        created_by: "system",
        created_at: now,
      });

      await sendStatusMail({
        requestNo,
        status,
        email: updatePayload.email,
        phone: updatePayload.phone,
      });
    } else {
      await supabase.from("repair_request_histories").insert({
        repair_request_id: current.id,
        action_type: "detail_update",
        title: "受付内容を更新",
        detail: "修理受付の内容を更新しました。",
        created_by: "system",
        created_at: now,
      });
    }

    const safeNextPath = nextPath.startsWith("/repair-requests/detail")
      ? makeSafeDetailPath(requestNo)
      : nextPath;

    const redirectUrl = new URL(safeNextPath, request.url);
    redirectUrl.searchParams.set("updated", "1");

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "処理に失敗しました";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}