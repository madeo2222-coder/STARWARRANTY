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

    // ▼ JSON or FormData 判定
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

    // ▼ バリデーション
    if (!requestId || !status) {
      return NextResponse.json(
        { success: false, error: "パラメータ不足" },
        { status: 400 }
      );
    }

    // ✅ ▼ ステータス更新（ここが今回の本命）
    const { error } = await supabase
      .from("repair_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      console.error("status update error:", error);
      return NextResponse.json(
        { success: false, error: "ステータス更新失敗" },
        { status: 500 }
      );
    }

    // ✅ 成功時
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