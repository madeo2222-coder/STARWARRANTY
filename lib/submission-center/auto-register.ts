import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateSubmissionDocuments,
  type SubmissionDocumentRow,
  type WarrantyDocumentDraft,
} from "@/lib/submission-center/document-generator";
import { transitionSubmissionBatchStatus } from "@/lib/submission-center/workflow";
import {
  createWarrantyCertificate,
  type CreateWarrantyCertificateInput,
} from "@/lib/warranty/register-certificate";
import {
  createWarrantyInvoice,
  type CreateWarrantyInvoiceInput,
} from "@/lib/invoice/register-warranty-invoice";

export type AutoRegisterErrorCode =
  | "QUERY_FAILED"
  | "BATCH_NOT_FOUND"
  | "UNSUPPORTED_STATUS"
  | "PRECONDITION_FAILED"
  | "WORKFLOW_EVENT_INCONSISTENT"
  | "PARTIAL_REGISTRATION"
  | "CONTENT_MISMATCH"
  | "REGISTRATION_FAILED";

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

type BatchData = {
  id: string;
  batch_no: string;
  partner_id: string;
  target_month: string;
  status: string;
  partners:
    | { company_name: string }
    | { company_name: string }[]
    | null;
};

type WarrantyProduct = {
  id: string;
  product_code: string | null;
  product_name: string;
};

type WarrantyCustomer = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
};

type TransitionEvent = {
  id: string;
  previous_status: string | null;
  next_status: string | null;
};

type ExpectedCertificate = CreateWarrantyCertificateInput;

type CertificateInspection = {
  state: "missing" | "complete";
  id?: string;
};

type InvoiceInspection = {
  state: "missing" | "complete";
  id?: string;
};

type RegistrationPlan = {
  batch: BatchData;
  certificates: ExpectedCertificate[];
  invoice: CreateWarrantyInvoiceInput;
};

export type WarrantyFulfillmentExpectation = {
  batch: Pick<BatchData, "id" | "batch_no" | "status">;
  certificates: ExpectedCertificate[];
};

