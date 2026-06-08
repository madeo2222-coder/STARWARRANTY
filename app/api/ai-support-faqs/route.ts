import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FaqBody = {
  id?: string;
  product_category?: string | null;
  manufacturer?: string | null;
  symptom_category?: string | null;
  question?: string | null;
  answer?: string | null;
  troubleshooting_steps?: string | null;
  video_title?: string | null;
  video_url?: string | null;
  danger_keywords?: string | null;
  handoff_keywords?: string | null;
  requires_staff?: boolean | null;
  is_active?: boolean | null;
  sort_order?: number | null;
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

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizeSortOrder(value: number | null | undefined) {
  if (typeof value !== "number") return 100;
  if (!Number.isFinite(value)) return 100;
  return Math.trunc(value);
}

async function requireLoggedInUser(request: Request) {
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

  return { supabase, user };
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireLoggedInUser(request);
    const { searchParams } = new URL(request.url);

    const productCategory = normalizeText(searchParams.get("product_category"));
    const activeOnly = normalizeText(searchParams.get("active_only"));

    let query = supabase
      .from("ai_support_faqs")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (productCategory) {
      query = query.eq("product_category", productCategory);
    }

    if (activeOnly === "true") {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      faqs: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "FAQ一覧の取得に失敗しました",
      },
      { status: 403 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireLoggedInUser(request);
    const body = (await request.json()) as FaqBody;

    const productCategory = normalizeText(body.product_category);
    const question = normalizeText(body.question);
    const answer = normalizeText(body.answer);

    if (!productCategory) {
      throw new Error("製品カテゴリを入力してください");
    }

    if (!question) {
      throw new Error("質問を入力してください");
    }

    if (!answer) {
      throw new Error("回答を入力してください");
    }

    const { data, error } = await supabase
      .from("ai_support_faqs")
      .insert({
        product_category: productCategory,
        manufacturer: normalizeText(body.manufacturer) || null,
        symptom_category: normalizeText(body.symptom_category) || null,
        question,
        answer,
        troubleshooting_steps:
          normalizeText(body.troubleshooting_steps) || null,
        video_title: normalizeText(body.video_title) || null,
        video_url: normalizeText(body.video_url) || null,
        danger_keywords: normalizeText(body.danger_keywords) || null,
        handoff_keywords: normalizeText(body.handoff_keywords) || null,
        requires_staff: Boolean(body.requires_staff),
        is_active: body.is_active === false ? false : true,
        sort_order: normalizeSortOrder(body.sort_order),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "FAQの登録に失敗しました");
    }

    return NextResponse.json({
      success: true,
      faq: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "FAQの登録に失敗しました",
      },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase } = await requireLoggedInUser(request);
    const body = (await request.json()) as FaqBody;

    const id = normalizeText(body.id);
    const productCategory = normalizeText(body.product_category);
    const question = normalizeText(body.question);
    const answer = normalizeText(body.answer);

    if (!id) {
      throw new Error("FAQ IDがありません");
    }

    if (!productCategory) {
      throw new Error("製品カテゴリを入力してください");
    }

    if (!question) {
      throw new Error("質問を入力してください");
    }

    if (!answer) {
      throw new Error("回答を入力してください");
    }

    const { data, error } = await supabase
      .from("ai_support_faqs")
      .update({
        product_category: productCategory,
        manufacturer: normalizeText(body.manufacturer) || null,
        symptom_category: normalizeText(body.symptom_category) || null,
        question,
        answer,
        troubleshooting_steps:
          normalizeText(body.troubleshooting_steps) || null,
        video_title: normalizeText(body.video_title) || null,
        video_url: normalizeText(body.video_url) || null,
        danger_keywords: normalizeText(body.danger_keywords) || null,
        handoff_keywords: normalizeText(body.handoff_keywords) || null,
        requires_staff: Boolean(body.requires_staff),
        is_active: body.is_active === false ? false : true,
        sort_order: normalizeSortOrder(body.sort_order),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "FAQの更新に失敗しました");
    }

    return NextResponse.json({
      success: true,
      faq: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "FAQの更新に失敗しました",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase } = await requireLoggedInUser(request);
    const { searchParams } = new URL(request.url);

    const id = normalizeText(searchParams.get("id"));

    if (!id) {
      throw new Error("FAQ IDがありません");
    }

    const { error } = await supabase
      .from("ai_support_faqs")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "FAQの削除に失敗しました",
      },
      { status: 400 }
    );
  }
}