import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateWarrantyInvoiceInput } from "@/lib/invoice/register-warranty-invoice";

export type BillingCustomerErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_AUTO_CREATE_AVAILABLE"
  | "CUSTOMER_AMBIGUOUS"
  | "CUSTOMER_EMAIL_REQUIRED"
  | "CUSTOMER_CREATE_FAILED"
  | "CUSTOMER_CREATE_CONFLICT"
  | "CUSTOMER_CREATED_BUT_UNRESOLVED";

export type BillingPartnerSource = {
  id: string;
  company_name: string | null;
  representative_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
};

export type BillingCustomer = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
};

export type BillingCustomerCandidate = {
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string;
};

export type BillingCustomerResolution =
  | {
      state: "resolved";
      code: "CUSTOMER_RESOLVED";
      match: "exact" | "normalized";
      customer: BillingCustomer;
      candidate: null;
      count: 1;
    }
  | {
      state: "auto_create_available";
      code: "CUSTOMER_AUTO_CREATE_AVAILABLE";
      match: null;
      customer: null;
      candidate: BillingCustomerCandidate;
      count: 0;
    }
  | {
      state: "blocked";
      code:
        | "CUSTOMER_NOT_FOUND"
        | "CUSTOMER_AMBIGUOUS"
        | "CUSTOMER_EMAIL_REQUIRED";
      match: "exact" | "normalized" | null;
      customer: BillingCustomer | null;
      candidate: BillingCustomerCandidate | null;
      count: number;
      message: string;
    };

export class BillingCustomerResolutionError extends Error {
  readonly code: Exclude<
    BillingCustomerErrorCode,
    "CUSTOMER_AUTO_CREATE_AVAILABLE"
  >;

  constructor(
    code: Exclude<BillingCustomerErrorCode, "CUSTOMER_AUTO_CREATE_AVAILABLE">,
    message: string
  ) {
    super(message);
    this.name = "BillingCustomerResolutionError";
    this.code = code;
  }
}

function clean(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function normalizeBillingCompanyName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|\(株\)|\(有\)/g, "")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[・･·⋅\-‐‑‒–—―−]+/g, "");
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function buildCandidate(source: BillingPartnerSource): BillingCustomerCandidate | null {
  const companyName = clean(source.company_name);
  if (!companyName) return null;

  return {
    company_name: companyName,
    contact_name: clean(source.contact_name) || clean(source.representative_name),
    email: clean(source.email),
    phone: clean(source.phone),
    postal_code: clean(source.postal_code),
    address: [clean(source.address1), clean(source.address2)]
      .filter(Boolean)
      .join(" ") || null,
    note: "Submission Center Auto Registerにより提出元代理店情報から自動作成",
  };
}

function resolvedOrEmailError(
  customer: BillingCustomer,
  match: "exact" | "normalized"
): BillingCustomerResolution {
  if (!clean(customer.email)) {
    return {
      state: "blocked",
      code: "CUSTOMER_EMAIL_REQUIRED",
      match,
      customer,
      candidate: null,
      count: 1,
      message: `既存請求先「${clean(customer.company_name) || "会社名未設定"}」にメールアドレスがありません。`,
    };
  }

  return {
    state: "resolved",
    code: "CUSTOMER_RESOLVED",
    match,
    customer,
    candidate: null,
    count: 1,
  };
}

export function classifyBillingCustomers(input: {
  source: BillingPartnerSource;
  customers: BillingCustomer[];
}): BillingCustomerResolution {
  const candidate = buildCandidate(input.source);
  if (!candidate) {
    return {
      state: "blocked",
      code: "CUSTOMER_NOT_FOUND",
      match: null,
      customer: null,
      candidate: null,
      count: 0,
      message: "提出元代理店の会社名がないため、請求先を解決できません。",
    };
  }

  const exactMatches = input.customers.filter(
    (customer) => String(customer.company_name ?? "") === candidate.company_name
  );
  if (exactMatches.length === 1) {
    return resolvedOrEmailError(exactMatches[0], "exact");
  }
  if (exactMatches.length > 1) {
    return {
      state: "blocked",
      code: "CUSTOMER_AMBIGUOUS",
      match: "exact",
      customer: null,
      candidate,
      count: exactMatches.length,
      message: `会社名「${candidate.company_name}」と完全一致する請求先が${exactMatches.length}件あります。`,
    };
  }

  const companyKey = normalizeBillingCompanyName(candidate.company_name);
  const normalizedMatches = companyKey
    ? input.customers.filter(
        (customer) =>
          normalizeBillingCompanyName(customer.company_name) === companyKey
      )
    : [];
  if (normalizedMatches.length === 1) {
    return resolvedOrEmailError(normalizedMatches[0], "normalized");
  }
  if (normalizedMatches.length > 1) {
    return {
      state: "blocked",
      code: "CUSTOMER_AMBIGUOUS",
      match: "normalized",
      customer: null,
      candidate,
      count: normalizedMatches.length,
      message: `会社名「${candidate.company_name}」の正規化一致候補が${normalizedMatches.length}件あります。`,
    };
  }

  if (!candidate.email) {
    return {
      state: "blocked",
      code: "CUSTOMER_EMAIL_REQUIRED",
      match: null,
      customer: null,
      candidate,
      count: 0,
      message: `提出元代理店「${candidate.company_name}」に請求・連絡用メールアドレスがありません。`,
    };
  }

  return {
    state: "auto_create_available",
    code: "CUSTOMER_AUTO_CREATE_AVAILABLE",
    match: null,
    customer: null,
    candidate,
    count: 0,
  };
}