function clean(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizedKey(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function sameText(actual: unknown, expected: unknown) {
  return clean(actual) === clean(expected);
}

function sameNumber(actual: unknown, expected: unknown) {
  return Number(actual || 0) === Number(expected || 0);
}

function stableSortItems<T extends { product_id: string; is_enabled: boolean }>(
  items: T[]
) {
  return [...items].sort((a, b) =>
    `${a.product_id}:${a.is_enabled}`.localeCompare(
      `${b.product_id}:${b.is_enabled}`
    )
  );
}

async function loadEvents(supabase: SupabaseClient, batchId: string) {
  const { data, error } = await supabase
    .from("submission_events")
    .select("id, previous_status, next_status")
    .eq("batch_id", batchId)
    .eq("event_type", "status_changed");

  if (error) {
    throw new AutoRegisterError("QUERY_FAILED", error.message);
  }

  return (data || []) as TransitionEvent[];
}

function assertWorkflowEventConsistency(
  status: string,
  events: TransitionEvent[]
) {
  const approvedToProcessing = events.filter(
    (event) =>
      event.previous_status === "approved" && event.next_status === "processing"
  );
  const processingToWarrantyCreated = events.filter(
    (event) =>
      event.previous_status === "processing" &&
      event.next_status === "warranty_created"
  );

  const inconsistent = (message: string): never => {
    throw new AutoRegisterError("WORKFLOW_EVENT_INCONSISTENT", message);
  };

  if (status === "approved") {
    if (
      approvedToProcessing.length !== 0 ||
      processingToWarrantyCreated.length !== 0
    ) {
      inconsistent("statusとstatus_changedイベントが一致しません");
    }
    return;
  }

  if (status === "processing") {
    if (
      approvedToProcessing.length !== 1 ||
      processingToWarrantyCreated.length !== 0
    ) {
      inconsistent(
        "processingの再開に必要なapproved→processingイベントが1件ではありません"
      );
    }
    return;
  }

  if (status === "warranty_created") {
    if (
      approvedToProcessing.length !== 1 ||
      processingToWarrantyCreated.length !== 1
    ) {
      inconsistent(
        "warranty_createdに必要なWorkflowイベントが揃っていません"
      );
    }
  }
}

function resolveProductIds(
  document: WarrantyDocumentDraft,
  products: WarrantyProduct[]
) {
  const ids: string[] = [];

  document.products.forEach((product, index) => {
    const equipmentKey = normalizedKey(product.equipment_name);
    let matches = equipmentKey
      ? products.filter(
          (candidate) => normalizedKey(candidate.product_name) === equipmentKey
        )
      : [];

    if (matches.length === 0 && index === 0 && document.warranty.plan_code) {
      const planKey = normalizedKey(document.warranty.plan_code);
      matches = products.filter(
        (candidate) => normalizedKey(candidate.product_code) === planKey
      );
    }

    if (matches.length !== 1) {
      throw new AutoRegisterError(
        "PRECONDITION_FAILED",
        `${document.draft_reference}の保証対象機器を一意に特定できません`
      );
    }

    ids.push(matches[0].id);
  });

  return [...new Set(ids)];
}

function deterministicInvoiceDate(targetMonth: string) {
  return /^\d{4}-\d{2}$/.test(targetMonth) ? `${targetMonth}-01` : null;
}

async function buildRegistrationPlan(
  supabase: SupabaseClient,
  batchId: string
): Promise<RegistrationPlan> {
  const { data: batchData, error: batchError } = await supabase
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
    .eq("id", batchId)
    .maybeSingle();

  if (batchError) {
    throw new AutoRegisterError("QUERY_FAILED", batchError.message);
  }
  if (!batchData) {
    throw new AutoRegisterError("BATCH_NOT_FOUND", "受付情報が見つかりません");
  }

  const batch = batchData as unknown as BatchData;
  const partnerRelation = batch.partners;
  const partner = Array.isArray(partnerRelation)
    ? partnerRelation[0]
    : partnerRelation;
  const partnerName = clean(partner?.company_name);

  if (!partnerName) {
    throw new AutoRegisterError(
      "PRECONDITION_FAILED",
      "提出元会社名を確認できません"
    );
  }

  const [rowsResult, productsResult, customerResult] = await Promise.all([
    supabase
      .from("submission_rows")
      .select(
        `
          id,
          sheet_name,
          row_number,
          customer_name,
          customer_name_kana,
          postal_code,
          address_full,
          phone,
          email,
          application_date,
          warranty_start_date,
          plan_code,
          manufacturer,
          model_number,
          equipment_name,
          quantity,
          additional_equipment,
          additional_model_number,
          additional_quantity,
          warranty_fee,
          validation_status,
          duplicate_status
        `
      )
      .eq("batch_id", batchId)
      .order("sheet_name", { ascending: true })
      .order("row_number", { ascending: true }),
    supabase
      .from("warranty_products")
      .select("id, product_code, product_name")
      .eq("is_active", true),
    supabase
      .from("warranty_customers")
      .select("id, company_name, contact_name, email")
      .eq("company_name", partnerName),
  ]);

  if (rowsResult.error) {
    throw new AutoRegisterError("QUERY_FAILED", rowsResult.error.message);
  }
  if (productsResult.error) {
    throw new AutoRegisterError("QUERY_FAILED", productsResult.error.message);
  }
  if (customerResult.error) {
    throw new AutoRegisterError("QUERY_FAILED", customerResult.error.message);
  }

  const rows = (rowsResult.data || []) as SubmissionDocumentRow[];
  if (rows.length === 0) {
    throw new AutoRegisterError(
      "PRECONDITION_FAILED",
      "登録対象のsubmission_rowsがありません"
    );
  }

  const generation = generateSubmissionDocuments(
    {
      id: batch.id,
      batch_no: batch.batch_no,
      partner_id: batch.partner_id,
      partner_name: partnerName,
      target_month: batch.target_month,
    },
    rows
  );

  const needsReview = generation.warranty_documents.filter(
    (document) => document.generation_status !== "ready"
  );
  if (needsReview.length > 0) {
    throw new AutoRegisterError(
      "PRECONDITION_FAILED",
      `要確認の保証書データが${needsReview.length}件あります`
    );
  }

  const customers = (customerResult.data || []) as WarrantyCustomer[];
  if (customers.length !== 1 || !clean(customers[0].email)) {
    throw new AutoRegisterError(
      "PRECONDITION_FAILED",
      "提出元と完全一致する請求先メール設定済みの顧客を一意に特定できません"
    );
  }

  const products = (productsResult.data || []) as WarrantyProduct[];
  const certificates = generation.warranty_documents.map((document) => ({
    certificate_no: document.draft_reference,
    customer_name: document.customer.name || "",
    customer_name_kana: document.customer.name_kana,
    postal_code: document.customer.postal_code,
    address1: document.customer.address,
    address2: null,
    address3: null,
    property_name: null,
    property_room: null,
    start_date: document.warranty.start_date || "",
    introducer_name: null,
    seller_name: partnerName,
    note: `Submission Center ${batch.batch_no} / ${document.source.sheet_name}:${document.source.row_number}`,
    items: resolveProductIds(document, products).map((productId) => ({
      product_id: productId,
      is_enabled: true,
    })),
  }));

  const invoice: CreateWarrantyInvoiceInput = {
    invoice_no: generation.invoice.draft_reference,
    invoice_date: deterministicInvoiceDate(batch.target_month),
    payment_due_date: null,
    subject: generation.invoice.subject,
    bill_to_company_name: partnerName,
    bill_to_name: clean(customers[0].contact_name),
    bill_to_email: customers[0].email || "",
    note: `Submission Center ${batch.batch_no}`,
    items: generation.invoice.items.map((item) => ({
      item_name: item.item_name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
  };

  return { batch, certificates, invoice };
}

export async function buildWarrantyFulfillmentExpectation(
  supabase: SupabaseClient,
  batchId: string
): Promise<WarrantyFulfillmentExpectation> {
  const plan = await buildRegistrationPlan(supabase, batchId);
  return {
    batch: {
      id: plan.batch.id,
      batch_no: plan.batch.batch_no,
      status: plan.batch.status,
    },
    certificates: plan.certificates,
  };
}

function certificateHeaderMatches(
  actual: Record<string, unknown>,
  expected: ExpectedCertificate
) {
  return (
    sameText(actual.certificate_no, expected.certificate_no) &&
    sameText(actual.customer_name, expected.customer_name) &&
    sameText(actual.customer_name_kana, expected.customer_name_kana) &&
    sameText(actual.postal_code, expected.postal_code) &&
    sameText(actual.address1, expected.address1) &&
    sameText(actual.address2, expected.address2) &&
    sameText(actual.address3, expected.address3) &&
    sameText(actual.property_name, expected.property_name) &&
    sameText(actual.property_room, expected.property_room) &&
    sameText(actual.start_date, expected.start_date) &&
    sameText(actual.introducer_name, expected.introducer_name) &&
    sameText(actual.seller_name, expected.seller_name) &&
    sameText(actual.note, expected.note) &&
    actual.status === "active"
  );
}

async function inspectCertificate(
  supabase: SupabaseClient,
  expected: ExpectedCertificate
): Promise<CertificateInspection> {
  const { data, error } = await supabase
    .from("warranty_certificates")
    .select(
      `
        id,
        certificate_no,
        customer_name,
        customer_name_kana,
        postal_code,
        address1,
        address2,
        address3,
        property_name,
        property_room,
        start_date,
        introducer_name,
        seller_name,
        note,
        status,
        warranty_certificate_items (
          product_id,
          is_enabled
        )
      `
    )
    .eq("certificate_no", expected.certificate_no);

  if (error) {
    throw new AutoRegisterError("QUERY_FAILED", error.message);
  }
  if (!data || data.length === 0) {
    return { state: "missing" };
  }
  if (data.length !== 1) {
    throw new AutoRegisterError(
      "CONTENT_MISMATCH",
      `${expected.certificate_no}が複数登録されています`
    );
  }

  const actual = data[0] as Record<string, unknown> & {
    id: string;
    warranty_certificate_items?: {
      product_id: string;
      is_enabled: boolean;
    }[];
  };
  if (!certificateHeaderMatches(actual, expected)) {
    throw new AutoRegisterError(
      "CONTENT_MISMATCH",
      `${expected.certificate_no}のヘッダー内容が期待値と一致しません`
    );
  }

  const actualItems = stableSortItems(actual.warranty_certificate_items || []);
  const expectedItems = stableSortItems(expected.items);
  if (actualItems.length !== expectedItems.length) {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      `${expected.certificate_no}の保証書明細件数が不足または過剰です`
    );
  }
  if (JSON.stringify(actualItems) !== JSON.stringify(expectedItems)) {
    throw new AutoRegisterError(
      "CONTENT_MISMATCH",
      `${expected.certificate_no}の保証書明細が期待値と一致しません`
    );
  }

  return { state: "complete", id: actual.id };
}

function invoiceAmounts(input: CreateWarrantyInvoiceInput) {
  const items = input.items.map((item, index) => ({
    item_name: item.item_name.trim(),
    description: clean(item.description),
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    amount: Number(item.quantity || 0) * Number(item.unit_price || 0),
    sort_order: index,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxRate = 0.1;
  const taxAmount = Math.floor(subtotal * taxRate);
  return { items, subtotal, taxRate, taxAmount, totalAmount: subtotal + taxAmount };
}

async function inspectInvoice(
  supabase: SupabaseClient,
  expected: CreateWarrantyInvoiceInput
): Promise<InvoiceInspection> {
  const { data, error } = await supabase
    .from("warranty_invoices")
    .select(
      `
        id,
        invoice_no,
        invoice_date,
        payment_due_date,
        subject,
        bill_to_company_name,
        bill_to_name,
        bill_to_email,
        subtotal,
        tax_rate,
        tax_amount,
        total_amount,
        status,
        note,
        warranty_invoice_items (
          item_name,
          description,
          quantity,
          unit_price,
          amount,
          sort_order
        )
      `
    )
    .eq("invoice_no", expected.invoice_no);

  if (error) {
    throw new AutoRegisterError("QUERY_FAILED", error.message);
  }
  if (!data || data.length === 0) {
    return { state: "missing" };
  }
  if (data.length !== 1) {
    throw new AutoRegisterError(
      "CONTENT_MISMATCH",
      `${expected.invoice_no}が複数登録されています`
    );
  }

  const calculated = invoiceAmounts(expected);
  const actual = data[0] as Record<string, unknown> & {
    id: string;
    warranty_invoice_items?: Record<string, unknown>[];
  };
  const headerMatches =
    sameText(actual.invoice_no, expected.invoice_no) &&
    sameText(actual.invoice_date, expected.invoice_date) &&
    sameText(actual.payment_due_date, expected.payment_due_date) &&
    sameText(actual.subject, expected.subject) &&
    sameText(actual.bill_to_company_name, expected.bill_to_company_name) &&
    sameText(actual.bill_to_name, expected.bill_to_name) &&
    sameText(actual.bill_to_email, expected.bill_to_email) &&
    sameText(actual.note, expected.note) &&
    sameNumber(actual.subtotal, calculated.subtotal) &&
    sameNumber(actual.tax_rate, calculated.taxRate) &&
    sameNumber(actual.tax_amount, calculated.taxAmount) &&
    sameNumber(actual.total_amount, calculated.totalAmount) &&
    actual.status === "draft";

  if (!headerMatches) {
    throw new AutoRegisterError(
      "CONTENT_MISMATCH",
      `${expected.invoice_no}の請求書ヘッダーが期待値と一致しません`
    );
  }

  const actualItems = [...(actual.warranty_invoice_items || [])]
    .map((item) => ({
      item_name: clean(item.item_name) || "",
      description: clean(item.description),
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      amount: Number(item.amount || 0),
      sort_order: Number(item.sort_order || 0),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (actualItems.length !== calculated.items.length) {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      `${expected.invoice_no}の請求書明細件数が不足または過剰です`
    );
  }
  if (JSON.stringify(actualItems) !== JSON.stringify(calculated.items)) {
    throw new AutoRegisterError(
      "CONTENT_MISMATCH",
      `${expected.invoice_no}の請求書明細が期待値と一致しません`
    );
  }

  return { state: "complete", id: actual.id };
}

async function inspectEntirePlan(
  supabase: SupabaseClient,
  plan: RegistrationPlan,
  requireComplete: boolean
) {
  const certificates: CertificateInspection[] = [];
  for (const expected of plan.certificates) {
    const inspected = await inspectCertificate(supabase, expected);
    if (requireComplete && inspected.state !== "complete") {
      throw new AutoRegisterError(
        "PARTIAL_REGISTRATION",
        `${expected.certificate_no}が登録されていません`
      );
    }
    certificates.push(inspected);
  }

  const invoice = await inspectInvoice(supabase, plan.invoice);
  if (requireComplete && invoice.state !== "complete") {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      `${plan.invoice.invoice_no}が登録されていません`
    );
  }

  return { certificates, invoice };
}

async function createAndVerifyCertificate(
  supabase: SupabaseClient,
  expected: ExpectedCertificate
) {
  try {
    await createWarrantyCertificate(supabase, expected);
  } catch (error) {
    const inspection = await inspectCertificate(supabase, expected);
    if (inspection.state === "complete") return inspection;
    throw new AutoRegisterError(
      "REGISTRATION_FAILED",
      error instanceof Error ? error.message : "保証書登録に失敗しました"
    );
  }

  const inspection = await inspectCertificate(supabase, expected);
  if (inspection.state !== "complete") {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      `${expected.certificate_no}の登録後確認に失敗しました`
    );
  }
  return inspection;
}

async function createAndVerifyInvoice(
  supabase: SupabaseClient,
  expected: CreateWarrantyInvoiceInput
) {
  try {
    await createWarrantyInvoice(supabase, expected);
  } catch (error) {
    const inspection = await inspectInvoice(supabase, expected);
    if (inspection.state === "complete") return inspection;
    throw new AutoRegisterError(
      "REGISTRATION_FAILED",
      error instanceof Error ? error.message : "請求書登録に失敗しました"
    );
  }

  const inspection = await inspectInvoice(supabase, expected);
  if (inspection.state !== "complete") {
    throw new AutoRegisterError(
      "PARTIAL_REGISTRATION",
      `${expected.invoice_no}の登録後確認に失敗しました`
    );
  }
  return inspection;
}

export async function autoRegisterSubmissionBatch(input: {
  supabase: SupabaseClient;
  batchId: string;
  actorUserId: string;
  actorLabel: string;
}): Promise<AutoRegisterResult> {
  let plan = await buildRegistrationPlan(input.supabase, input.batchId);
  let events = await loadEvents(input.supabase, input.batchId);
  assertWorkflowEventConsistency(plan.batch.status, events);

  if (
    !["approved", "processing", "warranty_created"].includes(plan.batch.status)
  ) {
    throw new AutoRegisterError(
      "UNSUPPORTED_STATUS",
      "受付完了・処理中・保証書作成済の案件だけ自動登録できます"
    );
  }

  const initialInspection = await inspectEntirePlan(
    input.supabase,
    plan,
    plan.batch.status === "warranty_created"
  );

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
        invoice_id: initialInspection.invoice.id || "",
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
      note: "Auto Register Engine v1を開始",
    });

    plan = await buildRegistrationPlan(input.supabase, input.batchId);
    events = await loadEvents(input.supabase, input.batchId);
    assertWorkflowEventConsistency(plan.batch.status, events);
  }

  let createdCertificates = 0;
  let reusedCertificates = 0;
  for (let index = 0; index < plan.certificates.length; index += 1) {
    const expected = plan.certificates[index];
    const inspected = initialInspection.certificates[index];
    if (inspected?.state === "complete") {
      reusedCertificates += 1;
      continue;
    }

    await createAndVerifyCertificate(input.supabase, expected);
    createdCertificates += 1;
  }

  let invoiceInspection = initialInspection.invoice;
  let invoiceCreated = false;
  if (invoiceInspection.state === "missing") {
    invoiceInspection = await createAndVerifyInvoice(input.supabase, plan.invoice);
    invoiceCreated = true;
  }

  const finalInspection = await inspectEntirePlan(input.supabase, plan, true);
  await transitionSubmissionBatchStatus({
    supabase: input.supabase,
    batchId: input.batchId,
    nextStatus: "warranty_created",
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    note: "保証書・請求書の登録と再確認が完了",
  });

  return {
    status: "completed",
    batch_status: "warranty_created",
    certificates: {
      total: plan.certificates.length,
      created: createdCertificates,
      reused: reusedCertificates,
      certificate_numbers: plan.certificates.map(
        (certificate) => certificate.certificate_no
      ),
    },
    invoice: {
      created: invoiceCreated,
      reused: !invoiceCreated,
      invoice_id: finalInspection.invoice.id || invoiceInspection.id || "",
      invoice_no: plan.invoice.invoice_no,
    },
  };
}
