export const MANUAL_WORKFLOW_REPAIR_MARKER =
  "[MANUAL_INCONSISTENCY_REPAIR]";

export const AUTO_REGISTER_STARTED_NOTE = "Auto Register Engine v1を開始";
export const AUTO_REGISTER_COMPLETED_NOTE =
  "保証書・請求書の登録と再確認が完了";

export type WorkflowCycleStatus =
  | "approved"
  | "processing"
  | "warranty_created";

export type WorkflowCycleEvent = {
  id: string;
  event_type: string;
  previous_status: string | null;
  next_status: string | null;
  actor_label?: string | null;
  note: string | null;
  created_at: string;
};

export type ManualWorkflowRepairInfo = {
  event_id: string;
  repaired_at: string;
  previous_status: string | null;
  next_status: "approved";
  actor_label: string | null;
  reason: string;
};

export type WorkflowCycleAnalysis = {
  valid: boolean;
  code: "WORKFLOW_EVENT_VALID" | "WORKFLOW_EVENT_INCONSISTENT";
  message: string;
  repair: ManualWorkflowRepairInfo | null;
  cycle_event_count: number;
  approved_to_processing_count: number;
  processing_to_warranty_created_count: number;
};

function normalizedNote(value: unknown) {
  return String(value ?? "").trim();
}

function eventTime(event: WorkflowCycleEvent) {
  const value = Date.parse(event.created_at);
  return Number.isFinite(value) ? value : null;
}

function isStatusChanged(event: WorkflowCycleEvent) {
  return event.event_type === "status_changed";
}

function isRepairEvent(event: WorkflowCycleEvent) {
  return (
    isStatusChanged(event) &&
    event.next_status === "approved" &&
    normalizedNote(event.note).includes(MANUAL_WORKFLOW_REPAIR_MARKER)
  );
}

function isApprovedToProcessing(event: WorkflowCycleEvent) {
  return (
    event.previous_status === "approved" && event.next_status === "processing"
  );
}

function isProcessingToWarrantyCreated(event: WorkflowCycleEvent) {
  return (
    event.previous_status === "processing" &&
    event.next_status === "warranty_created"
  );
}

function invalid(
  message: string,
  repair: ManualWorkflowRepairInfo | null,
  cycleEvents: WorkflowCycleEvent[],
  approvedToProcessing: WorkflowCycleEvent[],
  processingToWarrantyCreated: WorkflowCycleEvent[]
): WorkflowCycleAnalysis {
  return {
    valid: false,
    code: "WORKFLOW_EVENT_INCONSISTENT",
    message,
    repair,
    cycle_event_count: cycleEvents.length,
    approved_to_processing_count: approvedToProcessing.length,
    processing_to_warranty_created_count:
      processingToWarrantyCreated.length,
  };
}

