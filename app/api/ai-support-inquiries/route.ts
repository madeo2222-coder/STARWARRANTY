import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InquiryBody = {
  source_type?: string | null;
  contact_type?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  email?: string | null;
  certificate_no?: string | null;
  product_category?: string | null;
  manufacturer?: string | null;
  model_no?: string | null;
  symptom_category?: string | null;
  symptom_detail?: string | null;
  error_code?: string | null;
  is_usable?: boolean | null;
};

type AnyRow = Record<string, any>;

const DANGER_KEYWORDS = [
  "水漏れ",
  "大量の水",
  "漏電",
  "感電",
  "焦げ臭い",
  "こげくさい",
  "煙",
  "火花",
  "火災",
  "ガス臭い",
  "ガスくさい",
  "異音が大きい",
  "ブレーカーが落ちる",
  "何度も落ちる",
];

const STAFF_HANDOFF_KEYWORDS = [
  "怒って",
  "クレーム",
  "補償",
  "損害賠償",
  "返金",
  "対象外",
  "無料",
  "有償",
  "責任",
  "メーカー責任",
  "施工不良",
  "至急",
  "今すぐ",
];

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

function buildInquiryNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return `AI-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function includesAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getUrgencyLevel(symptomText: string) {
  if (includesAnyKeyword(symptomText, DANGER_KEYWORDS)) {
    return "high";
  }

  if (includesAnyKeyword(symptomText, STAFF_HANDOFF_KEYWORDS)) {
    return "attention";
  }

  return "normal";
}

function buildAiSummary({
  productCategory,
  manufacturer,
  modelNo,
  symptomCategory,
  symptomDetail,
  errorCode,
  isDanger,
  requiresStaff,
}: {
  productCategory: string;
  manufacturer: string;
  modelNo: string;
  symptomCategory: string;
  symptomDetail: string;
  errorCode: string;
  isDanger: boolean;
  requiresStaff: boolean;
}) {
  const lines = [
    `製品カテゴリ：${productCategory || "-"}`,
    `メーカー：${manufacturer || "-"}`,
    `型番：${modelNo || "-"}`,
    `症状区分：${symptomCategory || "-"}`,
    `エラーコード：${errorCode || "-"}`,
    `故障内容：${symptomDetail || "-"}`,
    `危険ワード検知：${isDanger ? "あり" : "なし"}`,
    `スタッフ対応要否：${requiresStaff ? "必要" : "通常確認"}`,
  ];

  return lines.join("\n");
}

function buildFallbackResponse({
  productCategory,
  symptomDetail,
  isDanger,
  requiresStaff,
  faq,
}: {
  productCategory: string;
  symptomDetail: string;
  isDanger: boolean;
  requiresStaff: boolean;
  faq: AnyRow | null;
}) {
  if (isDanger) {
    return [
      "安全確認が必要な内容が含まれています。",
      "",
      "水漏れ・焦げ臭い・煙・漏電・ガス臭い・ブレーカーが何度も落ちる等がある場合は、無理に使用を続けず、可能な範囲で使用を中止してください。",
      "この内容はスタッフ確認が必要です。受付内容を確認し、担当者よりご連絡いたします。",
      "",
      "※保証対象・対象外の正式判断は、受付内容と保証情報を確認したうえで行います。",
    ].join("\n");
  }

  if (faq) {
    const answer = normalizeText(faq.answer);
    const steps = normalizeText(faq.troubleshooting_steps);
    const videoTitle = normalizeText(faq.video_title);
    const videoUrl = normalizeText(faq.video_url);

    return [
      answer || "該当するよくある質問を確認しました。",
      steps ? `\n確認手順：\n${steps}` : "",
      videoUrl
        ? `\n参考動画：${videoTitle || "確認動画"}\n${videoUrl}`
        : "",
      "",
      "上記を確認しても復旧しない場合は、修理受付へ進める可能性があります。",
      "正式な保証対象・対象外の判断は、受付内容と保証情報を確認したうえでスタッフが行います。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `${productCategory || "対象機器"}について、故障の可能性がある内容として受付しました。`,
    "",
    "まず以下を確認してください。",
    "1. リモコンや本体にエラーコードが表示されていないか",
    "2. ブレーカーや電源が落ちていないか",
    "3. 本体まわりに水漏れ・焦げ臭い・異音などがないか",
    "4. 型番・メーカー名が分かる写真を準備できるか",
    "5. 故障箇所やエラー表示の写真を準備できるか",
    "",
    `今回の症状：${symptomDetail}`,
    "",
    requiresStaff
      ? "内容確認のため、スタッフ対応が必要な可能性があります。"
      : "復旧しない場合は、修理受付フォームへ進んでください。",
    "",
    "※保証対象・対象外の正式判断は、受付内容と保証情報を確認したうえで行います。",
  ].join("\n");
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

    const status = normalizeText(searchParams.get("status"));
    const requiresStaff = normalizeText(searchParams.get("requires_staff"));

    let query = supabase
      .from("ai_support_inquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (status) {
      query = query.eq("staff_status", status);
    }

    if (requiresStaff === "true") {
      query = query.eq("requires_staff", true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      inquiries: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "AI問い合わせ一覧の取得に失敗しました",
      },
      { status: 403 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InquiryBody;
    const supabase = getAdminClient();

    const symptomDetail = normalizeText(body.symptom_detail);

    if (!symptomDetail) {
      return NextResponse.json(
        { success: false, error: "症状・問い合わせ内容を入力してください" },
        { status: 400 }
      );
    }

    const inquiryNo = buildInquiryNo();

    const productCategory = normalizeText(body.product_category);
    const manufacturer = normalizeText(body.manufacturer);
    const modelNo = normalizeText(body.model_no);
    const symptomCategory = normalizeText(body.symptom_category);
    const errorCode = normalizeText(body.error_code);

    const fullText = [
      productCategory,
      manufacturer,
      modelNo,
      symptomCategory,
      symptomDetail,
      errorCode,
    ].join(" ");

    const isDanger = includesAnyKeyword(fullText, DANGER_KEYWORDS);
    const requiresStaff =
      isDanger || includesAnyKeyword(fullText, STAFF_HANDOFF_KEYWORDS);

    const urgencyLevel = getUrgencyLevel(fullText);

    const { data: faqRows, error: faqError } = await supabase
      .from("ai_support_faqs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(50);

    if (faqError) {
      throw new Error(faqError.message);
    }

    const faqs = (faqRows || []) as AnyRow[];

    const matchedFaq =
      faqs.find((faq) => {
        const faqProduct = normalizeText(faq.product_category);
        const faqSymptom = normalizeText(faq.symptom_category);
        const question = normalizeText(faq.question);

        const productMatched =
          !faqProduct || !productCategory || productCategory.includes(faqProduct) || faqProduct.includes(productCategory);

        const symptomMatched =
          (faqSymptom && fullText.includes(faqSymptom)) ||
          (question && fullText.includes(question));

        return productMatched && symptomMatched;
      }) ||
      faqs.find((faq) => {
        const faqProduct = normalizeText(faq.product_category);
        return (
          faqProduct &&
          productCategory &&
          (productCategory.includes(faqProduct) ||
            faqProduct.includes(productCategory))
        );
      }) ||
      null;

    const aiResponse = buildFallbackResponse({
      productCategory,
      symptomDetail,
      isDanger,
      requiresStaff,
      faq: matchedFaq,
    });

    const aiSummary = buildAiSummary({
      productCategory,
      manufacturer,
      modelNo,
      symptomCategory,
      symptomDetail,
      errorCode,
      isDanger,
      requiresStaff,
    });

    const { data: inserted, error: insertError } = await supabase
      .from("ai_support_inquiries")
      .insert({
        inquiry_no: inquiryNo,
        source_type: normalizeText(body.source_type) || "web",
        contact_type: normalizeText(body.contact_type) || "customer",
        customer_name: normalizeText(body.customer_name) || null,
        phone: normalizeText(body.phone) || null,
        email: normalizeText(body.email) || null,
        certificate_no: normalizeText(body.certificate_no) || null,
        product_category: productCategory || null,
        manufacturer: manufacturer || null,
        model_no: modelNo || null,
        symptom_category: symptomCategory || null,
        symptom_detail: symptomDetail,
        error_code: errorCode || null,
        is_usable:
          typeof body.is_usable === "boolean" ? body.is_usable : null,
        urgency_level: urgencyLevel,
        requires_staff: requiresStaff,
        staff_status: requiresStaff ? "needs_staff" : "new",
        ai_status: "answered",
        ai_summary: aiSummary,
        guided_video_title: matchedFaq?.video_title || null,
        guided_video_url: matchedFaq?.video_url || null,
        guided_faq_id: matchedFaq?.id || null,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message || "問い合わせ保存に失敗しました");
    }

    const inquiry = inserted as AnyRow;

    await supabase.from("ai_support_messages").insert([
      {
        inquiry_id: inquiry.id,
        sender_type: "user",
        message: symptomDetail,
      },
      {
        inquiry_id: inquiry.id,
        sender_type: "assistant",
        message: aiResponse,
      },
    ]);

    return NextResponse.json({
      success: true,
      inquiry,
      ai_response: aiResponse,
      requires_staff: requiresStaff,
      urgency_level: urgencyLevel,
    });
  } catch (error) {
    console.error("ai support inquiry POST error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "AI一次受付の送信に失敗しました",
      },
      { status: 500 }
    );
  }
}