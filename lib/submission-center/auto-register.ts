import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWarrantyFulfillmentExpectation,
  runAutoRegisterPreflight,
  type AutoRegisterPreflightCheck,
  type AutoRegisterPreflightResult,
  type AutoRegisterRegistrationPlan,
} from "@/lib/submission-center/auto-register-preflight";
import { transitionSubmissionBatchStatus } from "@/lib/submission-center/workflow";
import { createWarrantyCertificate } from "@/lib/warranty/register-certificate";
import { createWarrantyInvoice } from "@/lib/invoice/register-warranty-invoice";
import {
  BillingCustomerResolutionError,
  ensureBillingCustomerForBatch,
  verifyBillingCustomerForInvoice,
  type BillingCustomerErrorCode,
} from "@/lib/submission-center/billing-customer-resolver";

export { buildWarrantyFulfillmentExpectation };

export type AutoRegisterErrorCode =
  | "QUERY_FAILED"
  | "BATCH_NOT_FOUND"
  | "UNSUPPORTED_STATUS"
  | "PRECONDITION_FAILED"
  | "WORKFLOW_EVENT_INCONSISTENT"
  | "PARTIAL_REGISTRATION"
  | "CONTENT_MISMATCH"
  | "REGISTRATION_FAILED"
  | BillingCustomerErrorCode;

export class AutoRegisterError extends Error {
  readonly code: AutoRegisterErrorCode;

  constructor(code: AutoRegisterErrorCode, message: string) {
    super(message);
    this.name = "AutoRegisterError";
    this.code = code;
  }
}

export type AutoRegisterResult = {
  status: "completed" | "already_completed";
  batch_status: "warranty_created";
  certificates: {
    total: number;
    created: number;
    reused: number;
    certificate_numbers: string[];
  };
  invoice: {
    created: boolean;
    reused: boolean;
    invoice_id: string;
    invoice_no: string;
  };
};

function errorCodeForCheck(
  check: AutoRegisterPreflightCheck
): AutoRegisterErrorCode {
  switch (check.code) {
    case "QUERY_FAILED":
      return "QUERY_FAILED";
    case "BATCH_NOT_FOUND":
      return "BATCH_NOT_FOUND";
    case "UNSUPPORTED_STATUS":
      return "UNSUPPORTED_STATUS";
    case "WORKFLOW_EVENT_INCONSISTENT":
      return "WORKFLOW_EVENT_INCONSISTENT";
    case "PARTIAL_REGISTRATION":
      return "PARTIAL_REGISTRATION";
    case "CONTENT_MISMATCH":
      return "CONTENT_MISMATCH";
    case "CUSTOMER_NOT_FOUND":
    case "CUSTOMER_AMBIGUOUS":
    case "CUSTOMER_EMAIL_REQUIRED":
    case "CUSTOMER_CREATE_FAILED":
    case "CUSTOMER_CREATE_CONFLICT":
    case "CUSTOMER_CREATED_BUT_UNRESOLVED":
      return check.code;
    default:
      return "PRECONDITION_FAILED";
  }
}

function firstBlockingCheck(result: AutoRegisterPreflightResult) {
  return result.preflight.checks.find(
    (check) => check.level === "error" || check.level === "unverified"
  );
}

function requireReadyPlan(
  result: AutoRegisterPreflightResult
): AutoRegisterRegistrationPlan {
  const failure = firstBlockingCheck(result);
  if (!result.preflight.ready || !result.registrationPlan || failure) {
    throw new AutoRegisterError(
      failure ? errorCodeForCheck(failure) : "PRECONDITION_FAILED",
      failure?.message || "Auto Registerの事前検証を完了できませんでした"
    );
  }
  return result.registrationPlan;
}

async function refreshPlan(
  supabase: SupabaseClient,
  batchId: string
) {
  return requireReadyPlan(
    await runAutoRegisterPreflight({ supabase, batchId })
  );
}

async function prepareInitialPlan(
  supabase: SupabaseClient,
  batchId: string
) {
  const initial = await runAutoRegisterPreflight({ supabase, batchId });
  const autoCreateAvailable = initial.preflight.checks.some(
    (check) => check.code === "CUSTOMER_AUTO_CREATE_AVAILABLE"
  );

  if (initial.registrationPlan) {
    return requireReadyPlan(initial);
  }
  if (!initial.preflight.ready || !autoCreateAvailable) {
    return requireReadyPlan(initial);
  }

  try {
    await ensureBillingCustomerForBatch({ supabase, batchId });
  } catch (error) {
    if (error instanceof BillingCustomerResolutionError) {
      throw new AutoRegisterError(error.code, error.message);
    }
    throw error;
  }

  return refreshPlan(supabase, batchId);
}

