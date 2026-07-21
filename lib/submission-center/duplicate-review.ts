import type { SupabaseClient } from "@supabase/supabase-js";

export type DuplicateReviewDecision = "separate" | "exclude";

export type DuplicateReviewErrorCode =
  | "ROW_NOT_FOUND"
  | "ROW_BATCH_MISMATCH"
  | "DUPLICATE_REVIEW_NOT_REQUIRED"
  | "DUPLICATE_SOURCE_NOT_FOUND"
  | "REVIEW_NOTE_REQUIRED"
  | "INVALID_DUPLICATE_DECISION"
  | "DUPLICATE_REVIEW_CONCURRENT_UPDATE"
  | "DUPLICATE_REVIEW_SAVE_FAILED"
  | "DUPLICATE_ROW_UPDATE_FAILED"
  | "DUPLICATE_REVIEW_COMPLETED_BUT_UNRESOLVED"
  | "NO_REGISTERABLE_ROWS";

export class DuplicateReviewError extends Error {
  readonly code: DuplicateReviewErrorCode;

  constructor(code: DuplicateReviewErrorCode, message: string) {
    super(message);
    this.name = "DuplicateReviewError";
    this.code = code;
  }
}

export type DuplicateReviewRow = {
  id: string;
  batch_id: string;
  sheet_name: string;
  row_number: number;
  row_type: string;
  customer_name: string | null;
  customer_name_kana: string | null;
  postal_code: string | null;
  address_full: string | null;
  phone: string | null;
  email: string | null;
  application_date: string | null;
  warranty_start_date: string | null;
  plan_code: string | null;
  water_heater_type: string | null;
  additional_equipment: string | null;
  additional_quantity: number | null;
  manufacturer: string | null;
  model_number: string | null;
  equipment_name: string | null;
  quantity: number | null;
  warranty_fee: number | null;
  row_hash: string | null;
  duplicate_status: string;
  duplicate_of_row_id: string | null;
  validation_status: string;
  import_status: string;
};

export type DuplicateReviewBatch = {
  id: string;
  batch_no: string;
  partner_id: string;
  partner_name: string;
  target_month: string;
  status: string;
};

export type DuplicateReviewRecord = {
  id: string;
  batch_id: string;
  row_id: string;
  duplicate_of_row_id: string;
  decision: DuplicateReviewDecision;
  previous_duplicate_status: string;
  next_duplicate_status: string;
  previous_import_status: string;
  next_import_status: string;
  review_note: string;
  reviewed_by: string;
  reviewed_by_label: string;
  reviewed_at: string;
  created_at: string;
};

export type DuplicateComparisonResult =
  | "一致"
  | "不一致"
  | "片方のみ入力"
  | "比較不能";

export type DuplicateComparisonItem = {
  key: string;
  label: string;
  current_value: string | number | null;
  source_value: string | number | null;
  result: DuplicateComparisonResult;
  highlight: boolean;
};

export type DuplicateReviewContext = {
  current: {
    batch: DuplicateReviewBatch;
    row: DuplicateReviewRow;
  };
  source: {
    batch: DuplicateReviewBatch;
    row: DuplicateReviewRow;
  } | null;
  comparison: DuplicateComparisonItem[];
  review: DuplicateReviewRecord | null;
};

type BatchRelation = {
  id: string;
  batch_no: string;
  partner_id: string;
  target_month: string;
  status: string;
  partners:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null;
};

type SourceRowRelation = DuplicateReviewRow & {
  submission_batches: BatchRelation | BatchRelation[] | null;
};

const ROW_SELECT = `
  id, batch_id, sheet_name, row_number, row_type,
  customer_name, customer_name_kana, postal_code, address_full,
  phone, email, application_date, warranty_start_date, plan_code,
  water_heater_type, additional_equipment, additional_quantity,
  manufacturer, model_number, equipment_name, quantity, warranty_fee,
  row_hash, duplicate_status, duplicate_of_row_id, validation_status,
  import_status
`;

