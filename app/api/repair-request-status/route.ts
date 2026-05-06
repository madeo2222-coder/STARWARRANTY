import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

// ステータス日本語化
function getStatusLabel(status: string) {
  switch (status) {
    case "received":
      return "受付完了";
    case "checking":
      return "確認中";
    case "manufacturer_checking":
      return "メーカー確認中";
    case "repair_arranging":
      return "修理手配中";
    case "visit_scheduling":
      return "訪問日程調整中";
    case "completed":
      return "対応完了";
    case "out_of_warranty":
      return "保証対象外";
    case "cancelled":
      return "キャンセル";
    default:
      return status;
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let requestId = "";
    let status = "";
    let nextPath = "/repair-requests";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      requestId = body.request_id || "";
      status = body.status || "";
      nextPath = body.next_path || "/repair-requests";
    } else {
      const formData = await request.formData();
      requestId = String(formData.get("request_id") || "");
      status = String(formData.get("status") || "");
      nextPath = String(formData.get("next_path") || "/repair-requests");
    }

    if (!requestId || !status) {
      return NextResponse.json(
        { success: false, error: "パラメータ不足" },
        { status: 400 }
      );
    }

    // 現在データ取得
    const { data: current, error: fetchError } = await supabase
      .from("repair_requests")
      .select("status, email, customer_name")
      .eq("id", requestId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: "データ取得失敗" },
        { status: 500 }
      );
    }

    const oldStatus = current.status;

    // 更新
    const { error: updateError } = await supabase
      .from("repair_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: "更新失敗" },
        { status: 500 }
      );
    }

    // 履歴
    await supabase.from("repair_request_status_logs").insert({
      request_id: requestId,
      old_status: oldStatus,
      new_status: status,
      created_at: new Date().toISOString(),
    });

    // メール送信
    if (current.email) {
      try {
        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: current.email,
          subject: `【STAR WARRANTY】修理状況更新（${requestId}）`,
          html: `
            <div style="font-family:sans-serif;">
              <p>${current.customer_name || ""} 様</p>

              <p>修理受付のステータスが更新されました。</p>

              <p><strong>${getStatusLabel(status)}</strong></p>

              <p>
                <a href="https://starwarranty.vercel.app/repair-status?request_no=${requestId}">
                  確認ページはこちら
                </a>
              </p>

              <p style="font-size:12px;color:#888;">
                STAR WARRANTY
              </p>
            </div>
          `,
        });
      } catch (e) {
        console.error("mail error:", e);
      }
    }

    return NextResponse.redirect(
      new URL(`${nextPath}?updated=1`, request.url)
    );

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "処理に失敗しました";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}