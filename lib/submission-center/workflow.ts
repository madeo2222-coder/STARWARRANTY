import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkflowStatus =
  | "submitted"
  | "reviewing"
  | "returned"
  | "approved"
  | "processing"
  | "warranty_created"
  | "printed"
  | "mailed"
  | "completed";

export type WorkflowTransitionSource =
  | "manual"
  | "auto_register"
  | "print_fulfillment";

export const submissionWorkflowTransitions: Record<
  WorkflowStatus,
  readonly WorkflowStatus[]
> = {
  submitted: ["reviewing"],
  reviewing: ["approved", "returned"],
  returned: ["reviewing"],
  approved: ["processing"],
  processing: ["warranty_created"],
  warranty_created: ["printed"],
  printed: ["mailed"],
  mailed: ["completed"],
  completed: [],
};

export type UpdatedSubmissionBatch = {
  id: string;
  batch_no: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  updated_at: string;
};

export type WorkflowTransitionResult = {
  previousStatus: WorkflowStatus;
  nextStatus: WorkflowStatus;
  updatedBatch: UpdatedSubmissionBatch;
};

export type WorkflowTransitionErrorCode =
  | "BATCH_QUERY_FAILED"
  | "BATCH_NOT_FOUND"
  | "INVALID_CURRENT_STATUS"
  | "INVALID_NEXT_STATUS"
  | "NOTE_REQUIRED"
  | "TRANSITION_NOT_ALLOWED"
  | "SOURCE_NOT_ALLOWED"
  | "BATCH_UPDATE_FAILED"
  | "CONCURRENT_UPDATE"
  | "EVENT_SAVE_FAILED";

export class WorkflowTransitionError extends Error {
  readonly code: WorkflowTransitionErrorCode;
  readonly statusUpdated: boolean;
  readonly previousStatus?: WorkflowStatus;
  readonly nextStatus?: WorkflowStatus;
  readonly updatedBatch?: UpdatedSubmissionBatch;

  constructor(
    code: WorkflowTransitionErrorCode,
    message: string,
    details?: {
      statusUpdated?: boolean;
      previousStatus?: WorkflowStatus;
      nextStatus?: WorkflowStatus;
      updatedBatch?: UpdatedSubmissionBatch;
    }
  ) {
    super(message);
    this.name = "WorkflowTransitionError";
    this.code = code;
    this.statusUpdated = details?.statusUpdated || false;
    this.previousStatus = details?.previousStatus;
    this.nextStatus = details?.nextStatus;
    this.updatedBatch = details?.updatedBatch;
  }
}

export function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(submissionWorkflowTransitions, value)
  );
}

export async function transitionSubmissionBatchStatus(input: {
  supabase: SupabaseClient;
  batchId: string;
  nextStatus: unknown;
  actorUserId: string;
  actorLabel: string;
  source: WorkflowTransitionSource;
  note?: string | null;
}): Promise<WorkflowTransitionResult> {
  const note = typeof input.note === "string" ? input.note.trim() : "";

  if (!isWorkflowStatus(input.nextStatus)) {
    throw new WorkflowTransitionError(
      "INVALID_NEXT_STATUS",
      "指定された状態は利用できません"
    );
  }

  if (input.nextStatus === "returned" && !note) {
    throw new WorkflowTransitionError(
      "NOTE_REQUIRED",
      "差戻し理由を入力してください"
    );
  }

  const { data: currentBatch, error: currentBatchError } = await input.supabase
    .from("submission_batches")
    .select("id, status")
    .eq("id", input.batchId)
    .maybeSingle();

  if (currentBatchError) {
    throw new WorkflowTransitionError(
      "BATCH_QUERY_FAILED",
      currentBatchError.message
    );
  }

  if (!currentBatch) {
    throw new WorkflowTransitionError(
      "BATCH_NOT_FOUND",
      "受付情報が見つかりません"
    );
  }

  if (!isWorkflowStatus(currentBatch.status)) {
    throw new WorkflowTransitionError(
      "INVALID_CURRENT_STATUS",
      "現在の状態を処理できません"
    );
  }

  const previousStatus = currentBatch.status;
  const nextStatus = input.nextStatus;
  const allowedNextStatuses = submissionWorkflowTransitions[previousStatus];

  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new WorkflowTransitionError(
      "TRANSITION_NOT_ALLOWED",
      `${previousStatus} から ${nextStatus} へは変更できません`,
      { previousStatus, nextStatus }
    );
  }

  const requiredSource: WorkflowTransitionSource =
    previousStatus === "approved" && nextStatus === "processing"
      ? "auto_register"
      : previousStatus === "processing" && nextStatus === "warranty_created"
        ? "auto_register"
        : previousStatus === "warranty_created" && nextStatus === "printed"
          ? "print_fulfillment"
          : "manual";

  if (input.source !== requiredSource) {
    const message =
      requiredSource === "auto_register"
        ? "この状態変更は自動登録処理からのみ実行できます。"
        : requiredSource === "print_fulfillment"
          ? "この状態変更は印刷確認処理からのみ実行できます。"
          : "この状態変更は通常の状態変更処理からのみ実行できます。";
    throw new WorkflowTransitionError(
      "SOURCE_NOT_ALLOWED",
      message,
      { previousStatus, nextStatus }
    );
  }

  const now = new Date().toISOString();
  const { data: updatedBatch, error: updateError } = await input.supabase
    .from("submission_batches")
    .update({
      status: nextStatus,
      reviewed_by: input.actorUserId,
      reviewed_at: now,
      review_note: note || null,
      updated_at: now,
    })
    .eq("id", input.batchId)
    .eq("status", previousStatus)
    .select(
      "id, batch_no, status, reviewed_by, reviewed_at, review_note, updated_at"
    )
    .maybeSingle();

  if (updateError) {
    throw new WorkflowTransitionError(
      "BATCH_UPDATE_FAILED",
      updateError.message,
      { previousStatus, nextStatus }
    );
  }

  if (!updatedBatch) {
    throw new WorkflowTransitionError(
      "CONCURRENT_UPDATE",
      "状態が他の操作で更新されました。再読み込みしてください",
      { previousStatus, nextStatus }
    );
  }

  const typedUpdatedBatch = updatedBatch as UpdatedSubmissionBatch;
  const { error: eventError } = await input.supabase
    .from("submission_events")
    .insert({
      batch_id: input.batchId,
      event_type: "status_changed",
      actor_user_id: input.actorUserId,
      actor_label: input.actorLabel,
      previous_status: previousStatus,
      next_status: nextStatus,
      note: note || null,
    });

  if (eventError) {
    throw new WorkflowTransitionError(
      "EVENT_SAVE_FAILED",
      `状態は更新されましたが、履歴の保存に失敗しました: ${eventError.message}`,
      {
        statusUpdated: true,
        previousStatus,
        nextStatus,
        updatedBatch: typedUpdatedBatch,
      }
    );
  }

  return {
    previousStatus,
    nextStatus,
    updatedBatch: typedUpdatedBatch,
  };
}
