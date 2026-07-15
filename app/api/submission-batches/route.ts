import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  parseSubmissionExcel,
  parsedRowsToSubmissionRowInserts,
} from "@/lib/submission-center/excel/parser";

import type {
  DuplicateComparisonRow,
  SubmissionRowInsert,
} from "@/lib/submission-center/excel/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET_NAME = "submission_center";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const HEADQUARTERS_ADMIN_EMAILS = [
  "madeo8888@gmail.com",
  "y.shimizu@st-w.jp",
  "s.hidaka@st-w.jp",
  "n.fukuda@st-w.jp",
  "t.hiraga@st-w.jp",
];

const ALLOWED_EXTENSIONS = ["xlsx", "xls", "csv"];

const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/octet-stream",
];

type ProcessingStage =
  | "initial"
  | "authentication"
  | "form_validation"
  | "file_hash"
  | "duplicate_batch_check"
  | "batch_created"
  | "storage_uploaded"
  | "file_record_created"
  | "submission_events_created"
  | "parsing_started"
  | "comparison_rows_loaded"
  | "parser_executed"
  | "rows_inserting"
  | "rows_inserted"
  | "batch_updated"
  | "parse_event_created"
  | "completed";

type AdminSupabaseClient = ReturnType<typeof getAdminClient>;

type AuthenticatedActor = {
  supabase: AdminSupabaseClient;
  userId: string;
  email: string;
  isHeadquarters: boolean;
  partnerId: string | null;
  actorLabel: string;
};

type SubmissionBatchRow = {
  id: string;
  batch_no: string;
  partner_id: string;
  target_month: string;
  source_type: string;
  status: string;
  total_count: number;
  success_count: number;
  error_count: number;
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  revision_no: number;
  created_at: string;
  updated_at: string;

  file_hash?: string | null;
  parse_status?: string | null;
  duplicate_status?: string | null;
  parsed_at?: string | null;
  parse_error?: string | null;
  duplicate_of_batch_id?: string | null;

  partners?:
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

  submission_batch_files?:
    | {
        id: string;
        original_filename: string;
        content_type: string | null;
        size_bytes: number;
        uploaded_at: string;
      }[]
    | null;
};

type ExistingSubmissionRow = {
  id: string;
  customer_name: string | null;
  postal_code: string | null;
  address_full: string | null;
  warranty_start_date: string | null;
  equipment_name: string | null;
  water_heater_type: string | null;
  model_number: string | null;
  row_hash: string | null;
};

type ExistingBatchIdRow = {
  id: string;
};

type DuplicateBatchRow = {
  id: string;
  batch_no: string;
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

function isHeadquartersAdminEmail(email: string | null | undefined) {
  return HEADQUARTERS_ADMIN_EMAILS.includes(normalizeEmail(email));
}

function getFileExtension(filename: string) {
  const lastDotIndex = filename.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return filename.slice(lastDotIndex + 1).trim().toLowerCase();
}

function getSafeStorageFilename(originalFilename: string) {
  const extension = getFileExtension(originalFilename);
  const randomName = crypto.randomUUID();

  return extension ? `${randomName}.${extension}` : randomName;
}

function createFileHash(fileBuffer: Uint8Array) {
  return createHash("sha256").update(fileBuffer).digest("hex");
}

function isUuid(value: string | null) {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "不明なエラーが発生しました";
}

function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack || null : null;
}

function logStage(
  stage: ProcessingStage,
  values?: Record<string, unknown>
) {
  console.log("[submission-batches]", {
    stage,
    ...values,
  });
}

function normalizeTargetMonth(value: FormDataEntryValue | null) {
  const rawValue = String(value || "").trim();

  if (!/^\d{4}-\d{2}$/.test(rawValue)) {
    throw new Error("対象月を正しく選択してください");
  }

  const [yearText, monthText] = rawValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    throw new Error("対象月が正しくありません");
  }

  return {
    monthValue: rawValue,
    databaseDate: `${rawValue}-01`,
  };
}

function validateUploadFile(file: File) {
  if (!file.name.trim()) {
    throw new Error("ファイル名が取得できませんでした");
  }

  const extension = getFileExtension(file.name);

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error("Excel（.xlsx / .xls）またはCSVを選択してください");
  }

  if (file.size <= 0) {
    throw new Error("空のファイルは提出できません");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("ファイルサイズは10MB以下にしてください");
  }

  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("選択されたファイル形式には対応していません");
  }
}

