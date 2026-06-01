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
    const statusUrl = `https://starwarranty.vercel.app/repair-status?request_no=${encodeURIComponent(
      requestNo
    )}&phone=${encodeURIComponent(phone || "")}`;

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "【STAR WARRANTY】修理状況更新",
      html: `
<!doctype html>
<html lang="ja">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width:500px;background:#ffffff;border-radius:12px;padding:24px;">
            <tr>
              <td style="font-size:24px;font-weight:bold;">STAR WARRANTY</td>
            </tr>
            <tr>
              <td style="font-size:16px;padding-top:16px;">修理状況が更新されました</td>
            </tr>
            <tr>
              <td style="padding-top:20px;color:#666;">受付番号</td>
            </tr>
            <tr>
              <td style="font-size:28px;font-weight:bold;padding-top:6px;">${requestNo}</td>
            </tr>
            <tr>
              <td style="padding-top:16px;">
                <div style="padding:16px;background:#f9fafb;border-radius:8px;text-align:center;">
                  <div style="font-size:12px;color:#666;">現在のステータス</div>
                  <div style="font-size:20px;font-weight:bold;margin-top:4px;">
                    ${getStatusLabel(status)}
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px;font-size:14px;color:#374151;">
                修理状況確認ページでは、以下を入力してください。<br />
                ・受付番号：${requestNo}<br />
                ・電話番号：${phone || ""}
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px;text-align:center;">
                <a href="${statusUrl}"
                   style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">
                  修理状況を確認する
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px;font-size:12px;color:#999;text-align:center;">
                ※本メールは自動送信です
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`,
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