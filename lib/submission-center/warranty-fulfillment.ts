import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AutoRegisterError,
  buildWarrantyFulfillmentExpectation,
} from "@/lib/submission-center/auto-register";

export type WarrantyFulfillmentCertificate = {
  id: string;
  certificate_number: string;
  customer_name: string;
  postal_code: string | null;
  address: string;
  product_names: string[];
};

export type WarrantyFulfillmentResult = {
  ready: boolean;
  expected_count: number;
  matched_count: number;
  certificates: WarrantyFulfillmentCertificate[];
  errors: string[];
};

type ActualCertificate = {
  id: string;
  certificate_no: string;
  customer_name: string;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  start_date: string;
  warranty_certificate_items:
    | {
        product_id: string;
        is_enabled: boolean;
        warranty_products:
          | { product_name: string | null }
          | { product_name: string | null }[]
          | null;
      }[]
    | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function sameText(actual: unknown, expected: unknown) {
  return clean(actual) === clean(expected);
}

function itemKey(item: { product_id: string; is_enabled: boolean }) {
  return `${item.product_id}:${item.is_enabled ? "1" : "0"}`;
}

function productName(item: ActualCertificate["warranty_certificate_items"] extends (infer T)[] | null ? T : never) {
  const relation = item.warranty_products;
  const product = Array.isArray(relation) ? relation[0] : relation;
  return clean(product?.product_name);
}

export async function inspectWarrantyFulfillment(input: {
  supabase: SupabaseClient;
  batchId: string;
  requireStatus?: "warranty_created";
}): Promise<WarrantyFulfillmentResult> {
  let expectation;
  try {
    expectation = await buildWarrantyFulfillmentExpectation(
      input.supabase,
      input.batchId
    );
  } catch (error) {
    const message =
      error instanceof AutoRegisterError || error instanceof Error
        ? error.message
        : "保証書の期待値を構築できませんでした";
    return {
      ready: false,
      expected_count: 0,
      matched_count: 0,
      certificates: [],
      errors: [message],
    };
  }

  const errors: string[] = [];
  const certificates: WarrantyFulfillmentCertificate[] = [];
  const allowedStatuses = [
    "warranty_created",
    "printed",
    "mailed",
    "completed",
  ];

  if (!allowedStatuses.includes(expectation.batch.status)) {
    errors.push(
      `受付statusが保証書処理段階ではありません: ${expectation.batch.status}`
    );
  }
  if (
    input.requireStatus &&
    expectation.batch.status !== input.requireStatus
  ) {
    errors.push(
      `印刷済みへ更新できるのはstatusが${input.requireStatus}の場合だけです`
    );
  }
  if (expectation.certificates.length === 0) {
    errors.push("印刷対象の保証書がありません");
  }

  for (const expected of expectation.certificates) {
    const { data, error } = await input.supabase
      .from("warranty_certificates")
      .select(
        `
          id,
          certificate_no,
          customer_name,
          postal_code,
          address1,
          address2,
          address3,
          start_date,
          warranty_certificate_items (
            product_id,
            is_enabled,
            warranty_products (product_name)
          )
        `
      )
      .eq("certificate_no", expected.certificate_no);

    if (error) {
      errors.push(`${expected.certificate_no}の取得に失敗しました: ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) {
      errors.push(`${expected.certificate_no}が登録されていません`);
      continue;
    }
    if (data.length !== 1) {
      errors.push(`${expected.certificate_no}が複数登録されています`);
      continue;
    }

    const actual = data[0] as unknown as ActualCertificate;
    const headerMatches =
      sameText(actual.customer_name, expected.customer_name) &&
      sameText(actual.postal_code, expected.postal_code) &&
      sameText(actual.address1, expected.address1) &&
      sameText(actual.address2, expected.address2) &&
      sameText(actual.address3, expected.address3) &&
      sameText(actual.start_date, expected.start_date);
    if (!headerMatches) {
      errors.push(`${expected.certificate_no}のヘッダー内容が一致しません`);
      continue;
    }

    const actualItems = actual.warranty_certificate_items || [];
    const actualKeys = actualItems.map(itemKey).sort();
    const expectedKeys = expected.items.map(itemKey).sort();
    if (actualKeys.length < expectedKeys.length) {
      errors.push(`${expected.certificate_no}の保証書明細が不足しています`);
      continue;
    }
    if (actualKeys.length > expectedKeys.length) {
      errors.push(`${expected.certificate_no}に余分な保証書明細があります`);
      continue;
    }
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      errors.push(`${expected.certificate_no}の商品IDが一致しません`);
      continue;
    }

    certificates.push({
      id: actual.id,
      certificate_number: actual.certificate_no,
      customer_name: actual.customer_name,
      postal_code: actual.postal_code,
      address: [actual.address1, actual.address2, actual.address3]
        .map(clean)
        .filter(Boolean)
        .join(" "),
      product_names: actualItems
        .filter((item) => item.is_enabled)
        .map(productName)
        .filter(Boolean),
    });
  }

  return {
    ready:
      errors.length === 0 &&
      expectation.certificates.length > 0 &&
      certificates.length === expectation.certificates.length,
    expected_count: expectation.certificates.length,
    matched_count: certificates.length,
    certificates,
    errors,
  };
}

export function certificateNumbersMatch(
  actual: unknown,
  expected: string[]
) {
  if (!Array.isArray(actual) || !actual.every((value) => typeof value === "string")) {
    return false;
  }
  const normalized = actual.map((value) => value.trim());
  if (normalized.some((value) => !value)) return false;
  if (new Set(normalized).size !== normalized.length) return false;
  return (
    normalized.length === expected.length &&
    JSON.stringify([...normalized].sort()) === JSON.stringify([...expected].sort())
  );
}