function getPartnerFromRelation(
  relation: SubmissionBatchRow["partners"]
): {
  id: string;
  company_name: string;
  partner_type: string;
} | null {
  if (!relation) {
    return null;
  }

  if (Array.isArray(relation)) {
    return relation[0] || null;
  }

  return relation;
}

async function requireAuthenticatedActor(
  request: Request
): Promise<AuthenticatedActor> {
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
  const isHeadquarters = isHeadquartersAdminEmail(email);

  if (isHeadquarters) {
    return {
      supabase,
      userId: user.id,
      email,
      isHeadquarters: true,
      partnerId: null,
      actorLabel: email || "本部担当者",
    };
  }

  const { data: partnerUser, error: partnerUserError } = await supabase
    .from("partner_users")
    .select(
      `
        partner_id,
        partner_role,
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

  if (!partnerUser?.partner_id) {
    throw new Error("提出可能な取引先アカウントに紐付いていません");
  }

  const partnerRelation = partnerUser.partners;
  const partner = Array.isArray(partnerRelation)
    ? partnerRelation[0]
    : partnerRelation;

  if (!partner || partner.status !== "active") {
    throw new Error("この取引先アカウントは現在利用できません");
  }

  return {
    supabase,
    userId: user.id,
    email,
    isHeadquarters: false,
    partnerId: partnerUser.partner_id,
    actorLabel: partner.company_name || email || "取引先担当者",
  };
}

async function resolveSubmissionPartnerId(
  actor: AuthenticatedActor,
  requestedPartnerId: FormDataEntryValue | null
) {
  if (!actor.isHeadquarters) {
    if (!actor.partnerId) {
      throw new Error("所属する取引先を確認できませんでした");
    }

    return actor.partnerId;
  }

  const partnerId = String(requestedPartnerId || "").trim();

  if (!partnerId) {
    throw new Error("提出元の代理店・施工店を選択してください");
  }

  const { data: partner, error } = await actor.supabase
    .from("partners")
    .select("id, company_name, status")
    .eq("id", partnerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!partner) {
    throw new Error("提出元の代理店・施工店が見つかりません");
  }

  if (partner.status !== "active") {
    throw new Error("選択した取引先は現在利用できません");
  }

  return partner.id;
}

async function findDuplicateBatch(
  supabase: AdminSupabaseClient,
  partnerId: string,
  fileHash: string
): Promise<DuplicateBatchRow | null> {
  const { data, error } = await supabase
    .from("submission_batches")
    .select("id, batch_no")
    .eq("partner_id", partnerId)
    .eq("file_hash", fileHash)
    .order("submitted_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DuplicateBatchRow | null;
}

async function loadDuplicateComparisonRows(
  supabase: AdminSupabaseClient,
  partnerId: string,
  currentBatchId: string
): Promise<DuplicateComparisonRow[]> {
  const { data: batchData, error: batchError } = await supabase
    .from("submission_batches")
    .select("id")
    .eq("partner_id", partnerId)
    .neq("id", currentBatchId)
    .order("submitted_at", {
      ascending: false,
    })
    .limit(1000);

  if (batchError) {
    throw new Error(batchError.message);
  }

  const batchIds = ((batchData || []) as ExistingBatchIdRow[]).map(
    (batch) => batch.id
  );

  if (batchIds.length === 0) {
    return [];
  }

  const { data: rowData, error: rowError } = await supabase
    .from("submission_rows")
    .select(
      `
        id,
        customer_name,
        postal_code,
        address_full,
        warranty_start_date,
        equipment_name,
        water_heater_type,
        model_number,
        row_hash
      `
    )
    .in("batch_id", batchIds)
    .limit(10000);

  if (rowError) {
    throw new Error(rowError.message);
  }

  return ((rowData || []) as ExistingSubmissionRow[]).map((row) => ({
    id: row.id,
    partnerId,
    customerName: row.customer_name,
    postalCode: row.postal_code,
    address: row.address_full,
    warrantyStartDate: row.warranty_start_date,
    productName: row.equipment_name || row.water_heater_type,
    modelNumber: row.model_number,
    rowHash: row.row_hash,
  }));
}

function sanitizeSubmissionRowInserts(
  inserts: SubmissionRowInsert[]
): SubmissionRowInsert[] {
  return inserts.map((insert) => ({
    ...insert,
    duplicate_of_row_id: isUuid(insert.duplicate_of_row_id)
      ? insert.duplicate_of_row_id
      : null,
  }));
}

function resolveBatchParseStatus(values: {
  errorCount: number;
  warningCount: number;
  workbookWarningCount: number;
}) {
  if (values.errorCount > 0) {
    return "warning";
  }

  if (values.warningCount > 0 || values.workbookWarningCount > 0) {
    return "warning";
  }

  return "parsed";
}

function resolveBatchDuplicateStatus(values: {
  duplicateBatchId: string | null;
  duplicateCount: number;
  needsReviewCount: number;
}) {
  if (values.duplicateBatchId || values.duplicateCount > 0) {
    return "duplicate";
  }

  if (values.needsReviewCount > 0) {
    return "needs_review";
  }

  return "unique";
}

async function recordSubmissionEvent(
  supabase: AdminSupabaseClient,
  values: {
    batchId: string;
    eventType: string;
    actorUserId: string;
    actorLabel: string;
    previousStatus: string | null;
    nextStatus: string | null;
    note: string | null;
  }
) {
  const { error } = await supabase.from("submission_events").insert({
    batch_id: values.batchId,
    event_type: values.eventType,
    actor_user_id: values.actorUserId,
    actor_label: values.actorLabel,
    previous_status: values.previousStatus,
    next_status: values.nextStatus,
    note: values.note,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function updateBatchParseFailure(
  supabase: AdminSupabaseClient,
  values: {
    batchId: string;
    stage: ProcessingStage;
    errorMessage: string;
    duplicateBatchId: string | null;
  }
) {
  const fullErrorMessage = [
    `stage=${values.stage}`,
    values.errorMessage,
  ].join(" / ");

  const { error } = await supabase
    .from("submission_batches")
    .update({
      parse_status: "failed",
      parse_error: fullErrorMessage.slice(0, 5000),
      parsed_at: new Date().toISOString(),
      duplicate_status: values.duplicateBatchId
        ? "duplicate"
        : "unchecked",
      duplicate_of_batch_id: values.duplicateBatchId,
    })
    .eq("id", values.batchId);

  if (error) {
    console.error("[submission-batches] parse failure update failed", {
      batchId: values.batchId,
      stage: values.stage,
      error: error.message,
    });
  }
}

async function tryRecordParseFailedEvent(
  supabase: AdminSupabaseClient,
  values: {
    batchId: string;
    actorUserId: string;
    actorLabel: string;
    stage: ProcessingStage;
    errorMessage: string;
  }
) {
  try {
    await recordSubmissionEvent(supabase, {
      batchId: values.batchId,
      eventType: "parse_failed",
      actorUserId: values.actorUserId,
      actorLabel: values.actorLabel,
      previousStatus: "submitted",
      nextStatus: "submitted",
      note: [
        `stage=${values.stage}`,
        values.errorMessage,
      ]
        .join(" / ")
        .slice(0, 2000),
    });
  } catch (eventError) {
    console.error("[submission-batches] parse_failed event error", {
      batchId: values.batchId,
      stage: values.stage,
      error: getErrorMessage(eventError),
    });
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedActor(request);
    const url = new URL(request.url);

    const status = String(url.searchParams.get("status") || "").trim();
    const targetMonth = String(
      url.searchParams.get("target_month") || ""
    ).trim();

    let query = actor.supabase
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
          submitted_by,
          submitted_at,
          reviewed_by,
          reviewed_at,
          review_note,
          revision_no,
          created_at,
          updated_at,
          file_hash,
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
            content_type,
            size_bytes,
            uploaded_at
          )
        `
      )
      .order("submitted_at", {
        ascending: false,
      })
      .limit(200);

    if (!actor.isHeadquarters) {
      if (!actor.partnerId) {
        throw new Error("所属する取引先を確認できませんでした");
      }

      query = query.eq("partner_id", actor.partnerId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (targetMonth) {
      const normalized = normalizeTargetMonth(targetMonth);

      query = query.eq("target_month", normalized.databaseDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const batches = ((data || []) as SubmissionBatchRow[]).map((batch) => {
      const partner = getPartnerFromRelation(batch.partners);

      return {
        id: batch.id,
        batch_no: batch.batch_no,
        partner_id: batch.partner_id,
        partner_name: partner?.company_name || "取引先未設定",
        partner_type: partner?.partner_type || null,
        target_month: batch.target_month,
        source_type: batch.source_type,
        status: batch.status,
        total_count: batch.total_count,
        success_count: batch.success_count,
        error_count: batch.error_count,
        submitted_at: batch.submitted_at,
        reviewed_at: batch.reviewed_at,
        review_note: batch.review_note,
        revision_no: batch.revision_no,

        file_hash: batch.file_hash || null,
        parse_status: batch.parse_status || "pending",
        duplicate_status: batch.duplicate_status || "unchecked",
        parsed_at: batch.parsed_at || null,
        parse_error: batch.parse_error || null,
        duplicate_of_batch_id: batch.duplicate_of_batch_id || null,

        files: batch.submission_batch_files || [],
      };
    });

    return NextResponse.json({
      success: true,
      is_headquarters: actor.isHeadquarters,
      batches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "提出履歴の取得に失敗しました",
      },
      { status: 403 }
    );
  }
}

export async function POST(request: Request) {
  let stage: ProcessingStage = "initial";

  let actor: AuthenticatedActor | null = null;
  let createdBatchId = "";
  let uploadedStoragePath = "";
  let fileRecordCreated = false;
  let duplicateBatchId: string | null = null;

  try {
    stage = "authentication";
    logStage(stage);

    actor = await requireAuthenticatedActor(request);

    stage = "form_validation";
    logStage(stage, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
    });

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      throw new Error("提出するExcelまたはCSVを選択してください");
    }

    validateUploadFile(fileEntry);

    const targetMonth = normalizeTargetMonth(
      formData.get("target_month")
    );

    const partnerId = await resolveSubmissionPartnerId(
      actor,
      formData.get("partner_id")
    );

    const sourceType = actor.isHeadquarters
      ? String(
          formData.get("source_type") || "headquarters_proxy"
        ).trim()
      : "partner_portal";

    const allowedSourceTypes = [
      "partner_portal",
      "headquarters_proxy",
      "email_migration",
    ];

    if (!allowedSourceTypes.includes(sourceType)) {
      throw new Error("提出方法が正しくありません");
    }

    const reviewNote =
      String(formData.get("note") || "").trim().slice(0, 2000) || null;

    const fileBuffer = new Uint8Array(
      await fileEntry.arrayBuffer()
    );

    stage = "file_hash";

    const fileHash = createFileHash(fileBuffer);

    logStage(stage, {
      partnerId,
      filename: fileEntry.name,
      size: fileEntry.size,
      fileHash,
    });

    stage = "duplicate_batch_check";

    const duplicateBatch = await findDuplicateBatch(
      actor.supabase,
      partnerId,
      fileHash
    );

    duplicateBatchId = duplicateBatch?.id || null;

    logStage(stage, {
      duplicateBatchId,
      duplicateBatchNo: duplicateBatch?.batch_no || null,
    });

    const { data: createdBatch, error: batchError } =
      await actor.supabase
        .from("submission_batches")
        .insert({
          partner_id: partnerId,
          target_month: targetMonth.databaseDate,
          source_type: sourceType,
          status: "submitted",
          submitted_by: actor.userId,
          review_note: reviewNote,

          file_hash: fileHash,
          parse_status: "pending",
          duplicate_status: duplicateBatch
            ? "duplicate"
            : "unchecked",
          duplicate_of_batch_id: duplicateBatchId,
        })
        .select(
          `
            id,
            batch_no,
            partner_id,
            target_month,
            source_type,
            status,
            submitted_at,
            revision_no
          `
        )
        .single();

    if (batchError || !createdBatch) {
      throw new Error(
        batchError?.message || "提出受付の作成に失敗しました"
      );
    }

    createdBatchId = createdBatch.id;
    stage = "batch_created";

    logStage(stage, {
      batchId: createdBatch.id,
      batchNo: createdBatch.batch_no,
    });

    const storageFilename = getSafeStorageFilename(fileEntry.name);

    uploadedStoragePath = [
      partnerId,
      targetMonth.monthValue,
      createdBatch.id,
      storageFilename,
    ].join("/");

    const { error: uploadError } = await actor.supabase.storage
      .from(BUCKET_NAME)
      .upload(uploadedStoragePath, fileBuffer, {
        contentType:
          fileEntry.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    stage = "storage_uploaded";

    logStage(stage, {
      batchId: createdBatch.id,
      storagePath: uploadedStoragePath,
    });

    const { data: createdFile, error: fileInsertError } =
      await actor.supabase
        .from("submission_batch_files")
        .insert({
          batch_id: createdBatch.id,
          original_filename: fileEntry.name,
          storage_path: uploadedStoragePath,
          content_type: fileEntry.type || null,
          size_bytes: fileEntry.size,
          uploaded_by: actor.userId,
        })
        .select(
          `
            id,
            original_filename,
            content_type,
            size_bytes,
            uploaded_at
          `
        )
        .single();

    if (fileInsertError || !createdFile) {
      throw new Error(
        fileInsertError?.message ||
          "提出ファイル情報の保存に失敗しました"
      );
    }

    fileRecordCreated = true;
    stage = "file_record_created";

    logStage(stage, {
      batchId: createdBatch.id,
      fileId: createdFile.id,
    });

    await recordSubmissionEvent(actor.supabase, {
      batchId: createdBatch.id,
      eventType: "submitted",
      actorUserId: actor.userId,
      actorLabel: actor.actorLabel,
      previousStatus: null,
      nextStatus: "submitted",
      note: reviewNote,
    });

    await recordSubmissionEvent(actor.supabase, {
      batchId: createdBatch.id,
      eventType: "file_uploaded",
      actorUserId: actor.userId,
      actorLabel: actor.actorLabel,
      previousStatus: "submitted",
      nextStatus: "submitted",
      note: fileEntry.name,
    });

    stage = "submission_events_created";

    logStage(stage, {
      batchId: createdBatch.id,
    });

    const extension = getFileExtension(fileEntry.name);

    if (extension !== "xlsx") {
      const errorMessage =
        "Excel Parser Engine v1は.xlsx形式のみ解析できます";

      await updateBatchParseFailure(actor.supabase, {
        batchId: createdBatch.id,
        stage,
        errorMessage,
        duplicateBatchId,
      });

      await tryRecordParseFailedEvent(actor.supabase, {
        batchId: createdBatch.id,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        stage,
        errorMessage,
      });

      return NextResponse.json(
        {
          success: true,
          message:
            "加入データを受け付けました。ファイルは本部確認が必要です。",
          stage,
          batch: {
            ...createdBatch,
            file: createdFile,
            parse_status: "failed",
            duplicate_status: duplicateBatch
              ? "duplicate"
              : "unchecked",
            duplicate_of_batch_id: duplicateBatchId,
            parse_error: errorMessage,
          },
          parse: {
            success: false,
            error: errorMessage,
          },
        },
        { status: 201 }
      );
    }

    const { error: parsingUpdateError } = await actor.supabase
      .from("submission_batches")
      .update({
        parse_status: "parsing",
        parse_error: null,
      })
      .eq("id", createdBatch.id);

    if (parsingUpdateError) {
      throw new Error(parsingUpdateError.message);
    }

    await recordSubmissionEvent(actor.supabase, {
      batchId: createdBatch.id,
      eventType: "parsing_started",
      actorUserId: actor.userId,
      actorLabel: actor.actorLabel,
      previousStatus: "submitted",
      nextStatus: "submitted",
      note: fileEntry.name,
    });

    stage = "parsing_started";

    logStage(stage, {
      batchId: createdBatch.id,
      filename: fileEntry.name,
    });

    const comparisonRows = await loadDuplicateComparisonRows(
      actor.supabase,
      partnerId,
      createdBatch.id
    );

    stage = "comparison_rows_loaded";

    logStage(stage, {
      batchId: createdBatch.id,
      comparisonRowCount: comparisonRows.length,
    });

    const parseResult = parseSubmissionExcel(
      fileBuffer,
      {
        batchId: createdBatch.id,
        fileId: createdFile.id,
        partnerId,
        targetMonth: targetMonth.databaseDate,
        originalFilename: fileEntry.name,
      },
      {
        comparisonRows,
      }
    );

    stage = "parser_executed";

    logStage(stage, {
      batchId: createdBatch.id,
      success: parseResult.success,
      format: parseResult.format,
      detection: parseResult.detection,
      summary: parseResult.summary,
      workbookWarnings: parseResult.workbookWarnings,
      fatalErrors: parseResult.fatalErrors,
    });

    if (!parseResult.success) {
      const errorMessage =
        parseResult.fatalErrors.join(" / ") ||
        "Excelの解析に失敗しました";

      await updateBatchParseFailure(actor.supabase, {
        batchId: createdBatch.id,
        stage,
        errorMessage,
        duplicateBatchId,
      });

      await tryRecordParseFailedEvent(actor.supabase, {
        batchId: createdBatch.id,
        actorUserId: actor.userId,
        actorLabel: actor.actorLabel,
        stage,
        errorMessage,
      });

      return NextResponse.json(
        {
          success: true,
          message:
            "加入データを受け付けました。Excel解析は本部確認が必要です。",
          stage,
          batch: {
            ...createdBatch,
            file: createdFile,
            parse_status: "failed",
            duplicate_status: duplicateBatch
              ? "duplicate"
              : "unchecked",
            duplicate_of_batch_id: duplicateBatchId,
            parse_error: errorMessage,
          },
          parse: parseResult,
        },
        { status: 201 }
      );
    }

    const rowInserts = sanitizeSubmissionRowInserts(
      parsedRowsToSubmissionRowInserts(parseResult.rows)
    );

    stage = "rows_inserting";

    logStage(stage, {
      batchId: createdBatch.id,
      rowCount: rowInserts.length,
      firstRow:
        rowInserts.length > 0
          ? {
              sheet_name: rowInserts[0].sheet_name,
              row_number: rowInserts[0].row_number,
              row_type: rowInserts[0].row_type,
              customer_name: rowInserts[0].customer_name,
              plan_code: rowInserts[0].plan_code,
              water_heater_type: rowInserts[0].water_heater_type,
              equipment_name: rowInserts[0].equipment_name,
              warranty_fee: rowInserts[0].warranty_fee,
              validation_status: rowInserts[0].validation_status,
              duplicate_status: rowInserts[0].duplicate_status,
            }
          : null,
    });

    if (rowInserts.length > 0) {
      const { error: rowInsertError } = await actor.supabase
        .from("submission_rows")
        .insert(rowInserts);

      if (rowInsertError) {
        throw new Error(
          `submission_rows INSERT failed: ${rowInsertError.message}`
        );
      }
    }

    stage = "rows_inserted";

    logStage(stage, {
      batchId: createdBatch.id,
      insertedRowCount: rowInserts.length,
    });

    const batchParseStatus = resolveBatchParseStatus({
      errorCount: parseResult.summary.errorCount,
      warningCount: parseResult.summary.warningCount,
      workbookWarningCount: parseResult.workbookWarnings.length,
    });

    const batchDuplicateStatus = resolveBatchDuplicateStatus({
      duplicateBatchId,
      duplicateCount: parseResult.summary.duplicateCount,
      needsReviewCount: parseResult.summary.needsReviewCount,
    });

    const successCount = Math.max(
      parseResult.summary.totalCount -
        parseResult.summary.errorCount,
      0
    );

    const parsedAt = new Date().toISOString();

    const { error: batchUpdateError } = await actor.supabase
      .from("submission_batches")
      .update({
        total_count: parseResult.summary.totalCount,
        success_count: successCount,
        error_count: parseResult.summary.errorCount,

        parse_status: batchParseStatus,
        duplicate_status: batchDuplicateStatus,
        duplicate_of_batch_id: duplicateBatchId,

        parsed_at: parsedAt,
        parse_error: null,
      })
      .eq("id", createdBatch.id);

    if (batchUpdateError) {
      throw new Error(
        `submission_batches UPDATE failed: ${batchUpdateError.message}`
      );
    }

    stage = "batch_updated";

    logStage(stage, {
      batchId: createdBatch.id,
      parseStatus: batchParseStatus,
      duplicateStatus: batchDuplicateStatus,
      totalCount: parseResult.summary.totalCount,
      successCount,
      errorCount: parseResult.summary.errorCount,
    });

    const parseEventNote = JSON.stringify({
      format: parseResult.format,
      total_count: parseResult.summary.totalCount,
      valid_count: parseResult.summary.validCount,
      warning_count: parseResult.summary.warningCount,
      error_count: parseResult.summary.errorCount,
      duplicate_count: parseResult.summary.duplicateCount,
      needs_review_count: parseResult.summary.needsReviewCount,
      workbook_warnings: parseResult.workbookWarnings,
    }).slice(0, 2000);

    await recordSubmissionEvent(actor.supabase, {
      batchId: createdBatch.id,
      eventType: "parsed",
      actorUserId: actor.userId,
      actorLabel: actor.actorLabel,
      previousStatus: "submitted",
      nextStatus: "submitted",
      note: parseEventNote,
    });

    stage = "parse_event_created";

    logStage(stage, {
      batchId: createdBatch.id,
    });

    stage = "completed";

    logStage(stage, {
      batchId: createdBatch.id,
      batchNo: createdBatch.batch_no,
    });

    return NextResponse.json(
      {
        success: true,
        message:
          batchParseStatus === "parsed"
            ? "加入データを受け付け、Excel解析が完了しました"
            : "加入データを受け付けました。確認が必要な項目があります。",
        stage,
        batch: {
          ...createdBatch,
          file: createdFile,

          file_hash: fileHash,
          parse_status: batchParseStatus,
          duplicate_status: batchDuplicateStatus,
          duplicate_of_batch_id: duplicateBatchId,

          total_count: parseResult.summary.totalCount,
          success_count: successCount,
          error_count: parseResult.summary.errorCount,
          parsed_at: parsedAt,
        },
        parse: {
          success: true,
          format: parseResult.format,
          target_month: parseResult.targetMonth,
          summary: parseResult.summary,
          workbook_warnings: parseResult.workbookWarnings,
          detection: parseResult.detection,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

    console.error("[submission-batches] POST failed", {
      stage,
      createdBatchId: createdBatchId || null,
      uploadedStoragePath: uploadedStoragePath || null,
      fileRecordCreated,
      duplicateBatchId,
      errorMessage,
      errorStack,
      rawError: error,
    });

    const supabase = actor?.supabase || getAdminClient();

    /*
     * Storage保存後は、受領した元ファイルを消さない。
     * ParserやDB保存の失敗は、本部確認用として受付を保持する。
     */
    if (createdBatchId && uploadedStoragePath && fileRecordCreated) {
      await updateBatchParseFailure(supabase, {
        batchId: createdBatchId,
        stage,
        errorMessage,
        duplicateBatchId,
      });

      if (actor) {
        await tryRecordParseFailedEvent(supabase, {
          batchId: createdBatchId,
          actorUserId: actor.userId,
          actorLabel: actor.actorLabel,
          stage,
          errorMessage,
        });
      }

      return NextResponse.json(
        {
          success: true,
          message:
            "加入データは受け付けましたが、Excel解析でエラーが発生しました。本部確認が必要です。",
          stage,
          batch: {
            id: createdBatchId,
            parse_status: "failed",
            parse_error: `stage=${stage} / ${errorMessage}`,
            duplicate_status: duplicateBatchId
              ? "duplicate"
              : "unchecked",
            duplicate_of_batch_id: duplicateBatchId,
          },
          debug: {
            stage,
            error: errorMessage,
          },
        },
        { status: 201 }
      );
    }

    /*
     * ファイル情報がDBへ保存される前の失敗だけロールバックする。
     */
    if (uploadedStoragePath) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([uploadedStoragePath]);

      if (removeError) {
        console.error(
          "[submission-batches] rollback storage failed",
          {
            stage,
            storagePath: uploadedStoragePath,
            error: removeError.message,
          }
        );
      }
    }

    if (createdBatchId) {
      const { error: deleteError } = await supabase
        .from("submission_batches")
        .delete()
        .eq("id", createdBatchId);

      if (deleteError) {
        console.error(
          "[submission-batches] rollback batch failed",
          {
            stage,
            batchId: createdBatchId,
            error: deleteError.message,
          }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        stage,
        error: errorMessage,
      },
      { status: 400 }
    );
  }
}