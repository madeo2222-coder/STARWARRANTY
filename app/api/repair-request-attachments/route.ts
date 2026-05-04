import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET_NAME = "repair-attachments";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const formData = await request.formData();

    const requestId = formData.get("request_id") as string;
    const files = formData.getAll("files") as File[];

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "request_id がありません" },
        { status: 400 }
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "ファイルがありません" },
        { status: 400 }
      );
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${requestId}/${Date.now()}-${file.name}`;

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

      uploadedUrls.push(publicUrlData.publicUrl);

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
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "写真保存に失敗しました";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();

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

    if (!body.file_path) {
      return NextResponse.json(
        { success: false, error: "file_path がありません" },
        { status: 400 }
      );
    }

    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([body.file_path]);

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

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "写真削除に失敗しました";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}