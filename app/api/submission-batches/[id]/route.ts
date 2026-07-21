import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  generateSubmissionDocuments,
  type SubmissionDocumentRow,
} from "@/lib/submission-center/document-generator";
import {
  transitionSubmissionBatchStatus,
  WorkflowTransitionError,
} from "@/lib/submission-center/workflow";
import {
  autoRegisterSubmissionBatch,
  AutoRegisterError,
} from "@/lib/submission-center/auto-register";
import { runAutoRegisterPreflight } from "@/lib/submission-center/auto-register-preflight";
import {
  DuplicateReviewError,
  filterRegisterableSubmissionRows,
  loadExcludedDuplicateRowIds,
  loadDuplicateReviewContexts,
  reviewSubmissionDuplicate,
  type DuplicateReviewDecision,
} from "@/lib/submission-center/duplicate-review";
import {
  certificateNumbersMatch,
  inspectWarrantyFulfillment,
} from "@/lib/submission-center/warranty-fulfillment";
import {
  isHeadquartersEmail,
  normalizeEmail,
} from "@/lib/auth/headquarters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET_NAME = "submission_center";

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

function workflowErrorStatus(error: WorkflowTransitionError) {
  switch (error.code) {
    case "INVALID_NEXT_STATUS":
    case "NOTE_REQUIRED":
    case "INVALID_CURRENT_STATUS":
    case "TRANSITION_NOT_ALLOWED":
      return 400;
    case "BATCH_NOT_FOUND":
      return 404;
    case "CONCURRENT_UPDATE":
    case "SOURCE_NOT_ALLOWED":
      return 409;
    default:
      return 500;
  }
}

function autoRegisterErrorStatus(error: AutoRegisterError) {
  switch (error.code) {
    case "BATCH_NOT_FOUND":
      return 404;
    case "PRECONDITION_FAILED":
    case "CUSTOMER_NOT_FOUND":
    case "CUSTOMER_EMAIL_REQUIRED":
      return 400;
    case "WORKFLOW_EVENT_INCONSISTENT":
    case "PARTIAL_REGISTRATION":
    case "CONTENT_MISMATCH":
    case "UNSUPPORTED_STATUS":
    case "CUSTOMER_AMBIGUOUS":
    case "CUSTOMER_CREATE_CONFLICT":
    case "CUSTOMER_CREATED_BUT_UNRESOLVED":
    case "NO_REGISTERABLE_ROWS":
      return 409;
    default:
      return 500;
  }
}

