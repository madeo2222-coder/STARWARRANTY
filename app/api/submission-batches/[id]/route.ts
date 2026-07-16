import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET_NAME = "submission_center";

const HEADQUARTERS_ADMIN_EMAILS = [
  "madeo8888@gmail.com",
  "y.shimizu@st-w.jp",
  "s.hidaka@st-w.jp",
  "n.fukuda@st-w.jp",
  "t.hiraga@st-w.jp",
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

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

async function requireAuthenticatedActor(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("ログイン情報が取得できませんでした");
  }

  const supabase = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error("ログイン情報が取得できませんでした");
  }

  const email = normalizeEmail(user.email);

  if (HEADQUARTERS_ADMIN_EMAILS.includes(email)) {
    return {
      supabase,
      isHeadquarters: true,
      partnerId: null,
    };
  }

  const { data: partnerUser, error: partnerUserError } = await supabase
    .from("partner_users")
    .select(
      `
        partner_id,
        is_active,
        partners (
          id,
          status
        )
      `
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (partnerUserError) {
    throw new Error(partnerUserError.message);
  }

  const partnerRelation = partnerUser?.partners;
  const partner = Array.isArray(partnerRelation)
    ? partnerRelation[0]
    : partnerRelation;

  if (!partnerUser?.partner_id || !partner || partner.status !== "active") {
    throw new Error("提出データを閲覧できるアカウントではありません");
  }

  return {
    supabase,
    isHeadquarters: false,
    partnerId: partnerUser.partner_id,
  };
}

type BatchRelation = {
  id: string;
  batch_no: string;
  partner_id: string;
  target_month: string;
  source_type: string;
  status: string;
  total_count: number;
  success_count: number;
  error_count: number;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  revision_no: number;
  parse_status: string | null;
  duplicate_status: string | null;
  parsed_at: string | null;
  parse_error: string | null;
  duplicate_of_batch_id: string | null;
  partners:
    | {
        id: string;
        company_name: string;
        partner_type: string;
      }
    | {
        id: string;
        company_name: string;
        partner_type: string;
      }[]
    | null;
  submission_batch_files:
    | {
        id: string;
        original_filename: string;
        storage_path: string;
        content_type: string | null;
        size_bytes: number;
        uploaded_at: string;
      }[]
    | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedActor(request);
    const { id } = await params;
    const batchId = id.trim();

    if (!batchId) {
      return NextResponse.json(
        { success: false, error: "受付IDがありません" },
        { status: 400 }
      );
    }

    let batchQuery = actor.supabase
      .from("submission_batches")
      .select(
        `
          id,
          batch_no,
          partner_id,
          target_month,
          source_type,
          status,
          total_count,
          success_count,
          error_count,
          submitted_at,
          reviewed_at,
          review_note,
          revision_no,
          parse_status,
          duplicate_status,
          parsed_at,
          parse_error,
          duplicate_of_batch_id,
          partners (
            id,
            company_name,
            partner_type
          ),
          submission_batch_files (
            id,
            original_filename,
            storage_path,
            content_type,
            size_bytes,
            uploaded_at
          )
        `
      )
      .eq("id", batchId);

    if (!actor.isHeadquarters) {
      if (!actor.partnerId) {
        throw new Error("所属する提出元を確認できませんでした");
      }

      batchQuery = batchQuery.eq("partner_id", actor.partnerId);
    }

    const { data: batchData, error: batchError } =
      await batchQuery.maybeSingle();

    if (batchError) {
      throw new Error(batchError.message);
    }

    if (!batchData) {
      return NextResponse.json(
        { success: false, error: "受付情報が見つかりません" },
        { status: 404 }
      );
    }

    const batch = batchData as unknown as BatchRelation;

    const [rowsResult, eventsResult] = await Promise.all([
      actor.supabase
        .from("submission_rows")
        .select(
          `
            id,
            sheet_name,
            row_number,
            customer_name,
            address_full,
            warranty_start_date,
            plan_code,
            manufacturer,
            model_number,
            warranty_fee,
            validation_status,
            duplicate_status
          `
        )
        .eq("batch_id", batchId)
        .order("sheet_name", { ascending: true })
        .order("row_number", { ascending: true }),
      actor.supabase
        .from("submission_events")
        .select(
          `
            id,
            event_type,
            actor_label,
            previous_status,
            next_status,
            note,
            created_at
          `
        )
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false }),
    ]);

    if (rowsResult.error) {
      throw new Error(rowsResult.error.message);
    }

    if (eventsResult.error) {
      throw new Error(eventsResult.error.message);
    }

    const partnerRelation = batch.partners;
    const partner = Array.isArray(partnerRelation)
      ? partnerRelation[0]
      : partnerRelation;

    const files = await Promise.all(
      (batch.submission_batch_files || []).map(async (file) => {
        const { data, error } = await actor.supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(file.storage_path, 60 * 10);

        return {
          id: file.id,
          original_filename: file.original_filename,
          content_type: file.content_type,
          size_bytes: file.size_bytes,
          uploaded_at: file.uploaded_at,
          download_url: error ? null : data.signedUrl,
        };
      })
    );

    return NextResponse.json({
      success: true,
      batch: {
        id: batch.id,
        batch_no: batch.batch_no,
        partner_id: batch.partner_id,
        partner_name: partner?.company_name || "提出元未設定",
        partner_type: partner?.partner_type || null,
        target_month: batch.target_month,
        source_type: batch.source_type,
        status: batch.status,
        submitted_at: batch.submitted_at,
        reviewed_at: batch.reviewed_at,
        review_note: batch.review_note,
        revision_no: batch.revision_no,
        parse_status: batch.parse_status || "pending",
        duplicate_status: batch.duplicate_status || "unchecked",
        parsed_at: batch.parsed_at,
        parse_error: batch.parse_error,
        duplicate_of_batch_id: batch.duplicate_of_batch_id,
        total_count: batch.total_count,
        success_count: batch.success_count,
        error_count: batch.error_count,
        files,
      },
      rows: rowsResult.data || [],
      events: eventsResult.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "受付詳細の取得に失敗しました",
      },
      { status: 403 }
    );
  }
}
