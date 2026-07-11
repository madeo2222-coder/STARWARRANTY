import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConvertRepairBody = {
  inquiry_id?: string | null;
};

type AnyRow = Record<string, unknown>;

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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function buildRequestNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return `RR-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
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

export async function POST(request: Request) {
  try {
    const { supabase } = await requireLoggedInUser(request);
    const body = (await request.json()) as ConvertRepairBody;

    const inquiryId = normalizeText(body.inquiry_id);

    if (!inquiryId) {
      return NextResponse.json(
        {
          success: false,
          error: "AI問い合わせIDがありません",
        },
        { status: 400 }
      );
    }

    const { data: inquiryData, error: inquiryError } = await supabase
      .from("ai_support_inquiries")
      .select("*")
      .eq("id", inquiryId)
      .single();

    if (inquiryError || !inquiryData) {
      return NextResponse.json(
        {
          success: false,
          error:
            inquiryError?.message ||
            "対象のAI問い合わせが見つかりません",
        },
        { status: 404 }
      );
    }

    const inquiry = inquiryData as AnyRow;

    const convertedRepairRequestId = normalizeText(
      inquiry.converted_repair_request_id
    );

    const convertedRepairRequestNo = normalizeText(
      inquiry.converted_repair_request_no
    );

    if (convertedRepairRequestId) {
      return NextResponse.json({
        success: true,
        already_converted: true,
        repair_request: {
          id: convertedRepairRequestId,
          request_no: convertedRepairRequestNo,
        },
      });
    }

    const customerName = normalizeText(inquiry.customer_name);
    const phone = normalizeText(inquiry.phone);
    const email = normalizeText(inquiry.email);
    const certificateNo = normalizeText(inquiry.certificate_no);
    const productName = normalizeText(inquiry.product_category);
    const manufacturer = normalizeText(inquiry.manufacturer);
    const modelNo = normalizeText(inquiry.model_no);
    const symptomCategory = normalizeText(inquiry.symptom_category);
    const symptomDetail = normalizeText(inquiry.symptom_detail);
    const errorCode = normalizeText(inquiry.error_code);
    const aiSummary = normalizeText(inquiry.ai_summary);
    const staffMemo = normalizeText(inquiry.memo);

    if (!customerName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "お名前・会社名が未入力のため、修理受付へ変換できません",
        },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error:
            "電話番号が未入力のため、修理受付へ変換できません",
        },
        { status: 400 }
      );
    }

    if (!productName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "対象機器が未入力のため、修理受付へ変換できません",
        },
        { status: 400 }
      );
    }

    if (!symptomDetail) {
      return NextResponse.json(
        {
          success: false,
          error:
            "症状・問い合わせ内容が未入力のため、修理受付へ変換できません",
        },
        { status: 400 }
      );
    }

    let certificateId: string | null = null;
    let agencyName: string | null = null;

    if (certificateNo) {
      const { data: certificateData, error: certificateError } =
        await supabase
          .from("warranty_certificates")
          .select("*")
          .eq("certificate_no", certificateNo)
          .maybeSingle();

      if (certificateError) {
        throw new Error(
          `保証書情報の取得に失敗しました: ${certificateError.message}`
        );
      }

      if (certificateData) {
        const certificate = certificateData as AnyRow;

        certificateId = normalizeText(certificate.id) || null;
        agencyName =
          normalizeText(certificate.seller_name) ||
          normalizeText(certificate.agency_name) ||
          null;
      }
    }

    const requestNo = buildRequestNo();

    const combinedSymptomDetail = [
      symptomDetail,
      aiSummary ? `\n\n【AI一次受付要約】\n${aiSummary}` : "",
      staffMemo ? `\n\n【スタッフメモ】\n${staffMemo}` : "",
    ]
      .filter(Boolean)
      .join("");

    const { data: insertedRepair, error: repairInsertError } =
      await supabase
        .from("repair_requests")
        .insert({
          request_no: requestNo,
          certificate_no: certificateNo || null,
          certificate_id: certificateId,
          customer_name: customerName,
          customer_name_kana: null,
          phone,
          email: email || null,
          postal_code: null,
          address: null,
          product_name: productName,
          manufacturer: manufacturer || null,
          model_no: modelNo || null,
          installation_place: null,
          failure_date: null,
          symptom_category: symptomCategory || null,
          symptom_detail: combinedSymptomDetail,
          error_code: errorCode || null,
          is_usable:
            typeof inquiry.is_usable === "boolean"
              ? inquiry.is_usable
              : null,
          status: "received",
          agency_name: agencyName,
        })
        .select("id, request_no")
        .single();

    if (repairInsertError || !insertedRepair) {
      throw new Error(
        repairInsertError?.message ||
          "修理受付の登録に失敗しました"
      );
    }

    const { data: updatedInquiry, error: inquiryUpdateError } =
      await supabase
        .from("ai_support_inquiries")
        .update({
          converted_repair_request_id: insertedRepair.id,
          converted_repair_request_no: insertedRepair.request_no,
          staff_status: "in_progress",
        })
        .eq("id", inquiryId)
        .select("*")
        .single();

    if (inquiryUpdateError || !updatedInquiry) {
      await supabase
        .from("repair_requests")
        .delete()
        .eq("id", insertedRepair.id);

      throw new Error(
        inquiryUpdateError?.message ||
          "AI問い合わせへの変換情報保存に失敗しました"
      );
    }

    return NextResponse.json({
      success: true,
      already_converted: false,
      repair_request: insertedRepair,
      inquiry: updatedInquiry,
    });
  } catch (error) {
    console.error("AI support convert repair error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "修理受付への変換に失敗しました",
      },
      { status: 500 }
    );
  }
}