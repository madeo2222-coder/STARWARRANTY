import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateSubmissionDocuments,
  type SubmissionDocumentRow,
  type WarrantyDocumentDraft,
} from "@/lib/submission-center/document-generator";
import type { CreateWarrantyCertificateInput } from "@/lib/warranty/register-certificate";
import type { CreateWarrantyInvoiceInput } from "@/lib/invoice/register-warranty-invoice";

export type AutoRegisterPreflightLevel =
  | "error"
  | "warning"
  | "passed"
  | "unverified";

export type AutoRegisterPreflightCheck = {
  code: string;
  level: AutoRegisterPreflightLevel;
  title: string;
  message: string;
  row_id?: string;
  sheet_name?: string;
  row_number?: number;
  field?: string;
  current_value?: string | number | boolean | null;
  resolution?: string;
  related?: {
    batch_no: string | null;
    sheet_name: string | null;
    row_number: number | null;
  };
};

export type AutoRegisterPreflight = {
  ready: boolean;
  checked_at: string;
  expected_certificate_count: number;
  expected_invoice_count: number;
  summary: {
    error_count: number;
    warning_count: number;
    passed_count: number;
    unverified_count: number;
  };
  checks: AutoRegisterPreflightCheck[];
  resolved: {
    partner_name: string | null;
    billing_customer: {
      id: string;
      company_name: string | null;
      contact_name: string | null;
      email_configured: boolean;
    } | null;
    products: {
      row_id: string;
      sheet_name: string;
      row_number: number;
      draft_reference: string;
      item_index: number;
      requested_name: string | null;
      requested_plan_code: string | null;
      product_id: string | null;
      product_code: string | null;
      product_name: string | null;
      resolution: "product_name" | "product_code" | null;
    }[];
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

type SubmissionPreflightRow = SubmissionDocumentRow & {
  batch_id: string;
  row_type: string | null;
  water_heater_type: string | null;
  validation_errors: unknown;
  duplicate_of_row_id: string | null;
  import_status: string | null;
};

type WarrantyProduct = {
  id: string;
  product_code: string | null;
  product_name: string;
  is_active: boolean | null;
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

type DuplicateSource = {
  id: string;
  sheet_name: string | null;
  row_number: number | null;
  submission_batches:
    | { batch_no: string }
    | { batch_no: string }[]
    | null;
};

export type AutoRegisterCertificateInspection = {
  state: "missing" | "complete" | "invalid";
  id?: string;
};

export type AutoRegisterInvoiceInspection = {
  state: "missing" | "complete" | "invalid";
  id?: string;
};

export type AutoRegisterRegistrationPlan = {
  batch: BatchData;
  certificates: CreateWarrantyCertificateInput[];
  invoice: CreateWarrantyInvoiceInput;
  inspection: {
    certificates: AutoRegisterCertificateInspection[];
    invoice: AutoRegisterInvoiceInspection;
  };
};

export type AutoRegisterPreflightResult = {
  preflight: AutoRegisterPreflight;
  registrationPlan: AutoRegisterRegistrationPlan | null;
};

export type WarrantyFulfillmentExpectation = {
  batch: Pick<BatchData, "id" | "batch_no" | "status">;
  certificates: CreateWarrantyCertificateInput[];
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

function deterministicInvoiceDate(targetMonth: string) {
  return /^\d{4}-\d{2}$/.test(targetMonth) ? `${targetMonth}-01` : null;
}

function makePreflight(
  checks: AutoRegisterPreflightCheck[],
  values: Omit<AutoRegisterPreflight, "ready" | "checked_at" | "summary" | "checks">
): AutoRegisterPreflight {
  const count = (level: AutoRegisterPreflightLevel) =>
    checks.filter((check) => check.level === level).length;
  const errorCount = count("error");

  return {
    ready: errorCount === 0 && count("unverified") === 0,
    checked_at: new Date().toISOString(),
    ...values,
    summary: {
      error_count: errorCount,
      warning_count: count("warning"),
      passed_count: count("passed"),
      unverified_count: count("unverified"),
    },
    checks,
  };
}

function issueField(issue: string) {
  if (issue.startsWith("顧客名")) return "customer_name";
  if (issue.startsWith("住所")) return "address_full";
  if (issue.startsWith("保証開始日")) return "warranty_start_date";
  if (issue.startsWith("メーカー")) return "manufacturer";
  if (issue.startsWith("型番")) return "model_number";
  if (issue.startsWith("保証料")) return "warranty_fee";
  if (issue.startsWith("validation_status")) return "validation_status";
  if (issue.startsWith("duplicate_status")) return "duplicate_status";
  return undefined;
}

function issueCode(field: string | undefined, value: unknown) {
  if (field === "validation_status") return "ROW_VALIDATION_FAILED";
  if (field === "duplicate_status") {
    if (value === "duplicate") return "DUPLICATE_ROW";
    if (value === "needs_review") return "DUPLICATE_REVIEW_REQUIRED";
    return "DUPLICATE_UNCHECKED";
  }
  return "ROW_FIELD_REQUIRED";
}

function rowValue(row: SubmissionPreflightRow, field: string | undefined) {
  if (!field) return null;
  const value = row[field as keyof SubmissionPreflightRow];
  return typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean" || value === null
    ? value
    : null;
}

function productCandidates(
  document: WarrantyDocumentDraft,
  itemIndex: number,
  products: WarrantyProduct[],
  activeOnly: boolean
) {
  const available = activeOnly
    ? products.filter((candidate) => candidate.is_active === true)
    : products;
  const product = document.products[itemIndex];
  const equipmentKey = normalizedKey(product.equipment_name);
  let matches = equipmentKey
    ? available.filter(
        (candidate) => normalizedKey(candidate.product_name) === equipmentKey
      )
    : [];
  let resolution: "product_name" | "product_code" | null = matches.length
    ? "product_name"
    : null;

  if (matches.length === 0 && itemIndex === 0 && document.warranty.plan_code) {
    const planKey = normalizedKey(document.warranty.plan_code);
    matches = available.filter(
      (candidate) => normalizedKey(candidate.product_code) === planKey
    );
    resolution = matches.length ? "product_code" : null;
  }

  return { matches, resolution };
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

async function inspectCertificate(
  supabase: SupabaseClient,
  expected: CreateWarrantyCertificateInput,
  requireComplete: boolean,
  checks: AutoRegisterPreflightCheck[]
): Promise<AutoRegisterCertificateInspection> {
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
    checks.push({
      code: "QUERY_FAILED",
      level: "error",
      title: "既存保証書を確認できません",
      message: error.message,
      resolution: "通信状態を確認して事前確認を再実行してください。",
    });
    return { state: "invalid" };
  }
  if (!data || data.length === 0) {
    checks.push({
      code: requireComplete ? "PARTIAL_REGISTRATION" : "CERTIFICATE_READY_TO_CREATE",
      level: requireComplete ? "error" : "passed",
      title: requireComplete ? "保証書が登録されていません" : "保証書は新規登録対象です",
      message: `${expected.certificate_no}は未登録です。`,
      resolution: requireComplete
        ? "登録処理の結果を確認してください。"
        : "Auto Register実行時に新規登録されます。",
    });
    return { state: "missing" };
  }
  if (data.length !== 1) {
    checks.push({
      code: "CONTENT_MISMATCH",
      level: "error",
      title: "同じ保証書番号が複数あります",
      message: `${expected.certificate_no}が${data.length}件登録されています。`,
      resolution: "既存登録を調査し、重複を解消してから再確認してください。",
    });
    return { state: "invalid" };
  }

  const actual = data[0] as Record<string, unknown> & {
    id: string;
    warranty_certificate_items?: { product_id: string; is_enabled: boolean }[];
  };
  const headerMatches =
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
    actual.status === "active";

  if (!headerMatches) {
    checks.push({
      code: "CONTENT_MISMATCH",
      level: "error",
      title: "既存保証書の内容が一致しません",
      message: `${expected.certificate_no}のヘッダー内容が期待値と一致しません。`,
      resolution: "上書きせず、既存登録と受付内容を確認してください。",
    });
    return { state: "invalid", id: actual.id };
  }

  const actualItems = stableSortItems(actual.warranty_certificate_items || []);
  const expectedItems = stableSortItems(expected.items);
  if (actualItems.length !== expectedItems.length) {
    checks.push({
      code: "PARTIAL_REGISTRATION",
      level: "error",
      title: "保証書明細件数が一致しません",
      message: `${expected.certificate_no}の明細は期待${expectedItems.length}件、実際${actualItems.length}件です。`,
      resolution: "自動補完せず、既存登録を確認してください。",
    });
    return { state: "invalid", id: actual.id };
  }
  if (JSON.stringify(actualItems) !== JSON.stringify(expectedItems)) {
    checks.push({
      code: "CONTENT_MISMATCH",
      level: "error",
      title: "保証書明細が一致しません",
      message: `${expected.certificate_no}の商品IDまたは有効状態が期待値と一致しません。`,
      resolution: "上書きせず、既存登録を確認してください。",
    });
    return { state: "invalid", id: actual.id };
  }

  checks.push({
    code: "CERTIFICATE_REUSABLE",
    level: "passed",
    title: "既存保証書を再利用できます",
    message: `${expected.certificate_no}は期待値と完全一致しています。`,
  });
  return { state: "complete", id: actual.id };
}

async function inspectInvoice(
  supabase: SupabaseClient,
  expected: CreateWarrantyInvoiceInput,
  requireComplete: boolean,
  checks: AutoRegisterPreflightCheck[]
): Promise<AutoRegisterInvoiceInspection> {
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
    checks.push({
      code: "QUERY_FAILED",
      level: "error",
      title: "既存請求書を確認できません",
      message: error.message,
      resolution: "通信状態を確認して事前確認を再実行してください。",
    });
    return { state: "invalid" };
  }
  if (!data || data.length === 0) {
    checks.push({
      code: requireComplete ? "PARTIAL_REGISTRATION" : "INVOICE_READY_TO_CREATE",
      level: requireComplete ? "error" : "passed",
      title: requireComplete ? "請求書が登録されていません" : "請求書は新規登録対象です",
      message: `${expected.invoice_no}は未登録です。`,
      resolution: requireComplete
        ? "登録処理の結果を確認してください。"
        : "Auto Register実行時に新規登録されます。",
    });
    return { state: "missing" };
  }
  if (data.length !== 1) {
    checks.push({
      code: "CONTENT_MISMATCH",
      level: "error",
      title: "同じ請求書番号が複数あります",
      message: `${expected.invoice_no}が${data.length}件登録されています。`,
      resolution: "既存登録を調査し、重複を解消してから再確認してください。",
    });
    return { state: "invalid" };
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
    checks.push({
      code: "CONTENT_MISMATCH",
      level: "error",
      title: "既存請求書の内容が一致しません",
      message: `${expected.invoice_no}のヘッダー内容が期待値と一致しません。`,
      resolution: "上書きせず、既存登録と受付内容を確認してください。",
    });
    return { state: "invalid", id: actual.id };
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
    checks.push({
      code: "PARTIAL_REGISTRATION",
      level: "error",
      title: "請求書明細件数が一致しません",
      message: `${expected.invoice_no}の明細は期待${calculated.items.length}件、実際${actualItems.length}件です。`,
      resolution: "自動補完せず、既存登録を確認してください。",
    });
    return { state: "invalid", id: actual.id };
  }
  if (JSON.stringify(actualItems) !== JSON.stringify(calculated.items)) {
    checks.push({
      code: "CONTENT_MISMATCH",
      level: "error",
      title: "請求書明細が一致しません",
      message: `${expected.invoice_no}の明細内容が期待値と一致しません。`,
      resolution: "上書きせず、既存登録を確認してください。",
    });
    return { state: "invalid", id: actual.id };
  }

  checks.push({
    code: "INVOICE_REUSABLE",
    level: "passed",
    title: "既存請求書を再利用できます",
    message: `${expected.invoice_no}は期待値と完全一致しています。`,
  });
  return { state: "complete", id: actual.id };
}

function workflowCheck(
  status: string,
  events: TransitionEvent[],
  checks: AutoRegisterPreflightCheck[]
) {
  const approvedToProcessing = events.filter(
    (event) =>
      event.previous_status === "approved" && event.next_status === "processing"
  ).length;
  const processingToWarrantyCreated = events.filter(
    (event) =>
      event.previous_status === "processing" &&
      event.next_status === "warranty_created"
  ).length;

  let valid = true;
  let message = "Workflow statusと履歴は整合しています。";
  if (status === "approved") {
    valid = approvedToProcessing === 0 && processingToWarrantyCreated === 0;
    message = valid
      ? message
      : "statusとstatus_changedイベントが一致しません。";
  } else if (status === "processing") {
    valid = approvedToProcessing === 1 && processingToWarrantyCreated === 0;
    message = valid
      ? message
      : "processingの再開に必要なapproved→processingイベントが1件ではありません。";
  } else if (status === "warranty_created") {
    valid = approvedToProcessing === 1 && processingToWarrantyCreated === 1;
    message = valid
      ? message
      : "warranty_createdに必要なWorkflowイベントが揃っていません。";
  }

  checks.push({
    code: valid ? "WORKFLOW_EVENT_VALID" : "WORKFLOW_EVENT_INCONSISTENT",
    level: valid ? "passed" : "error",
    title: valid ? "Workflow履歴は正常です" : "Workflow履歴が不整合です",
    message,
    resolution: valid
      ? undefined
      : "自動補完せず、statusとstatus_changed履歴を調査してください。",
  });
}

async function buildBasePlan(
  supabase: SupabaseClient,
  batchId: string,
  includePreflightChecks: boolean
) {
  const checks: AutoRegisterPreflightCheck[] = [];
  const resolvedProducts: AutoRegisterPreflight["resolved"]["products"] = [];
  let resolvedCustomer: AutoRegisterPreflight["resolved"]["billing_customer"] = null;
  let partnerName: string | null = null;
  let expectedCertificateCount = 0;
  let expectedInvoiceCount = 0;

  const { data: batchData, error: batchError } = await supabase
    .from("submission_batches")
    .select(
      `
        id,
        batch_no,
        partner_id,
        target_month,
        status,
        partners (company_name)
      `
    )
    .eq("id", batchId)
    .maybeSingle();

  if (batchError || !batchData) {
    checks.push({
      code: batchError ? "QUERY_FAILED" : "BATCH_NOT_FOUND",
      level: "error",
      title: batchError ? "受付情報を取得できません" : "受付情報が見つかりません",
      message: batchError?.message || "指定された受付情報が存在しません。",
      resolution: "受付IDと通信状態を確認して再実行してください。",
    });
    return {
      checks,
      plan: null,
      values: {
        expected_certificate_count: 0,
        expected_invoice_count: 0,
        resolved: { partner_name: null, billing_customer: null, products: [] },
      },
    };
  }

  const batch = batchData as unknown as BatchData;
  const relation = batch.partners;
  const partner = Array.isArray(relation) ? relation[0] : relation;
  partnerName = clean(partner?.company_name);
  if (!partnerName) {
    checks.push({
      code: "PARTNER_NAME_REQUIRED",
      level: "error",
      title: "提出元会社名を確認できません",
      message: "請求先と販売店名を解決するための提出元会社名がありません。",
      resolution: "提出元マスタの会社名を確認してください。",
    });
  } else if (includePreflightChecks) {
    checks.push({
      code: "PARTNER_RESOLVED",
      level: "passed",
      title: "提出元を確認しました",
      message: partnerName,
    });
  }

  const [rowsResult, productsResult, eventsResult] = await Promise.all([
    supabase
      .from("submission_rows")
      .select(
        `
          id, batch_id, sheet_name, row_number, row_type,
          customer_name, customer_name_kana, postal_code, address_full,
          phone, email, application_date, warranty_start_date, plan_code,
          water_heater_type, manufacturer, model_number, equipment_name,
          quantity, additional_equipment, additional_model_number,
          additional_quantity, warranty_fee, validation_status,
          validation_errors, duplicate_status, duplicate_of_row_id, import_status
        `
      )
      .eq("batch_id", batchId)
      .order("sheet_name", { ascending: true })
      .order("row_number", { ascending: true }),
    supabase
      .from("warranty_products")
      .select("id, product_code, product_name, is_active"),
    supabase
      .from("submission_events")
      .select("id, previous_status, next_status")
      .eq("batch_id", batchId)
      .eq("event_type", "status_changed"),
  ]);

  if (rowsResult.error) {
    checks.push({
      code: "QUERY_FAILED",
      level: "error",
      title: "受付明細を取得できません",
      message: rowsResult.error.message,
      resolution: "通信状態を確認して再実行してください。",
    });
  }
  if (productsResult.error) {
    checks.push({
      code: "QUERY_FAILED",
      level: "error",
      title: "保証商品マスタを取得できません",
      message: productsResult.error.message,
      resolution: "通信状態を確認して再実行してください。",
    });
  }
  if (eventsResult.error) {
    checks.push({
      code: "QUERY_FAILED",
      level: "error",
      title: "Workflow履歴を取得できません",
      message: eventsResult.error.message,
      resolution: "通信状態を確認して再実行してください。",
    });
  } else if (includePreflightChecks) {
    workflowCheck(batch.status, (eventsResult.data || []) as TransitionEvent[], checks);
  }

  if (
    includePreflightChecks &&
    !["approved", "processing", "warranty_created"].includes(batch.status)
  ) {
    checks.push({
      code: "UNSUPPORTED_STATUS",
      level: "error",
      title: "Auto Register対象外の状態です",
      message: `現在の状態は${batch.status}です。`,
      resolution: "受付完了・処理中・保証書作成済の案件で再確認してください。",
    });
  } else if (includePreflightChecks) {
    checks.push({
      code: "STATUS_SUPPORTED",
      level: "passed",
      title: "Auto Register対象の状態です",
      message: `現在の状態は${batch.status}です。`,
    });
  }

  if (rowsResult.error || productsResult.error) {
    checks.push({
      code: "DEPENDENT_CHECKS_UNVERIFIED",
      level: "unverified",
      title: "行・商品・請求先の確認を完了できません",
      message: "前提データの取得に失敗したため、後続項目は未確認です。",
      resolution: "取得エラーを解消して事前確認を再実行してください。",
    });
    return {
      checks,
      plan: null,
      values: {
        expected_certificate_count: 0,
        expected_invoice_count: 0,
        resolved: { partner_name: partnerName, billing_customer: null, products: [] },
      },
    };
  }

  const rows = (rowsResult.data || []) as SubmissionPreflightRow[];
  const products = (productsResult.data || []) as WarrantyProduct[];
  expectedCertificateCount = rows.length;
  expectedInvoiceCount = rows.length > 0 ? 1 : 0;
  if (rows.length === 0) {
    checks.push({
      code: "SUBMISSION_ROWS_REQUIRED",
      level: "error",
      title: "登録対象行がありません",
      message: "登録対象のsubmission_rowsがありません。",
      resolution: "Parser結果を確認してください。",
    });
  } else if (includePreflightChecks) {
    checks.push({
      code: "SUBMISSION_ROWS_FOUND",
      level: "passed",
      title: "登録対象行を確認しました",
      message: `${rows.length}件の保証書と1件の請求書を予定しています。`,
    });
  }

  const duplicateIds = [...new Set(rows.map((row) => row.duplicate_of_row_id).filter(Boolean))] as string[];
  const duplicateSources = new Map<string, DuplicateSource>();
  if (duplicateIds.length > 0) {
    const { data, error } = await supabase
      .from("submission_rows")
      .select("id, sheet_name, row_number, submission_batches(batch_no)")
      .in("id", duplicateIds);
    if (error) {
      checks.push({
        code: "QUERY_FAILED",
        level: "warning",
        title: "重複元を取得できません",
        message: error.message,
        resolution: "重複判定自体は有効です。再確認すると重複元を再取得します。",
      });
    } else {
      for (const source of (data || []) as unknown as DuplicateSource[]) {
        duplicateSources.set(source.id, source);
      }
    }
  }

  const generation = generateSubmissionDocuments(
    {
      id: batch.id,
      batch_no: batch.batch_no,
      partner_id: batch.partner_id,
      partner_name: partnerName || "",
      target_month: batch.target_month,
    },
    rows
  );

  generation.warranty_documents.forEach((document, index) => {
    const row = rows[index];
    for (const issue of document.issues) {
      const field = issueField(issue);
      const currentValue = rowValue(row, field);
      const source = row.duplicate_of_row_id
        ? duplicateSources.get(row.duplicate_of_row_id)
        : undefined;
      const sourceBatch = Array.isArray(source?.submission_batches)
        ? source?.submission_batches[0]
        : source?.submission_batches;
      if (field === "validation_status" && Array.isArray(row.validation_errors)) {
        const validationIssues = row.validation_errors.filter(
          (value): value is { code: string; field?: string | null; message: string } =>
            Boolean(
              value &&
                typeof value === "object" &&
                "code" in value &&
                typeof value.code === "string" &&
                "message" in value &&
                typeof value.message === "string"
            )
        );
        if (validationIssues.length > 0) {
          for (const validationIssue of validationIssues) {
            checks.push({
              code: `ROW_VALIDATION_${validationIssue.code}`,
              level: "error",
              title: "Parser検証エラーがあります",
              message: validationIssue.message,
              row_id: row.id,
              sheet_name: row.sheet_name,
              row_number: row.row_number,
              field: validationIssue.field || "validation_status",
              current_value: currentValue,
              resolution: "元データまたは受付行を修正してから再確認してください。",
            });
          }
          continue;
        }
      }
      checks.push({
        code: issueCode(field, currentValue),
        level: "error",
        title: field === "duplicate_status" ? "重複判定の確認が必要です" : "受付行の修正が必要です",
        message: issue,
        row_id: row.id,
        sheet_name: row.sheet_name,
        row_number: row.row_number,
        field,
        current_value: currentValue,
        resolution:
          field === "duplicate_status"
            ? "重複元と受付内容を確認し、判定を解消してから再確認してください。"
            : "元データまたは受付行を修正してから再確認してください。",
        ...(source
          ? {
              related: {
                batch_no: sourceBatch?.batch_no || null,
                sheet_name: source.sheet_name,
                row_number: source.row_number,
              },
            }
          : {}),
      });
    }
  });

  for (const warning of generation.invoice.warnings) {
    checks.push({
      code: "INVOICE_WARNING",
      level: "warning",
      title: "請求書データに警告があります",
      message: warning,
      resolution: "請求金額を確認してください。",
    });
  }

  let customers: WarrantyCustomer[] = [];
  if (partnerName) {
    const customerResult = await supabase
      .from("warranty_customers")
      .select("id, company_name, contact_name, email")
      .eq("company_name", partnerName);
    if (customerResult.error) {
      checks.push({
        code: "QUERY_FAILED",
        level: "error",
        title: "請求先を取得できません",
        message: customerResult.error.message,
        resolution: "通信状態を確認して再実行してください。",
      });
    } else {
      customers = (customerResult.data || []) as WarrantyCustomer[];
      if (customers.length === 0) {
        checks.push({
          code: "CUSTOMER_NOT_FOUND",
          level: "error",
          title: "請求先が見つかりません",
          message: `会社名「${partnerName}」と完全一致する請求先がありません。`,
          resolution: "請求先マスタの会社名を確認してください。",
        });
      } else if (customers.length > 1) {
        checks.push({
          code: "CUSTOMER_AMBIGUOUS",
          level: "error",
          title: "請求先を一意に特定できません",
          message: `会社名「${partnerName}」と一致する請求先が${customers.length}件あります。`,
          resolution: "請求先マスタの重複を確認してください。",
        });
      } else if (!clean(customers[0].email)) {
        checks.push({
          code: "CUSTOMER_EMAIL_REQUIRED",
          level: "error",
          title: "請求先メールが未設定です",
          message: `${partnerName}の請求先メールが設定されていません。`,
          resolution: "請求先マスタへメールアドレスを設定してください。",
        });
      } else {
        resolvedCustomer = {
          id: customers[0].id,
          company_name: customers[0].company_name,
          contact_name: customers[0].contact_name,
          email_configured: true,
        };
        if (includePreflightChecks) {
          checks.push({
            code: "CUSTOMER_RESOLVED",
            level: "passed",
            title: "請求先を解決しました",
            message: `${customers[0].company_name}${clean(customers[0].contact_name) ? ` / ${clean(customers[0].contact_name)}` : ""}`,
          });
        }
      }
    }
  } else {
    checks.push({
      code: "CUSTOMER_UNVERIFIED",
      level: "unverified",
      title: "請求先を確認できません",
      message: "提出元会社名がないため請求先検索を実行できません。",
      resolution: "提出元会社名を修正して再確認してください。",
    });
  }

  const resolvedIdsByDocument = new Map<string, string[]>();
  for (const document of generation.warranty_documents) {
    const ids: string[] = [];
    document.products.forEach((product, itemIndex) => {
      const active = productCandidates(document, itemIndex, products, true);
      const all = productCandidates(document, itemIndex, products, false);
      const match = active.matches.length === 1 ? active.matches[0] : null;
      resolvedProducts.push({
        row_id: document.source.row_id,
        sheet_name: document.source.sheet_name,
        row_number: document.source.row_number,
        draft_reference: document.draft_reference,
        item_index: itemIndex,
        requested_name: clean(product.equipment_name),
        requested_plan_code: clean(document.warranty.plan_code),
        product_id: match?.id || null,
        product_code: match?.product_code || null,
        product_name: match?.product_name || null,
        resolution: match ? active.resolution : null,
      });

      if (active.matches.length === 1) {
        ids.push(active.matches[0].id);
        if (includePreflightChecks) {
          checks.push({
            code: "PRODUCT_RESOLVED",
            level: "passed",
            title: "保証商品を解決しました",
            message: `${document.draft_reference}: ${active.matches[0].product_name}`,
            row_id: document.source.row_id,
            sheet_name: document.source.sheet_name,
            row_number: document.source.row_number,
          });
        }
      } else {
        const inactiveOnly = active.matches.length === 0 && all.matches.length === 1 && all.matches[0].is_active === false;
        checks.push({
          code: inactiveOnly
            ? "PRODUCT_INACTIVE"
            : active.matches.length > 1
              ? "PRODUCT_AMBIGUOUS"
              : "PRODUCT_NOT_FOUND",
          level: "error",
          title: inactiveOnly
            ? "保証商品が無効です"
            : active.matches.length > 1
              ? "保証商品を一意に特定できません"
              : "保証商品が見つかりません",
          message: `${document.draft_reference}の商品「${clean(product.equipment_name) || clean(document.warranty.plan_code) || "未設定"}」を解決できません。`,
          row_id: document.source.row_id,
          sheet_name: document.source.sheet_name,
          row_number: document.source.row_number,
          field: clean(product.equipment_name) ? "equipment_name" : "plan_code",
          current_value: clean(product.equipment_name) || clean(document.warranty.plan_code),
          resolution: inactiveOnly
            ? "保証商品マスタの有効状態を確認してください。"
            : "商品名または商品コードが一意に一致するようマスタを確認してください。",
        });
      }
    });
    resolvedIdsByDocument.set(document.draft_reference, [...new Set(ids)]);
  }

  const customer = customers.length === 1 && clean(customers[0].email)
    ? customers[0]
    : null;
  const allProductsResolved = generation.warranty_documents.every(
    (document) =>
      (resolvedIdsByDocument.get(document.draft_reference)?.length || 0) > 0 &&
      document.products.every((_, index) => {
        const result = productCandidates(document, index, products, true);
        return result.matches.length === 1;
      })
  );

  let plan: Omit<AutoRegisterRegistrationPlan, "inspection"> | null = null;
  if (
    rows.length > 0 &&
    partnerName &&
    customer &&
    generation.warranty_documents.every((document) => document.generation_status === "ready") &&
    allProductsResolved
  ) {
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
      items: (resolvedIdsByDocument.get(document.draft_reference) || []).map(
        (productId) => ({ product_id: productId, is_enabled: true })
      ),
    }));
    const invoice: CreateWarrantyInvoiceInput = {
      invoice_no: generation.invoice.draft_reference,
      invoice_date: deterministicInvoiceDate(batch.target_month),
      payment_due_date: null,
      subject: generation.invoice.subject,
      bill_to_company_name: partnerName,
      bill_to_name: clean(customer.contact_name),
      bill_to_email: customer.email || "",
      note: `Submission Center ${batch.batch_no}`,
      items: generation.invoice.items.map((item) => ({
        item_name: item.item_name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
    };
    plan = { batch, certificates, invoice };
  }

  return {
    checks,
    plan,
    values: {
      expected_certificate_count: expectedCertificateCount,
      expected_invoice_count: expectedInvoiceCount,
      resolved: {
        partner_name: partnerName,
        billing_customer: resolvedCustomer,
        products: resolvedProducts,
      },
    },
  };
}

export async function runAutoRegisterPreflight(input: {
  supabase: SupabaseClient;
  batchId: string;
}): Promise<AutoRegisterPreflightResult> {
  const base = await buildBasePlan(input.supabase, input.batchId, true);
  if (!base.plan) {
    return {
      preflight: makePreflight(base.checks, base.values),
      registrationPlan: null,
    };
  }

  const certificateInspections: AutoRegisterCertificateInspection[] = [];
  const requireComplete = base.plan.batch.status === "warranty_created";
  for (const certificate of base.plan.certificates) {
    certificateInspections.push(
      await inspectCertificate(
        input.supabase,
        certificate,
        requireComplete,
        base.checks
      )
    );
  }
  const invoiceInspection = await inspectInvoice(
    input.supabase,
    base.plan.invoice,
    requireComplete,
    base.checks
  );
  const registrationPlan: AutoRegisterRegistrationPlan = {
    ...base.plan,
    inspection: {
      certificates: certificateInspections,
      invoice: invoiceInspection,
    },
  };

  return {
    preflight: makePreflight(base.checks, base.values),
    registrationPlan,
  };
}

export async function buildWarrantyFulfillmentExpectation(
  supabase: SupabaseClient,
  batchId: string
): Promise<WarrantyFulfillmentExpectation> {
  const base = await buildBasePlan(supabase, batchId, false);
  if (!base.plan) {
    const failure = base.checks.find(
      (check) => check.level === "error" || check.level === "unverified"
    );
    throw new Error(failure?.message || "保証書の期待値を構築できませんでした");
  }
  return {
    batch: {
      id: base.plan.batch.id,
      batch_no: base.plan.batch.batch_no,
      status: base.plan.batch.status,
    },
    certificates: base.plan.certificates,
  };
}
