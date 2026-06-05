import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HeadquartersSettings = {
  id: string;
  logo_url: string | null;
};

const LOGO_BUCKET = "agency-logos";
const MAX_LOGO_SIZE_MB = 5;

const HEADQUARTERS_ADMIN_EMAILS = [
  "madeo8888@gmail.com",
  "y.shimizu@st-w.jp",
  "s.hidaka@st-w.jp",
  "n.fukuda@st-w.jp",
  "t.hiraga@st-w.jp",
];

const DEFAULT_HEADQUARTERS_SETTINGS = {
  company_name: "株式会社スター・ワランティ",
  representative_name: null,
  email: null,
  phone: "0120-992-857",
  postal_code: null,
  address: null,
  note: null,
  logo_url: null,
};

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

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function requireHeadquartersAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("ログイン情報が取得できませんでした");
  }

  const supabase = getAdminClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("ログイン情報が取得できませんでした");
  }

  const email = normalizeEmail(user.email);

  if (!HEADQUARTERS_ADMIN_EMAILS.includes(email)) {
    throw new Error("本部最高権限アカウントのみ更新できます");
  }

  return {
    supabase,
    user,
    email,
  };
}

async function getOrCreateHeadquartersSettings(supabase: any) {
  const { data: rows, error: selectError } = await supabase
    .from("headquarters_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectError) {
    throw new Error(selectError.message);
  }

  const existingSettings = (rows?.[0] ?? null) as HeadquartersSettings | null;

  if (existingSettings?.id) {
    return existingSettings;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("headquarters_settings")
    .insert(DEFAULT_HEADQUARTERS_SETTINGS)
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(
      insertError?.message || "本部設定の初期作成に失敗しました"
    );
  }

  return inserted as HeadquartersSettings;
}

export async function POST(request: Request) {
  try {
    const { supabase, email } = await requireHeadquartersAdmin(request);
    const settings = await getOrCreateHeadquartersSettings(supabase);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("ロゴ画像が選択されていません");
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("PNG / JPG / WEBP の画像を選択してください");
    }

    const maxBytes = MAX_LOGO_SIZE_MB * 1024 * 1024;

    if (file.size > maxBytes) {
      throw new Error(`画像サイズは ${MAX_LOGO_SIZE_MB}MB 以下にしてください`);
    }

    const safeFileName = sanitizeFileName(file.name);
    const filePath = `headquarters/${Date.now()}-${safeFileName}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(filePath);

    const { data: updated, error: updateError } = await supabase
      .from("headquarters_settings")
      .update({
        logo_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message || "本部ロゴの更新に失敗しました");
    }

    return NextResponse.json({
      success: true,
      email,
      logo_url: publicUrl,
      settings: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "本部ロゴ更新に失敗しました",
      },
      { status: 403 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, email } = await requireHeadquartersAdmin(request);
    const settings = await getOrCreateHeadquartersSettings(supabase);

    const { data: updated, error } = await supabase
      .from("headquarters_settings")
      .update({
        logo_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)
      .select("*")
      .single();

    if (error || !updated) {
      throw new Error(error?.message || "本部ロゴの削除に失敗しました");
    }

    return NextResponse.json({
      success: true,
      email,
      logo_url: null,
      settings: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "本部ロゴ削除に失敗しました",
      },
      { status: 403 }
    );
  }
}