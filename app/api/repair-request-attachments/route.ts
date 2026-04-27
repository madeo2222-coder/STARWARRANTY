import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "repair_request_attachments";
const MAX_FILES = 5;

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

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-ぁ-んァ-ヶ一-龠]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
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

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const formData = await request.formData();

    const repairRequestId = String(formData.get("repair_request_id") || "");
    const nextPath = String(formData.get("next_path") || "");
    const files = formData.getAll("files").filter((item): item is File => {
      return item instanceof File;
    });

    const shouldRedirect = Boolean(nextPath);

    function errorResponse(message: string, status = 400) {
      if (shouldRedirect) {
        return NextResponse.redirect(
          buildRedirectUrl(
            request.url,
            nextPath,
            new URLSearchParams({
              error: encodeURIComponent(message),
            })
          )
        );
      }

      return NextResponse.json(
        { success: false, error: message },
        { status }
      );
    }

    if (!repairRequestId) {
      return errorResponse("repair_request_id がありません");
    }

    if (files.length === 0) {
      return errorResponse("アップロードする写真がありません");
    }

    if (files.length > MAX_FILES) {
      return errorResponse("一度にアップロードできる写真は最大5枚までです");
    }

    const { count, error: countError } = await supabase
      .from("repair_request_attachments")
      .select("id", { count: "exact", head: true })
      .eq("repair_request_id", repairRequestId);

    if (countError) {
      return errorResponse(`既存写真数の確認に失敗しました: ${countError.message}`, 500);
    }

    const currentCount = count || 0;

    if (currentCount + files.length > MAX_FILES) {
      return errorResponse(
        `写真は合計最大5枚までです。現在${currentCount}枚登録済みです。`
      );
    }

    const savedAttachments = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];

      if (!file.type.startsWith("image/")) {
        return errorResponse("画像ファイルのみアップロードできます");
      }

      const safeName = sanitizeFileName(file.name || `image-${i + 1}`);
      const filePath = `${repairRequestId}/${Date.now()}-${i + 1}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        return errorResponse(
          `写真アップロードに失敗しました: ${uploadError.message}`,
          500
        );
      }

      const { data: inserted, error: insertError } = await supabase
        .from("repair_request_attachments")
        .insert({
          repair_request_id: repairRequestId,
          file_path: filePath,
          file_name: safeName,
        })
        .select("id, repair_request_id, file_path, file_name")
        .single();

      if (insertError) {
        await supabase.storage.from(BUCKET_NAME).remove([filePath]);

        return errorResponse(
          `写真情報の保存に失敗しました: ${insertError.message}`,
          500
        );
      }

      savedAttachments.push(inserted);
    }

    if (shouldRedirect) {
      return NextResponse.redirect(
        buildRedirectUrl(
          request.url,
          nextPath,
          new URLSearchParams({
            photo_added: "1",
          })
        )
      );
    }

    return NextResponse.json({
      success: true,
      attachments: savedAttachments,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "写真アップロード処理に失敗しました",
      },
      { status: 500 }
    );
  }
}