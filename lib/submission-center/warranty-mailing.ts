import type { SupabaseClient } from "@supabase/supabase-js";
import type { WarrantyFulfillmentResult } from "@/lib/submission-center/warranty-fulfillment";

export const warrantyMailMethods = [
  "regular_mail",
  "letter_pack_light",
  "letter_pack_plus",
  "yu_packet",
  "courier",
  "other",
] as const;

export type WarrantyMailMethod = (typeof warrantyMailMethods)[number];

export type WarrantyMailItem = {
  certificateId: string;
  mailMethod: WarrantyMailMethod;
  trackingNumber?: string | null;
};

export const warrantyMailMethodLabels: Record<WarrantyMailMethod, string> = {
  regular_mail: "普通郵便",
  letter_pack_light: "レターパックライト",
  letter_pack_plus: "レターパックプラス",
  yu_packet: "ゆうパケット",
  courier: "宅配便",
  other: "その他",
};

export const trackingRequiredMailMethods = new Set<WarrantyMailMethod>([
  "letter_pack_light",
  "letter_pack_plus",
  "yu_packet",
  "courier",
]);

export type WarrantyFulfillmentErrorCode =
  | "FULFILLMENT_BATCH_NOT_FOUND"
  | "FULFILLMENT_STATUS_CHANGED"
  | "FULFILLMENT_CERTIFICATE_MISMATCH"
  | "FULFILLMENT_CERTIFICATE_NOT_FOUND"
  | "FULFILLMENT_ALREADY_PRINTED"
  | "FULFILLMENT_PRINT_COUNT_INVALID"
  | "FULFILLMENT_NOT_ALL_PRINTED"
  | "FULFILLMENT_RECIPIENT_INCOMPLETE"
  | "FULFILLMENT_MAIL_METHOD_INVALID"
  | "FULFILLMENT_TRACKING_REQUIRED"
  | "FULFILLMENT_ALREADY_MAILED"
  | "FULFILLMENT_CONCURRENT_UPDATE"
  | "FULFILLMENT_AUDIT_FAILED"
  | "FULFILLMENT_QUERY_FAILED";

export class WarrantyMailingError extends Error {
  readonly code: WarrantyFulfillmentErrorCode;

  constructor(code: WarrantyFulfillmentErrorCode, message: string) {
    super(message);
    this.name = "WarrantyMailingError";
    this.code = code;
  }
}

export type WarrantyCertificateFulfillment = {
  id: string;
  batch_id: string;
  certificate_id: string;
  print_status: "pending" | "printed";
  printed_at: string | null;
  printed_by: string | null;
  printed_by_label: string | null;
  print_count: number;
  print_note: string | null;
  mail_status: "pending" | "mailed";
  mailed_at: string | null;
  mailed_by: string | null;
  mailed_by_label: string | null;
  mail_method: WarrantyMailMethod | null;
  tracking_number: string | null;
  recipient_name_snapshot: string | null;
  postal_code_snapshot: string | null;
  address_snapshot: string | null;
  mail_note: string | null;
  created_at: string;
  updated_at: string;
};

