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

type CurrentRepairRequest = {
  id: string;
  status: string | null;
  admin_note: string | null;
  assigned_to: string | null;
};

type AdminSupabaseClient = ReturnType<typeof createClient>;

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

function buildRedirectUrl(
  baseUrl: string,
  nextPath: string,
  params: URLSearchParams
) {
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

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "received":
      return "受付";
    case "checking":
      return "内容確認中";
    case "manufacturer_checking":
      return "メーカー確認中";
    case "repair_arranging":
      return "修理手配中";
    case "visit_scheduling":
      return "訪問日調整中";
    case "completed":
      return "修理完了";
    case "out_of_warranty":
      return "保証対象外";
    case "cancelled":
      return "キャンセル";
    default:
      return status || "-";
  }
}

async function addHistory({
  supabase,
  repairRequestId,
  actionType,
  title,
  detail,
}: {
  supabase: AdminSupabaseClient;
  repairRequestId: string;
  actionType: string;
  title: string;
  detail?: string | null;
}) {
  const payload = {
    repair_request_id: repairRequestId,
    action_type: actionType,
    title,
    detail: detail || null,
    created_by: "本部",
  };

  const table = supabase.from("repair_request_histories" as never);

  const { error } = await table.insert(payload as never);

  if (error) {
    console.error("repair_request_histories insert error", error.message);
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const supabase = getAdminClient();

    let requestId = "";
    let status = "";
    let nextPath = "/repair-requests";
    let action = "update";
    let updateBody: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        request_id?: string;
        status?: string;
        next_path?: string;
        action?: string;
        customer_name?: string;
        customer_name_kana?: string | null;
        phone?: string;
        email?: string | null;
        postal_code?: string | null;
        address?: string | null;
        product_name?: string;
        manufacturer?: string | null;
        model_no?: string | null;
        installation_place?: string | null;
        failure_date?: string | null;
        symptom_category?: string | null;
        symptom_detail?: string;
        error_code?: string | null;
        is_usable?: boolean | null;
        admin_note?: string | null;
        assigned_to?: string | null;
      };

      requestId = body.request_id || "";
      status = body.status || "";
      nextPath = body.next_path || "/repair-requests";
      action = body.action || "update";

      updateBody = {
        customer_name: body.customer_name?.trim() || "",
        customer_name_kana: body.customer_name_kana || null,
        phone: body.phone?.trim() || "",
        email: body.email || null,
        postal_code: body.postal_code || null,
        address: body.address || null,
        product_name: body.product_name?.trim() || "",
        manufacturer: body.manufacturer || null,
        model_no: body.model_no || null,
        installation_place: body.installation_place || null,
        failure_date: body.failure_date || null,
        symptom_category: body.symptom_category || null,
        symptom_detail: body.symptom_detail?.trim() || "",
        error_code: body.error_code || null,
        is_usable:
          typeof body.is_usable === "boolean" ? body.is_usable : null,
        admin_note: body.admin_note || null,
        assigned_to: body.assigned_to || null,
        status,
      };
    } else {
      const formData = await request.formData();

      requestId = String(formData.get("request_id") || "");
      status = String(formData.get("status") || "");
      nextPath = String(formData.get("next_path") || "/repair-requests");
      action = String(formData.get("action") || "update");

      const isUsableValue = String(formData.get("is_usable") || "");

      updateBody = {
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
        is_usable:
          isUsableValue === "yes"
            ? true
            : isUsableValue === "no"
              ? false
              : null,
        admin_note: nullableText(formData.get("admin_note")),
        assigned_to: nullableText(formData.get("assigned_to")),
        status,
      };
    }

    if (!requestId) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            error: encodeURIComponent("request_id がありません"),
          })
        )
      );
    }

    const { data: currentRequest } = await supabase
      .from("repair_requests")
      .select("id, status, admin_note, assigned_to")
      .eq("id", requestId)
      .single();

    const typedCurrentRequest =
      (currentRequest as CurrentRepairRequest | null) || null;

    if (action === "delete") {
      const { data: attachments } = await supabase
        .from("repair_request_attachments")
        .select("file_path")
        .eq("repair_request_id", requestId);

      const filePaths =
        attachments
          ?.map((item: { file_path: string | null }) => item.file_path)
          .filter((path): path is string => Boolean(path)) || [];

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
            new URLSearchParams({
              error: encodeURIComponent(deleteError.message),
            })
          )
        );
      }

      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          "/repair-requests",
          new URLSearchParams({
            deleted: "1",
          })
        )
      );
    }

    if (!isAllowedStatus(status)) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            error: encodeURIComponent("不正なステータスです"),
          })
        )
      );
    }

    if (!String(updateBody.customer_name || "").trim()) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            error: encodeURIComponent("お名前がありません"),
          })
        )
      );
    }

    if (!String(updateBody.phone || "").trim()) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            error: encodeURIComponent("電話番号がありません"),
          })
        )
      );
    }

    if (!String(updateBody.product_name || "").trim()) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            error: encodeURIComponent("対象機器がありません"),
          })
        )
      );
    }

    if (!String(updateBody.symptom_detail || "").trim()) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            error: encodeURIComponent("故障内容がありません"),
          })
        )
      );
    }

    const { error } = await supabase
      .from("repair_requests")
      .update(updateBody)
      .eq("id", requestId);

    if (error) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            error: encodeURIComponent(error.message),
          })
        )
      );
    }

    const newAdminNote = String(updateBody.admin_note || "").trim();
    const oldAdminNote = String(typedCurrentRequest?.admin_note || "").trim();
    const newAssignedTo = String(updateBody.assigned_to || "").trim();
    const oldAssignedTo = String(typedCurrentRequest?.assigned_to || "").trim();

    if (typedCurrentRequest?.status && typedCurrentRequest.status !== status) {
      await addHistory({
        supabase,
        repairRequestId: requestId,
        actionType: "status_changed",
        title: "ステータスを変更しました",
        detail: `${statusLabel(typedCurrentRequest.status)} → ${statusLabel(
          status
        )}`,
      });
    }

    if (newAssignedTo !== oldAssignedTo) {
      await addHistory({
        supabase,
        repairRequestId: requestId,
        actionType: "assigned_to_changed",
        title: "担当者を変更しました",
        detail: `${oldAssignedTo || "未設定"} → ${
          newAssignedTo || "未設定"
        }`,
      });
    }

    if (newAdminNote && newAdminNote !== oldAdminNote) {
      await addHistory({
        supabase,
        repairRequestId: requestId,
        actionType: "admin_note_updated",
        title: "社内対応メモを更新しました",
        detail: newAdminNote,
      });
    }

    if (
      !typedCurrentRequest?.status ||
      (typedCurrentRequest.status === status &&
        newAdminNote === oldAdminNote &&
        newAssignedTo === oldAssignedTo)
    ) {
      await addHistory({
        supabase,
        repairRequestId: requestId,
        actionType: "request_updated",
        title: "修理受付情報を更新しました",
        detail: "お客様情報・故障内容などを更新しました。",
      });
    }

    return NextResponse.redirect(
      buildRedirectUrl(
        request.url,
        nextPath,
        new URLSearchParams({
          updated: "1",
        })
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