function duplicateReviewErrorStatus(error: DuplicateReviewError) {
  switch (error.code) {
    case "REVIEW_NOTE_REQUIRED":
    case "INVALID_DUPLICATE_DECISION":
      return 400;
    case "ROW_NOT_FOUND":
      return 404;
    case "ROW_BATCH_MISMATCH":
    case "DUPLICATE_REVIEW_NOT_REQUIRED":
    case "DUPLICATE_SOURCE_NOT_FOUND":
    case "DUPLICATE_REVIEW_CONCURRENT_UPDATE":
    case "DUPLICATE_REVIEW_COMPLETED_BUT_UNRESOLVED":
    case "NO_REGISTERABLE_ROWS":
      return 409;
    default:
      return 500;
  }
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

  if (isHeadquartersEmail(email)) {
    return {
      supabase,
      userId: user.id,
      actorLabel: email || "本部担当者",
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
          company_name,
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
    userId: user.id,
    actorLabel: partner.company_name || email || "提出元担当者",
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
            batch_id,
            sheet_name,
            row_number,
            row_type,
            customer_name,
            customer_name_kana,
            postal_code,
            address_full,
            phone,
            email,
            application_date,
            warranty_start_date,
            plan_code,
            water_heater_type,
            additional_equipment,
            additional_quantity,
            manufacturer,
            model_number,
            equipment_name,
            quantity,
            warranty_fee,
            row_hash,
            validation_status,
            duplicate_status,
            duplicate_of_row_id,
            import_status,
            created_at,
            updated_at
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

    const fulfillmentStatuses = [
      "warranty_created",
      "printed",
      "mailed",
      "completed",
    ];
    const autoRegisterStatuses = [
      "approved",
      "processing",
      "warranty_created",
    ];
    const [warrantyFulfillment, autoRegisterPreflight, duplicateReviews] = await Promise.all([
      actor.isHeadquarters && fulfillmentStatuses.includes(batch.status)
        ? inspectWarrantyFulfillment({
            supabase: actor.supabase,
            batchId,
          })
        : Promise.resolve(undefined),
      actor.isHeadquarters && autoRegisterStatuses.includes(batch.status)
        ? runAutoRegisterPreflight({
            supabase: actor.supabase,
            batchId,
          }).then((result) => result.preflight)
        : Promise.resolve(undefined),
      actor.isHeadquarters
        ? loadDuplicateReviewContexts({
            supabase: actor.supabase,
            batchId,
          })
        : Promise.resolve(undefined),
    ]);

    return NextResponse.json({
      success: true,
      can_update: actor.isHeadquarters,
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
      ...(duplicateReviews ? { duplicate_reviews: duplicateReviews } : {}),
      ...(warrantyFulfillment
        ? { warranty_fulfillment: warrantyFulfillment }
        : {}),
      ...(autoRegisterPreflight
        ? { auto_register_preflight: autoRegisterPreflight }
        : {}),
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedActor(request);

    if (!actor.isHeadquarters) {
      return NextResponse.json(
        { success: false, error: "本部担当者のみ状態を更新できます" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const batchId = id.trim();

    if (!batchId) {
      return NextResponse.json(
        { success: false, error: "受付IDがありません" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      action?: unknown;
      row_id?: unknown;
      status?: unknown;
      note?: unknown;
      print_confirmation?: {
        certificate_numbers?: unknown;
      };
    };
    let note = typeof body.note === "string" ? body.note.trim() : "";

    if (body.action !== undefined) {
      const decisions: Record<string, DuplicateReviewDecision> = {
        review_duplicate_as_separate: "separate",
        exclude_duplicate_row: "exclude",
      };
      const action = typeof body.action === "string" ? body.action : "";
      const decision = decisions[action];
      if (!decision) {
        throw new DuplicateReviewError(
          "INVALID_DUPLICATE_DECISION",
          "許可されていない重複判断です。"
        );
      }
      const rowId = typeof body.row_id === "string" ? body.row_id.trim() : "";
      if (!rowId) {
        throw new DuplicateReviewError("ROW_NOT_FOUND", "対象行IDがありません。");
      }

      const duplicateReview = await reviewSubmissionDuplicate({
        supabase: actor.supabase,
        batchId,
        rowId,
        decision,
        note,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
      });
      const [preflight, duplicateReviews] = await Promise.all([
        runAutoRegisterPreflight({
          supabase: actor.supabase,
          batchId,
        }).then((result) => result.preflight),
        loadDuplicateReviewContexts({
          supabase: actor.supabase,
          batchId,
        }),
      ]);

      return NextResponse.json({
        success: true,
        duplicate_review: duplicateReview,
        duplicate_reviews: duplicateReviews,
        auto_register_preflight: preflight,
      });
    }

    if (body.status === "printed") {
      const fulfillment = await inspectWarrantyFulfillment({
        supabase: actor.supabase,
        batchId,
        requireStatus: "warranty_created",
      });
      if (!fulfillment.ready || fulfillment.expected_count < 1) {
        return NextResponse.json(
          {
            success: false,
            error: "受付と保証書の整合性を確認できないため印刷済みにできません",
            warranty_fulfillment: fulfillment,
          },
          { status: 409 }
        );
      }

      const expectedNumbers = fulfillment.certificates.map(
        (certificate) => certificate.certificate_number
      );
      if (
        !certificateNumbersMatch(
          body.print_confirmation?.certificate_numbers,
          expectedNumbers
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "印刷確認された保証書番号がサーバー側の対象一覧と一致しません",
          },
          { status: 409 }
        );
      }

      const confirmationNote = [
        `印刷確認件数: ${expectedNumbers.length}件`,
        `対象保証書番号: ${expectedNumbers.join("、")}`,
        "本部担当者による手動確認",
      ].join("\n");
      note = note ? `${confirmationNote}\n${note}` : confirmationNote;
    }

    const transition = await transitionSubmissionBatchStatus({
      supabase: actor.supabase,
      batchId,
      nextStatus: body.status,
      actorUserId: actor.userId,
      actorLabel: actor.actorLabel,
      source:
        body.status === "printed" ? "print_fulfillment" : "manual",
      note,
    });

    return NextResponse.json({
      success: true,
      batch: transition.updatedBatch,
    });
  } catch (error) {
    if (error instanceof DuplicateReviewError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: duplicateReviewErrorStatus(error) }
      );
    }
    if (error instanceof WorkflowTransitionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: workflowErrorStatus(error) }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "状態の更新に失敗しました",
      },
      { status: 403 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedActor(request);

    if (!actor.isHeadquarters) {
      return NextResponse.json(
        { success: false, error: "本部担当者のみ自動登録できます" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const batchId = id.trim();
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: "受付IDがありません" },
        { status: 400 }
      );
    }

    const result = await autoRegisterSubmissionBatch({
      supabase: actor.supabase,
      batchId,
      actorUserId: actor.userId,
      actorLabel: actor.actorLabel,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof WorkflowTransitionError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          status_updated: error.statusUpdated,
        },
        { status: workflowErrorStatus(error) }
      );
    }
    if (error instanceof AutoRegisterError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: autoRegisterErrorStatus(error) }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "保証書・請求書の自動登録に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function POST(
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
          status,
          partners (
            company_name
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

    if (batchData.status !== "approved") {
      return NextResponse.json(
        {
          success: false,
          error: "受付完了の案件だけ保証書・請求書データを生成できます",
        },
        { status: 400 }
      );
    }

    const { data: rows, error: rowsError } = await actor.supabase
      .from("submission_rows")
      .select(
        `
          id,
          sheet_name,
          row_number,
          row_type,
          customer_name,
          customer_name_kana,
          postal_code,
          address_full,
          phone,
          email,
          application_date,
          warranty_start_date,
          plan_code,
          water_heater_type,
          manufacturer,
          model_number,
          equipment_name,
          quantity,
          additional_equipment,
          additional_model_number,
          additional_quantity,
          warranty_fee,
          validation_status,
          duplicate_status,
          import_status
        `
      )
      .eq("batch_id", batchId)
      .order("sheet_name", { ascending: true })
      .order("row_number", { ascending: true });

    if (rowsError) {
      throw new Error(rowsError.message);
    }

    const excludedRowIds = await loadExcludedDuplicateRowIds({
      supabase: actor.supabase,
      batchId,
    });
    const registerableRows = filterRegisterableSubmissionRows(
      (rows || []) as Array<SubmissionDocumentRow & { import_status: string | null }>,
      excludedRowIds
    );
    if (registerableRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          code: "NO_REGISTERABLE_ROWS",
          error: "登録対象行がありません。",
        },
        { status: 409 }
      );
    }

    const partnerRelation = batchData.partners;
    const partner = Array.isArray(partnerRelation)
      ? partnerRelation[0]
      : partnerRelation;
    const generation = generateSubmissionDocuments(
      {
        id: batchData.id,
        batch_no: batchData.batch_no,
        partner_id: batchData.partner_id,
        partner_name: partner?.company_name || "提出元未設定",
        target_month: batchData.target_month,
      },
      registerableRows
    );

    return NextResponse.json({
      success: true,
      generation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "保証書・請求書データの生成に失敗しました",
      },
      { status: 403 }
    );
  }
}