export type WarrantyCertificateFulfillmentEvent = {
  id: string;
  fulfillment_id: string;
  batch_id: string;
  certificate_id: string;
  event_type: "printed" | "reprinted" | "mailed" | "remailed";
  actor_user_id: string;
  actor_label: string;
  note: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export type WarrantyFulfillmentManagement = WarrantyFulfillmentResult & {
  records: WarrantyCertificateFulfillment[];
  events: WarrantyCertificateFulfillmentEvent[];
};

type FulfillmentRpcResult = {
  success: boolean;
  code?: string;
  message?: string;
  batch_id?: string;
  previous_status?: string;
  next_status?: string;
  certificate_count?: number;
  certificate_ids?: string[];
  certificate_numbers?: string[];
  processed_at?: string;
};

function isErrorCode(value: unknown): value is WarrantyFulfillmentErrorCode {
  return (
    typeof value === "string" &&
    (value.startsWith("FULFILLMENT_") || value === "FULFILLMENT_QUERY_FAILED")
  );
}

function errorFromRpc(error: { message?: string } | null, data: unknown) {
  const result = data as FulfillmentRpcResult | null;
  if (result && result.success === false) {
    throw new WarrantyMailingError(
      isErrorCode(result.code) ? result.code : "FULFILLMENT_AUDIT_FAILED",
      result.message || "保証書の発送処理に失敗しました。"
    );
  }
  if (error) {
    const matchedCode = error.message?.match(/FULFILLMENT_[A-Z_]+/)?.[0];
    throw new WarrantyMailingError(
      isErrorCode(matchedCode) ? matchedCode : "FULFILLMENT_AUDIT_FAILED",
      error.message || "保証書の発送処理に失敗しました。"
    );
  }
  if (!result?.success) {
    throw new WarrantyMailingError(
      "FULFILLMENT_AUDIT_FAILED",
      "保証書の発送処理結果を確認できませんでした。"
    );
  }
  return result;
}

export function isWarrantyMailMethod(value: unknown): value is WarrantyMailMethod {
  return (
    typeof value === "string" &&
    (warrantyMailMethods as readonly string[]).includes(value)
  );
}

export async function loadWarrantyFulfillmentManagement(input: {
  supabase: SupabaseClient;
  batchId: string;
  inspection: WarrantyFulfillmentResult;
}): Promise<WarrantyFulfillmentManagement> {
  const [recordsResult, eventsResult] = await Promise.all([
    input.supabase
      .from("warranty_certificate_fulfillments")
      .select("*")
      .eq("batch_id", input.batchId)
      .order("created_at", { ascending: true }),
    input.supabase
      .from("warranty_certificate_fulfillment_events")
      .select("*")
      .eq("batch_id", input.batchId)
      .order("created_at", { ascending: false }),
  ]);

  if (recordsResult.error || eventsResult.error) {
    throw new WarrantyMailingError(
      "FULFILLMENT_QUERY_FAILED",
      recordsResult.error?.message ||
        eventsResult.error?.message ||
        "保証書の印刷・郵送情報を取得できませんでした。"
    );
  }

  return {
    ...input.inspection,
    records: (recordsResult.data || []) as WarrantyCertificateFulfillment[],
    events: (eventsResult.data || []) as WarrantyCertificateFulfillmentEvent[],
  };
}

export async function markWarrantyCertificatesPrinted(input: {
  supabase: SupabaseClient;
  batchId: string;
  certificateIds: string[];
  printCount: number;
  printNote?: string | null;
  actorUserId: string;
  actorLabel: string;
}) {
  const { data, error } = await input.supabase.rpc(
    "mark_warranty_certificates_printed",
    {
      p_batch_id: input.batchId,
      p_certificate_ids: input.certificateIds,
      p_print_count: input.printCount,
      p_print_note: input.printNote || null,
      p_actor_user_id: input.actorUserId,
      p_actor_label: input.actorLabel,
    }
  );
  return errorFromRpc(error, data);
}

export async function markWarrantyCertificatesMailed(input: {
  supabase: SupabaseClient;
  batchId: string;
  mailItems: WarrantyMailItem[];
  mailNote?: string | null;
  actorUserId: string;
  actorLabel: string;
}) {
  const { data, error } = await input.supabase.rpc(
    "mark_warranty_certificates_mailed",
    {
      p_batch_id: input.batchId,
      p_mail_items: input.mailItems.map((item) => ({
        certificate_id: item.certificateId,
        mail_method: item.mailMethod,
        tracking_number: item.trackingNumber || null,
      })),
      p_mail_note: input.mailNote || null,
      p_actor_user_id: input.actorUserId,
      p_actor_label: input.actorLabel,
    }
  );
  return errorFromRpc(error, data);
}