const COMPARISON_FIELDS: Array<{
  key: keyof DuplicateReviewRow;
  label: string;
  highlight: boolean;
  kind?: "phone" | "number";
}> = [
  { key: "customer_name", label: "顧客名", highlight: true },
  { key: "postal_code", label: "郵便番号", highlight: false },
  { key: "address_full", label: "住所", highlight: true },
  { key: "phone", label: "電話番号", highlight: true, kind: "phone" },
  { key: "email", label: "メール", highlight: false },
  { key: "warranty_start_date", label: "保証開始日", highlight: true },
  { key: "plan_code", label: "プラン", highlight: true },
  { key: "water_heater_type", label: "給湯器種類", highlight: false },
  { key: "additional_equipment", label: "追加機器", highlight: false },
  { key: "additional_quantity", label: "追加台数", highlight: false, kind: "number" },
  { key: "manufacturer", label: "メーカー", highlight: false },
  { key: "model_number", label: "型番", highlight: false },
  { key: "equipment_name", label: "商品", highlight: true },
  { key: "quantity", label: "数量", highlight: false, kind: "number" },
  { key: "warranty_fee", label: "保証料", highlight: true, kind: "number" },
];

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizedComparisonValue(
  value: unknown,
  kind: "phone" | "number" | undefined
) {
  const cleaned = text(value);
  if (cleaned === null) return null;
  if (kind === "phone") return cleaned.replace(/\D/g, "");
  if (kind === "number") {
    const number = Number(cleaned);
    return Number.isFinite(number) ? String(number) : cleaned;
  }
  return cleaned.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function compareDuplicateRows(
  current: DuplicateReviewRow,
  source: DuplicateReviewRow | null
): DuplicateComparisonItem[] {
  return COMPARISON_FIELDS.map((field) => {
    const currentValue = current[field.key] as string | number | null;
    const sourceValue = source
      ? (source[field.key] as string | number | null)
      : null;
    const currentKey = normalizedComparisonValue(currentValue, field.kind);
    const sourceKey = normalizedComparisonValue(sourceValue, field.kind);
    let result: DuplicateComparisonResult;
    if (!source) result = "比較不能";
    else if (currentKey === null && sourceKey === null) result = "比較不能";
    else if (currentKey === null || sourceKey === null) result = "片方のみ入力";
    else result = currentKey === sourceKey ? "一致" : "不一致";

    return {
      key: String(field.key),
      label: field.label,
      current_value: currentValue,
      source_value: sourceValue,
      result,
      highlight: field.highlight,
    };
  });
}

function toBatch(relation: BatchRelation): DuplicateReviewBatch {
  const partnerRelation = relation.partners;
  const partner = Array.isArray(partnerRelation)
    ? partnerRelation[0]
    : partnerRelation;
  return {
    id: relation.id,
    batch_no: relation.batch_no,
    partner_id: relation.partner_id,
    partner_name: partner?.company_name || "提出元未設定",
    target_month: relation.target_month,
    status: relation.status,
  };
}

export async function loadDuplicateReviewContexts(input: {
  supabase: SupabaseClient;
  batchId: string;
}): Promise<DuplicateReviewContext[]> {
  const [batchResult, rowsResult, reviewsResult] = await Promise.all([
    input.supabase
      .from("submission_batches")
      .select("id, batch_no, partner_id, target_month, status, partners(company_name)")
      .eq("id", input.batchId)
      .maybeSingle(),
    input.supabase
      .from("submission_rows")
      .select(ROW_SELECT)
      .eq("batch_id", input.batchId)
      .order("sheet_name", { ascending: true })
      .order("row_number", { ascending: true }),
    input.supabase
      .from("submission_duplicate_reviews")
      .select(
        "id, batch_id, row_id, duplicate_of_row_id, decision, previous_duplicate_status, next_duplicate_status, previous_import_status, next_import_status, review_note, reviewed_by, reviewed_by_label, reviewed_at, created_at"
      )
      .eq("batch_id", input.batchId),
  ]);

  if (batchResult.error || !batchResult.data) {
    throw new DuplicateReviewError(
      "ROW_NOT_FOUND",
      batchResult.error?.message || "受付情報が見つかりません。"
    );
  }
  if (rowsResult.error) {
    throw new DuplicateReviewError("ROW_NOT_FOUND", rowsResult.error.message);
  }
  if (reviewsResult.error) {
    throw new DuplicateReviewError(
      "DUPLICATE_REVIEW_SAVE_FAILED",
      reviewsResult.error.message
    );
  }

  const batch = toBatch(batchResult.data as unknown as BatchRelation);
  const rows = (rowsResult.data || []) as DuplicateReviewRow[];
  const reviews = (reviewsResult.data || []) as DuplicateReviewRecord[];
  const reviewsByRow = new Map(reviews.map((review) => [review.row_id, review]));
  const targets = rows.filter(
    (row) =>
      ["duplicate", "needs_review"].includes(row.duplicate_status) ||
      reviewsByRow.has(row.id)
  );
  const sourceIds = [
    ...new Set(targets.map((row) => row.duplicate_of_row_id).filter(Boolean)),
  ] as string[];
  const sources = new Map<string, SourceRowRelation>();
  if (sourceIds.length > 0) {
    const { data, error } = await input.supabase
      .from("submission_rows")
      .select(
        `${ROW_SELECT}, submission_batches(id, batch_no, partner_id, target_month, status, partners(company_name))`
      )
      .in("id", sourceIds);
    if (error) {
      throw new DuplicateReviewError("DUPLICATE_SOURCE_NOT_FOUND", error.message);
    }
    for (const source of (data || []) as unknown as SourceRowRelation[]) {
      sources.set(source.id, source);
    }
  }

  return targets.map((row) => {
    const sourceRelation = row.duplicate_of_row_id
      ? sources.get(row.duplicate_of_row_id) || null
      : null;
    const sourceBatchRelation = sourceRelation
      ? Array.isArray(sourceRelation.submission_batches)
        ? sourceRelation.submission_batches[0]
        : sourceRelation.submission_batches
      : null;
    const source =
      sourceRelation && sourceBatchRelation
        ? { batch: toBatch(sourceBatchRelation), row: sourceRelation }
        : null;
    return {
      current: { batch, row },
      source,
      comparison: compareDuplicateRows(row, source?.row || null),
      review: reviewsByRow.get(row.id) || null,
    };
  });
}

export async function loadExcludedDuplicateRowIds(input: {
  supabase: SupabaseClient;
  batchId: string;
}) {
  const { data, error } = await input.supabase
    .from("submission_duplicate_reviews")
    .select("row_id")
    .eq("batch_id", input.batchId)
    .eq("decision", "exclude");
  if (error) {
    throw new DuplicateReviewError("DUPLICATE_REVIEW_SAVE_FAILED", error.message);
  }
  return new Set((data || []).map((review) => String(review.row_id)));
}

export function filterRegisterableSubmissionRows<T extends {
  id: string;
  import_status?: string | null;
}>(rows: T[], excludedRowIds: Set<string>) {
  return rows.filter(
    (row) => row.import_status !== "skipped" && !excludedRowIds.has(row.id)
  );
}

function codeFromRpcError(message: string): DuplicateReviewErrorCode {
  const codes: DuplicateReviewErrorCode[] = [
    "DUPLICATE_REVIEW_CONCURRENT_UPDATE",
    "DUPLICATE_REVIEW_SAVE_FAILED",
    "DUPLICATE_ROW_UPDATE_FAILED",
  ];
  return codes.find((code) => message.includes(code)) || "DUPLICATE_REVIEW_SAVE_FAILED";
}

export async function reviewSubmissionDuplicate(input: {
  supabase: SupabaseClient;
  batchId: string;
  rowId: string;
  decision: DuplicateReviewDecision;
  note: string;
  actorUserId: string;
  actorLabel: string;
}) {
  const note = input.note.trim();
  if (!note) {
    throw new DuplicateReviewError("REVIEW_NOTE_REQUIRED", "判断理由を入力してください。");
  }
  if (!(["separate", "exclude"] as string[]).includes(input.decision)) {
    throw new DuplicateReviewError(
      "INVALID_DUPLICATE_DECISION",
      "許可されていない重複判断です。"
    );
  }

  const { data, error } = await input.supabase.rpc("review_submission_duplicate", {
    p_batch_id: input.batchId,
    p_row_id: input.rowId,
    p_decision: input.decision,
    p_review_note: note,
    p_reviewed_by: input.actorUserId,
    p_reviewed_by_label: input.actorLabel,
  });
  if (error) {
    throw new DuplicateReviewError(codeFromRpcError(error.message), error.message);
  }

  const result = data as {
    success?: boolean;
    code?: DuplicateReviewErrorCode;
    message?: string;
    review_id?: string;
    duplicate_of_row_id?: string;
    next_duplicate_status?: string;
    next_import_status?: string;
  } | null;
  if (!result?.success) {
    throw new DuplicateReviewError(
      result?.code || "DUPLICATE_REVIEW_SAVE_FAILED",
      result?.message || "重複判断を保存できませんでした。"
    );
  }

  const [rowResult, reviewResult] = await Promise.all([
    input.supabase
      .from("submission_rows")
      .select("id, batch_id, duplicate_status, duplicate_of_row_id, import_status")
      .eq("id", input.rowId)
      .eq("batch_id", input.batchId)
      .maybeSingle(),
    input.supabase
      .from("submission_duplicate_reviews")
      .select("id, row_id, decision, duplicate_of_row_id")
      .eq("id", result.review_id || "")
      .maybeSingle(),
  ]);
  const row = rowResult.data;
  const review = reviewResult.data;
  if (
    rowResult.error ||
    reviewResult.error ||
    !row ||
    !review ||
    review.row_id !== input.rowId ||
    review.decision !== input.decision ||
    row.duplicate_status !== result.next_duplicate_status ||
    row.import_status !== result.next_import_status ||
    row.duplicate_of_row_id !== result.duplicate_of_row_id ||
    review.duplicate_of_row_id !== result.duplicate_of_row_id
  ) {
    throw new DuplicateReviewError(
      "DUPLICATE_REVIEW_COMPLETED_BUT_UNRESOLVED",
      rowResult.error?.message ||
        reviewResult.error?.message ||
        "判断保存後の行と監査履歴を完全確認できませんでした。"
    );
  }

  return { result, row, review };
}
