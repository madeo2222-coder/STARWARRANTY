import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

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

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let requestNo = "";
    let status = "";
    let nextPath = "/repair-requests";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      requestNo = String(body.request_no || "").trim();
      status = String(body.status || "").trim();
      nextPath = String(body.next_path || "/repair-requests");
    } else {
      const formData = await request.formData();
      requestNo = String(formData.get("request_no") || "").trim();
      status = String(formData.get("status") || "").trim();
      nextPath = String(formData.get("next_path") || "/repair-requests");
    }

    if (!requestNo || !status) {
      return NextResponse.json(
        { success: false, error: "パラメータ不足" },
        { status: 400 }
      );
    }

    const { data: current, error: fetchError } = await supabase
      .from("repair_requests")
      .select("request_no, status, email, customer_name, phone")
      .eq("request_no", requestNo)
      .maybeSingle();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: "データ取得失敗" },
        { status: 500 }
      );
    }

    const oldStatus = current.status;

    const { error: updateError } = await supabase
      .from("repair_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("request_no", requestNo);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: "更新失敗" },
        { status: 500 }
      );
    }

    await supabase.from("repair_request_status_logs").insert({
      request_no: requestNo,
      old_status: oldStatus,
      new_status: status,
      created_at: new Date().toISOString(),
    });

    if (current.email) {
      try {
        const statusUrl = `https://starwarranty.vercel.app/repair-status?request_no=${encodeURIComponent(
          requestNo
        )}&phone=${encodeURIComponent(current.phone || "")}`;

        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: current.email,
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
              <td style="padding:16px;background:#f9fafb;border-radius:8px;margin-top:16px;text-align:center;">
                <div style="font-size:12px;color:#666;">現在のステータス</div>
                <div style="font-size:20px;font-weight:bold;margin-top:4px;">
                  ${getStatusLabel(status)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px;font-size:14px;color:#374151;">
                修理状況確認ページでは、以下を入力してください。<br />
                ・受付番号：${requestNo}<br />
                ・電話番号：${current.phone || ""}
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