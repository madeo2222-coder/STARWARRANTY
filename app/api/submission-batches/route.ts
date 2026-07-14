import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

type AuthenticatedActor = {
  supabase: ReturnType<typeof getAdminClient>;
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
      .order("submitted_at", { ascending: false })
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
  let createdBatchId = "";
  let uploadedStoragePath = "";

  try {
    const actor = await requireAuthenticatedActor(request);
    const formData = await request.formData();

    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      throw new Error("提出するExcelまたはCSVを選択してください");
    }

    validateUploadFile(fileEntry);

    const targetMonth = normalizeTargetMonth(formData.get("target_month"));
    const partnerId = await resolveSubmissionPartnerId(
      actor,
      formData.get("partner_id")
    );

    const sourceType = actor.isHeadquarters
      ? String(formData.get("source_type") || "headquarters_proxy").trim()
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

    const { data: createdBatch, error: batchError } = await actor.supabase
      .from("submission_batches")
      .insert({
        partner_id: partnerId,
        target_month: targetMonth.databaseDate,
        source_type: sourceType,
        status: "submitted",
        submitted_by: actor.userId,
        review_note: reviewNote,
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

    const storageFilename = getSafeStorageFilename(fileEntry.name);
    uploadedStoragePath = [
      partnerId,
      targetMonth.monthValue,
      createdBatch.id,
      storageFilename,
    ].join("/");

    const fileBuffer = new Uint8Array(await fileEntry.arrayBuffer());

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

    const { data: createdFile, error: fileInsertError } = await actor.supabase
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
        "id, original_filename, content_type, size_bytes, uploaded_at"
      )
      .single();

    if (fileInsertError || !createdFile) {
      throw new Error(
        fileInsertError?.message || "提出ファイル情報の保存に失敗しました"
      );
    }

    const { error: submittedEventError } = await actor.supabase
      .from("submission_events")
      .insert({
        batch_id: createdBatch.id,
        event_type: "submitted",
        actor_user_id: actor.userId,
        actor_label: actor.actorLabel,
        previous_status: null,
        next_status: "submitted",
        note: reviewNote,
      });

    if (submittedEventError) {
      throw new Error(submittedEventError.message);
    }

    const { error: fileEventError } = await actor.supabase
      .from("submission_events")
      .insert({
        batch_id: createdBatch.id,
        event_type: "file_uploaded",
        actor_user_id: actor.userId,
        actor_label: actor.actorLabel,
        previous_status: "submitted",
        next_status: "submitted",
        note: fileEntry.name,
      });

    if (fileEventError) {
      throw new Error(fileEventError.message);
    }

    return NextResponse.json(
      {
        success: true,
        message: "加入データを受け付けました",
        batch: {
          ...createdBatch,
          file: createdFile,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const supabase = getAdminClient();

    if (uploadedStoragePath) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([uploadedStoragePath]);

      if (removeError) {
        console.error(
          "submission_center rollback storage error:",
          removeError
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
          "submission_center rollback batch error:",
          deleteError
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "加入データの提出に失敗しました",
      },
      { status: 400 }
    );
  }
}