async function createAndVerifyCertificate(input: {
  supabase: SupabaseClient;
  batchId: string;
  expected: AutoRegisterRegistrationPlan["certificates"][number];
  expectedIndex: number;
}) {
  try {
    await createWarrantyCertificate(input.supabase, input.expected);
  } catch (error) {
    const checked = await runAutoRegisterPreflight({
      supabase: input.supabase,
      batchId: input.batchId,
    });
    const inspection = checked.registrationPlan?.inspection.certificates[
      input.expectedIndex
    ];
    if (inspection?.state === "complete") return inspection;
    const failure = firstBlockingCheck(checked);
    if (failure) {
      throw new AutoRegisterError(errorCodeForCheck(failure), failure.message);
    }
    throw new AutoRegisterError(
      "REGISTRATION_FAILED",
      error instanceof Error ? error.message : "保証書登録に失敗しました"
    );
  }

  const plan = await refreshPlan(input.supabase, input.batchId);
  const inspection = plan.inspection.certificates[input.expectedIndex];
  if (inspection?.state !== "complete") {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      `${input.expected.certificate_no}の登録後確認に失敗しました`
    );
  }
  return inspection;
}

async function createAndVerifyInvoice(input: {
  supabase: SupabaseClient;
  batchId: string;
  billingCustomerId: string;
  expected: AutoRegisterRegistrationPlan["invoice"];
}) {
  try {
    await verifyBillingCustomerForInvoice({
      supabase: input.supabase,
      customerId: input.billingCustomerId,
      invoice: input.expected,
    });
    await createWarrantyInvoice(input.supabase, input.expected);
  } catch (error) {
    const checked = await runAutoRegisterPreflight({
      supabase: input.supabase,
      batchId: input.batchId,
    });
    if (checked.registrationPlan?.inspection.invoice.state === "complete") {
      return checked.registrationPlan.inspection.invoice;
    }
    const failure = firstBlockingCheck(checked);
    if (failure) {
      throw new AutoRegisterError(errorCodeForCheck(failure), failure.message);
    }
    if (error instanceof BillingCustomerResolutionError) {
      throw new AutoRegisterError(error.code, error.message);
    }
    throw new AutoRegisterError(
      "REGISTRATION_FAILED",
      error instanceof Error ? error.message : "請求書登録に失敗しました"
    );
  }

  const plan = await refreshPlan(input.supabase, input.batchId);
  if (plan.inspection.invoice.state !== "complete") {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      `${input.expected.invoice_no}の登録後確認に失敗しました`
    );
  }
  return plan.inspection.invoice;
}

export async function autoRegisterSubmissionBatch(input: {
  supabase: SupabaseClient;
  batchId: string;
  actorUserId: string;
  actorLabel: string;
}): Promise<AutoRegisterResult> {
  let plan = await prepareInitialPlan(input.supabase, input.batchId);

  if (plan.batch.status === "warranty_created") {
    return {
      status: "already_completed",
      batch_status: "warranty_created",
      certificates: {
        total: plan.certificates.length,
        created: 0,
        reused: plan.certificates.length,
        certificate_numbers: plan.certificates.map(
          (certificate) => certificate.certificate_no
        ),
      },
      invoice: {
        created: false,
        reused: true,
        invoice_id: plan.inspection.invoice.id || "",
        invoice_no: plan.invoice.invoice_no,
      },
    };
  }

  if (plan.batch.status === "approved") {
    await transitionSubmissionBatchStatus({
      supabase: input.supabase,
      batchId: input.batchId,
      nextStatus: "processing",
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      source: "auto_register",
      note: "Auto Register Engine v1を開始",
    });
    plan = await refreshPlan(input.supabase, input.batchId);
  }

  let createdCertificates = 0;
  let reusedCertificates = 0;
  for (let index = 0; index < plan.certificates.length; index += 1) {
    const expected = plan.certificates[index];
    if (plan.inspection.certificates[index]?.state === "complete") {
      reusedCertificates += 1;
      continue;
    }
    await createAndVerifyCertificate({
      supabase: input.supabase,
      batchId: input.batchId,
      expected,
      expectedIndex: index,
    });
    createdCertificates += 1;
  }

  let invoiceInspection = plan.inspection.invoice;
  let invoiceCreated = false;
  if (invoiceInspection.state === "missing") {
    invoiceInspection = await createAndVerifyInvoice({
      supabase: input.supabase,
      batchId: input.batchId,
      billingCustomerId: plan.billing_customer_id,
      expected: plan.invoice,
    });
    invoiceCreated = true;
  }

  const finalPlan = await refreshPlan(input.supabase, input.batchId);
  if (
    finalPlan.inspection.certificates.some(
      (certificate) => certificate.state !== "complete"
    ) ||
    finalPlan.inspection.invoice.state !== "complete"
  ) {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      "保証書・請求書の全件再確認を完了できませんでした"
    );
  }

  await transitionSubmissionBatchStatus({
    supabase: input.supabase,
    batchId: input.batchId,
    nextStatus: "warranty_created",
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    source: "auto_register",
    note: "保証書・請求書の登録と再確認が完了",
  });

  return {
    status: "completed",
    batch_status: "warranty_created",
    certificates: {
      total: finalPlan.certificates.length,
      created: createdCertificates,
      reused: reusedCertificates,
      certificate_numbers: finalPlan.certificates.map(
        (certificate) => certificate.certificate_no
      ),
    },
    invoice: {
      created: invoiceCreated,
      reused: !invoiceCreated,
      invoice_id: finalPlan.inspection.invoice.id || invoiceInspection.id || "",
      invoice_no: finalPlan.invoice.invoice_no,
    },
  };
}
