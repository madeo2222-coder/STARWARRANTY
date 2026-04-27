import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "repair_request_attachments";

const ALLOWED_STATUSES = [
  "received",
  "checking",
  "manufacturer_checking",
  "repair_arranging",
  "visit_scheduling",
  "completed",
  "out_of_warranty",
  "cancelled",
] as const;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

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

function isAllowedStatus(value: string): value is AllowedStatus {
  return ALLOWED_STATUSES.includes(value as AllowedStatus);
}

function buildRedirectUrl(baseUrl: string, nextPath: string, params: URLSearchParams) {
  const url = new URL(nextPath, baseUrl);
  params.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url;
}

function nullableText(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text || null;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const supabase = getAdminClient();

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        request_id?: string;
        status?: string;
        action?: string;
        next_path?: string;
      };

      const requestId = body.request_id || "";
      const status = body.status || "";
      const action = body.action || "status";
      const nextPath = body.next_path || "/repair-requests";

      if (!requestId) {
        return NextResponse.json(
          { success: false, error: "request_id がありません" },
          { status: 400 }
        );
      }

      if (action === "delete") {
        const { data: attachments } = await supabase
          .from("repair_request_attachments")
          .select("file_path")
          .eq("repair_request_id", requestId);

        const filePaths =
          attachments?.map((item: { file_path: string }) => item.file_path) || [];

        if (filePaths.length > 0) {
          await supabase.storage.from(BUCKET_NAME).remove(filePaths);
        }

        await supabase
          .from("repair_request_attachments")
          .delete()
          .eq("repair_request_id", requestId);

        const { error: deleteError } = await supabase
          .from("repair_requests")
          .delete()
          .eq("id", requestId);

        if (deleteError) {
          return NextResponse.json(
            { success: false, error: deleteError.message },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true });
      }

      if (!isAllowedStatus(status)) {
        return NextResponse.json(
          { success: false, error: "不正なステータスです" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("repair_requests")
        .update({ status })
        .eq("id", requestId);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, next_path: nextPath });
    }

    const formData = await request.formData();

    const action = String(formData.get("action") || "update");
    const requestId = String(formData.get("request_id") || "");
    const nextPath = String(formData.get("next_path") || "/repair-requests");

    if (!requestId) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({ error: "request_id がありません" })
        )
      );
    }

    if (action === "delete") {
      const { data: attachments } = await supabase
        .from("repair_request_attachments")
        .select("file_path")
        .eq("repair_request_id", requestId);

      const filePaths =
        attachments?.map((item: { file_path: string }) => item.file_path) || [];

      if (filePaths.length > 0) {
        await supabase.storage.from(BUCKET_NAME).remove(filePaths);
      }

      await supabase
        .from("repair_request_attachments")
        .delete()
        .eq("repair_request_id", requestId);

      const { error: deleteError } = await supabase
        .from("repair_requests")
        .delete()
        .eq("id", requestId);

      if (deleteError) {
        return NextResponse.redirect(
          buildRedirectUrl(
            request.url,
            nextPath,
            new URLSearchParams({ error: deleteError.message })
          )
        );
      }

      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          "/repair-requests",
          new URLSearchParams({ deleted: "1" })
        )
      );
    }

    const status = String(formData.get("status") || "");

    if (!isAllowedStatus(status)) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({ error: "不正なステータスです" })
        )
      );
    }

    const isUsableValue = String(formData.get("is_usable") || "");
    const isUsable =
      isUsableValue === "true" ? true : isUsableValue === "false" ? false : null;

    const updatePayload = {
      customer_name: String(formData.get("customer_name") || "").trim(),
      customer_name_kana: nullableText(formData.get("customer_name_kana")),
      phone: String(formData.get("phone") || "").trim(),
      email: nullableText(formData.get("email")),
      postal_code: nullableText(formData.get("postal_code")),
      address: nullableText(formData.get("address")),
      product_name: String(formData.get("product_name") || "").trim(),
      manufacturer: nullableText(formData.get("manufacturer")),
      model_no: nullableText(formData.get("model_no")),
      installation_place: nullableText(formData.get("installation_place")),
      failure_date: nullableText(formData.get("failure_date")),
      symptom_category: nullableText(formData.get("symptom_category")),
      symptom_detail: String(formData.get("symptom_detail") || "").trim(),
      error_code: nullableText(formData.get("error_code")),
      is_usable: isUsable,
      status,
    };

    if (!updatePayload.customer_name) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({ error: "お名前がありません" })
        )
      );
    }

    if (!updatePayload.phone) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({ error: "電話番号がありません" })
        )
      );
    }

    if (!updatePayload.product_name) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({ error: "対象機器がありません" })
        )
      );
    }

    if (!updatePayload.symptom_detail) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({ error: "故障内容がありません" })
        )
      );
    }

    const { error } = await supabase
      .from("repair_requests")
      .update(updatePayload)
      .eq("id", requestId);

    if (error) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({ error: error.message })
        )
      );
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
      error instanceof Error ? error.message : "修理受付の更新に失敗しました";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}