export function analyzeWorkflowCycle(input: {
  status: WorkflowCycleStatus;
  events: WorkflowCycleEvent[];
}): WorkflowCycleAnalysis {
  const statusEvents = input.events.filter(isStatusChanged);
  const repairCandidates = statusEvents
    .filter(isRepairEvent)
    .map((event) => ({ event, time: eventTime(event) }))
    .filter(
      (candidate): candidate is { event: WorkflowCycleEvent; time: number } =>
        candidate.time !== null
    );

  const latestRepairTime = repairCandidates.reduce<number | null>(
    (latest, candidate) =>
      latest === null || candidate.time > latest ? candidate.time : latest,
    null
  );
  const latestRepairs =
    latestRepairTime === null
      ? []
      : repairCandidates.filter(
          (candidate) => candidate.time === latestRepairTime
        );
  const repairEvent = latestRepairs[0]?.event || null;
  const repair: ManualWorkflowRepairInfo | null = repairEvent
    ? {
        event_id: repairEvent.id,
        repaired_at: repairEvent.created_at,
        previous_status: repairEvent.previous_status,
        next_status: "approved",
        actor_label: repairEvent.actor_label || null,
        reason: normalizedNote(repairEvent.note),
      }
    : null;

  const cycleEvents = repairEvent
    ? statusEvents.filter((event) => {
        const time = eventTime(event);
        return time !== null && time > (latestRepairTime as number);
      })
    : statusEvents;
  const approvedToProcessing = cycleEvents.filter(isApprovedToProcessing);
  const processingToWarrantyCreated = cycleEvents.filter(
    isProcessingToWarrantyCreated
  );

  if (latestRepairs.length > 1) {
    return invalid(
      "最新の手動修復イベントが同一時刻に複数あり、Workflow境界を一意に特定できません。",
      repair,
      cycleEvents,
      approvedToProcessing,
      processingToWarrantyCreated
    );
  }

  if (repairEvent) {
    const sameTimestampEvents = statusEvents.filter(
      (event) =>
        event.id !== repairEvent.id && eventTime(event) === latestRepairTime
    );
    if (sameTimestampEvents.length > 0) {
      return invalid(
        "手動修復イベントと同一時刻の状態変更があり、Workflow境界の前後を判定できません。",
        repair,
        cycleEvents,
        approvedToProcessing,
        processingToWarrantyCreated
      );
    }

    const unexpected = cycleEvents.filter(
      (event) =>
        !isApprovedToProcessing(event) &&
        !isProcessingToWarrantyCreated(event)
    );
    if (unexpected.length > 0) {
      return invalid(
        "最新の手動修復以後に想定外の状態変更があります。",
        repair,
        cycleEvents,
        approvedToProcessing,
        processingToWarrantyCreated
      );
    }
  }

  if (approvedToProcessing.length > 1) {
    return invalid(
      "現在のWorkflowサイクルにapproved→processingイベントが複数あります。",
      repair,
      cycleEvents,
      approvedToProcessing,
      processingToWarrantyCreated
    );
  }
  if (processingToWarrantyCreated.length > 1) {
    return invalid(
      "現在のWorkflowサイクルにprocessing→warranty_createdイベントが複数あります。",
      repair,
      cycleEvents,
      approvedToProcessing,
      processingToWarrantyCreated
    );
  }

  if (
    approvedToProcessing.some(
      (event) => normalizedNote(event.note) !== AUTO_REGISTER_STARTED_NOTE
    )
  ) {
    return invalid(
      "approved→processingイベントのAuto Register開始noteが一致しません。",
      repair,
      cycleEvents,
      approvedToProcessing,
      processingToWarrantyCreated
    );
  }
  if (
    processingToWarrantyCreated.some(
      (event) => normalizedNote(event.note) !== AUTO_REGISTER_COMPLETED_NOTE
    )
  ) {
    return invalid(
      "processing→warranty_createdイベントのAuto Register完了noteが一致しません。",
      repair,
      cycleEvents,
      approvedToProcessing,
      processingToWarrantyCreated
    );
  }

  const started = approvedToProcessing[0];
  const completed = processingToWarrantyCreated[0];
  if (started && completed) {
    const startedAt = eventTime(started);
    const completedAt = eventTime(completed);
    if (
      startedAt === null ||
      completedAt === null ||
      completedAt <= startedAt
    ) {
      return invalid(
        "Auto Registerの完了イベントが開始イベントより後にありません。",
        repair,
        cycleEvents,
        approvedToProcessing,
        processingToWarrantyCreated
      );
    }
  }

  const countsAreValid =
    input.status === "approved"
      ? approvedToProcessing.length === 0 &&
        processingToWarrantyCreated.length === 0
      : input.status === "processing"
        ? approvedToProcessing.length === 1 &&
          processingToWarrantyCreated.length === 0
        : approvedToProcessing.length === 1 &&
          processingToWarrantyCreated.length === 1;

  if (!countsAreValid) {
    return invalid(
      input.status === "approved"
        ? "approvedの現在サイクルにAuto Register遷移が残っています。"
        : input.status === "processing"
          ? "processingの再開に必要なAuto Register開始イベントが1件ではありません。"
          : "warranty_createdに必要なAuto Register開始・完了イベントが揃っていません。",
      repair,
      cycleEvents,
      approvedToProcessing,
      processingToWarrantyCreated
    );
  }

  return {
    valid: true,
    code: "WORKFLOW_EVENT_VALID",
    message: repair
      ? "最新の手動修復以後のWorkflow status・履歴・Auto Register noteは整合しています。"
      : "Workflow status・履歴・Auto Register noteは整合しています。",
    repair,
    cycle_event_count: cycleEvents.length,
    approved_to_processing_count: approvedToProcessing.length,
    processing_to_warranty_created_count:
      processingToWarrantyCreated.length,
  };
}
