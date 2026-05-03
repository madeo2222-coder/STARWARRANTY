import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      const fileName = `${requestId}/${Date.now()}.${fileExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from("repair-attachments")
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
        .from("repair-attachments")
        .getPublicUrl(fileName);

      uploadedUrls.push(publicUrlData.publicUrl);

      // DB登録
      await supabase.from("repair_request_attachments").insert({
        request_id: requestId,
        file_url: publicUrlData.publicUrl,
      });
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}