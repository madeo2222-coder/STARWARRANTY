import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function buildRedirectUrl(
  baseUrl: string,
  path: string,
  params?: URLSearchParams
) {
  const url = new URL(path, baseUrl);
  if (params) {
    params.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }
  return url;
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

    // 🔥 ① 現在のステータス取得
    const { data: current, error: fetchError } = await supabase
      .from("repair_requests")
      .select("status")
      .eq("id", requestId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: "データ取得失敗" },
        { status: 500 }
      );
    }

    const oldStatus = current.status;

    // 🔥 ② ステータス更新
    const { error: updateError } = await supabase
      .from("repair_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: "ステータス更新失敗" },
        { status: 500 }
      );
    }

    // 🔥 ③ 履歴保存（ここが今回の追加）
    const { error: logError } = await supabase
      .from("repair_request_status_logs")
      .insert({
        request_id: requestId,
        old_status: oldStatus,
        new_status: status,
        created_at: new Date().toISOString(),
      });

    if (logError) {
      console.error("log insert error:", logError);
    }

    return NextResponse.redirect(
      buildRedirectUrl(
        request.url,
        nextPath,
        new URLSearchParams({ updated: "1" })
      )
    );

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "修理受付の更新に失敗しました";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}