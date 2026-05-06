import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    // ▼ ダミー処理（まずビルド優先）
    // ※ここは後でSupabase更新ロジック戻す

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