async function loadBillingCustomers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("warranty_customers")
    .select("id, company_name, contact_name, email, phone, postal_code, address, note");

  if (error) {
    throw new BillingCustomerResolutionError(
      "CUSTOMER_NOT_FOUND",
      `請求先を取得できませんでした: ${error.message}`
    );
  }
  return (data || []) as BillingCustomer[];
}

export async function resolveBillingCustomer(input: {
  supabase: SupabaseClient;
  source: BillingPartnerSource;
}) {
  return classifyBillingCustomers({
    source: input.source,
    customers: await loadBillingCustomers(input.supabase),
  });
}

export async function ensureBillingCustomer(input: {
  supabase: SupabaseClient;
  source: BillingPartnerSource;
}) {
  const beforeInsert = await resolveBillingCustomer(input);
  if (beforeInsert.state === "resolved") {
    return { customer: beforeInsert.customer, created: false };
  }
  if (beforeInsert.state === "blocked") {
    throw new BillingCustomerResolutionError(
      beforeInsert.code,
      beforeInsert.message
    );
  }

  const expected = beforeInsert.candidate;
  const { data: inserted, error: insertError } = await input.supabase
    .from("warranty_customers")
    .insert(expected)
    .select("id, company_name, contact_name, email, phone, postal_code, address, note")
    .single();

  if (insertError || !inserted) {
    const concurrent = await resolveBillingCustomer(input);
    if (
      concurrent.state === "resolved" &&
      normalizeEmail(concurrent.customer.email) === normalizeEmail(expected.email)
    ) {
      return { customer: concurrent.customer, created: false };
    }
    if (concurrent.code === "CUSTOMER_AMBIGUOUS") {
      throw new BillingCustomerResolutionError(
        "CUSTOMER_CREATE_CONFLICT",
        "請求先の作成中に同じ会社の候補が複数件になりました。手動確認が必要です。"
      );
    }
    throw new BillingCustomerResolutionError(
      "CUSTOMER_CREATE_FAILED",
      insertError?.message || "請求先顧客の作成に失敗しました。"
    );
  }

  const customers = await loadBillingCustomers(input.supabase);
  const expectedKey = normalizeBillingCompanyName(expected.company_name);
  const normalizedMatches = customers.filter(
    (customer) => normalizeBillingCompanyName(customer.company_name) === expectedKey
  );
  if (normalizedMatches.length !== 1) {
    throw new BillingCustomerResolutionError(
      "CUSTOMER_CREATE_CONFLICT",
      `請求先作成後の正規化一致件数が${normalizedMatches.length}件です。手動確認が必要です。`
    );
  }

  const verified = normalizedMatches[0];
  if (
    verified.id !== inserted.id ||
    clean(verified.company_name) !== expected.company_name ||
    normalizeEmail(verified.email) !== normalizeEmail(expected.email)
  ) {
    throw new BillingCustomerResolutionError(
      "CUSTOMER_CREATED_BUT_UNRESOLVED",
      "作成した請求先顧客を期待内容で一意に再取得できませんでした。"
    );
  }

  return { customer: verified, created: true };
}

export async function ensureBillingCustomerForBatch(input: {
  supabase: SupabaseClient;
  batchId: string;
}) {
  const { data, error } = await input.supabase
    .from("submission_batches")
    .select(
      `
        id,
        partners (
          id,
          company_name,
          representative_name,
          contact_name,
          email,
          phone,
          postal_code,
          address1,
          address2
        )
      `
    )
    .eq("id", input.batchId)
    .maybeSingle();

  if (error || !data) {
    throw new BillingCustomerResolutionError(
      "CUSTOMER_NOT_FOUND",
      error?.message || "受付に紐づく提出元代理店を確認できませんでした。"
    );
  }

  const relation = data.partners;
  const source = (Array.isArray(relation) ? relation[0] : relation) as
    | BillingPartnerSource
    | null;
  if (!source) {
    throw new BillingCustomerResolutionError(
      "CUSTOMER_NOT_FOUND",
      "受付に紐づく提出元代理店を確認できませんでした。"
    );
  }

  return ensureBillingCustomer({ supabase: input.supabase, source });
}

export async function verifyBillingCustomerForInvoice(input: {
  supabase: SupabaseClient;
  customerId: string;
  invoice: CreateWarrantyInvoiceInput;
}) {
  const { data, error } = await input.supabase
    .from("warranty_customers")
    .select("id, company_name, contact_name, email, phone, postal_code, address, note")
    .eq("id", input.customerId)
    .maybeSingle();

  if (
    error ||
    !data ||
    clean(data.company_name) !== clean(input.invoice.bill_to_company_name) ||
    clean(data.contact_name) !== clean(input.invoice.bill_to_name) ||
    normalizeEmail(data.email) !== normalizeEmail(input.invoice.bill_to_email)
  ) {
    throw new BillingCustomerResolutionError(
      "CUSTOMER_CREATED_BUT_UNRESOLVED",
      error?.message ||
        "請求書作成前に請求先IDと宛先内容の一致を確認できませんでした。"
    );
  }

  return data as BillingCustomer;
}
