import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "repair-attachments";

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

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const formData = await request.formData();

    const requestId = String(formData.get("request_id") || "");
    const files = formData.getAll("files").filter((item): item is File => {
      return item instanceof File;
    });

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "request_id がありません" },
        { status: 400 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "ファイルがありません" },
        { status: 400 }
      );
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const fileExt = file.name.split(".").pop() || "jpg";
      const safeFileName = file.name.replace(/[^\w.\-ぁ-んァ-ヶ一-龠]/g, "_");
      const fileName = `${requestId}/${Date.now()}-${safeFileName || `photo.${fileExt}`}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, buffer, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json(
          { success: false, error: uploadError.message },
          { status: 500 }
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("repair_request_attachments")
        .insert({
          repair_request_id: requestId,
          file_path: fileName,
        });

      if (insertError) {
        await supabase.storage.from(BUCKET_NAME).remove([fileName]);

        return NextResponse.json(
          { success: false, error: insertError.message },
          { status: 500 }
        );
      }

      uploadedUrls.push(publicUrlData.publicUrl);
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "写真保存に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getAdminClient();

    const body = (await request.json()) as {
      id?: string;
      file_path?: string;
    };

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "写真IDがありません" },
        { status: 400 }
      );
    }

    const { data: attachment, error: fetchError } = await supabase
      .from("repair_request_attachments")
      .select("id, file_path")
      .eq("id", body.id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json(
        {
          success: false,
          error: fetchError?.message || "削除対象の写真が見つかりません",
        },
        { status: 404 }
      );
    }

    const filePath = attachment.file_path || body.file_path;

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: "file_path がありません" },
        { status: 400 }
      );
    }

    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (storageError) {
      return NextResponse.json(
        { success: false, error: storageError.message },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabase
      .from("repair_request_attachments")
      .delete()
      .eq("id", body.id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "写真削除に失敗しました",
      },
      { status: 500 }
    );
  }
}