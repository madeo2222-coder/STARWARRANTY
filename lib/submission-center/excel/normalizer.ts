import type {
  CellPrimitive,
  NormalizedSubmissionData,
  SpringWaPlanCode,
} from "./types";

function toHalfWidthDigits(value: string): string {
  return value.replace(/[０-９]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0)
  );
}

function toHalfWidthAscii(value: string): string {
  return value.replace(/[！-～]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0)
  );
}

export function normalizeText(
  value: CellPrimitive | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return formatDateToIso(value);
  }

  const normalized = String(value)
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t　]+/g, " ")
    .trim();

  return normalized || null;
}

export function normalizeCompactText(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/[\s　\r\n\t]+/g, "");

  return compact || null;
}

export function normalizeCustomerName(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/^(購入者名|氏名|お名前)[:：]?/i, "")
    .replace(/[ \t　]+/g, " ")
    .trim() || null;
}

export function normalizeCustomerNameForComparison(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeCustomerName(value);

  if (!normalized) {
    return null;
  }

  const compact = normalized
    .normalize("NFKC")
    .replace(/[\s　・･,，.．\-ー]/g, "")
    .toLowerCase();

  return compact || null;
}

export function normalizeKana(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const withoutLabel = normalized
    .replace(/^(フリガナ|ふりがな|カナ)[:：]?/i, "")
    .trim();

  if (!withoutLabel) {
    return null;
  }

  return withoutLabel
    .normalize("NFKC")
    .replace(/[ \t　]+/g, "")
    .replace(/[ぁ-ゖ]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) + 0x60)
    )
    .trim() || null;
}

export function normalizePostalCode(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const digits = toHalfWidthDigits(normalized)
    .replace(/[〒\s　\-ー―‐－]/g, "")
    .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return digits;
}

export function normalizePostalCodeForComparison(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizePostalCode(value);

  if (!normalized) {
    return null;
  }

  return normalized.replace(/\D/g, "") || null;
}

export function normalizeAddress(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/\n+/g, " ")
    .replace(/[ \t　]+/g, " ")
    .replace(/\s*([丁目番地号\-ー―‐－])\s*/g, "$1")
    .trim() || null;
}

export function normalizeAddressForComparison(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeAddress(value);

  if (!normalized) {
    return null;
  }

  const compared = toHalfWidthAscii(
    toHalfWidthDigits(normalized.normalize("NFKC"))
  )
    .replace(/[ \t　\r\n]/g, "")
    .replace(/[ー―‐－]/g, "-")
    .replace(/[丁目番地号]/g, "-")
    .replace(/-+/g, "-")
    .replace(/[,.，．]/g, "")
    .toLowerCase()
    .trim();

  return compared || null;
}

export function normalizePhone(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const halfWidth = toHalfWidthDigits(normalized)
    .replace(/[^\d+]/g, "")
    .trim();

  if (!halfWidth) {
    return null;
  }

  if (halfWidth.startsWith("+81")) {
    const domestic = `0${halfWidth.slice(3)}`;
    return domestic || null;
  }

  return halfWidth;
}

export function normalizeEmail(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const email = normalized
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  return email || null;
}

export function normalizeProductName(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/[ \t　]+/g, " ")
    .replace(/\s*（\s*/g, "（")
    .replace(/\s*）\s*/g, "）")
    .trim() || null;
}

export function normalizeProductNameForComparison(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeProductName(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .normalize("NFKC")
    .replace(/[\s　・･()（）\-ー―‐－]/g, "")
    .toLowerCase() || null;
}

export function normalizeManufacturerName(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return normalized.replace(/[ \t　]+/g, " ").trim() || null;
}

export function normalizeModelNumber(
  value: CellPrimitive | undefined
): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return toHalfWidthAscii(normalized.normalize("NFKC"))
    .replace(/[ \t　]+/g, "")
    .replace(/[ー―‐－]/g, "-")
    .toUpperCase()
    .trim() || null;
}

export function normalizePlanCode(
  value: CellPrimitive | undefined
): SpringWaPlanCode | null {
  const normalized = normalizeCompactText(value);

  if (!normalized) {
    return null;
  }

  const upper = toHalfWidthAscii(normalized)
    .replace(/^プラン/i, "")
    .toUpperCase();

  if (upper === "A") {
    return "A";
  }

  if (upper === "B") {
    return "B";
  }

  return null;
}

export function normalizePositiveInteger(
  value: CellPrimitive | undefined
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    const integer = Math.trunc(value);

    return integer > 0 ? integer : null;
  }

  const normalized = toHalfWidthDigits(String(value))
    .replace(/[,\s　台個件]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const integer = Math.trunc(parsed);

  return integer > 0 ? integer : null;
}

export function normalizeNonNegativeInteger(
  value: CellPrimitive | undefined
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    const integer = Math.trunc(value);

    return integer >= 0 ? integer : null;
  }

  const normalized = toHalfWidthDigits(String(value))
    .replace(/[,\s　台個件]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const integer = Math.trunc(parsed);

  return integer >= 0 ? integer : null;
}

export function normalizeMoney(
  value: CellPrimitive | undefined
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return Math.round(value);
  }

  const normalized = toHalfWidthDigits(String(value))
    .replace(/[,\s　円￥¥税別税込]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed)
    ? Math.round(parsed)
    : null;
}

export function formatDateToIso(value: Date): string | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeDate(
  value: CellPrimitive | undefined
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return formatDateToIso(value);
  }

  if (typeof value === "number") {
    const excelEpochOffset = 25569;
    const millisecondsPerDay = 24 * 60 * 60 * 1000;

    const date = new Date(
      (value - excelEpochOffset) * millisecondsPerDay
    );

    return formatDateToIso(date);
  }

  const normalized = toHalfWidthDigits(
    String(value).normalize("NFKC").trim()
  );

  const match = normalized.match(
    /^(\d{4})[年\/.\-](\d{1,2})[月\/.\-](\d{1,2})日?$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return formatDateToIso(date);
}

export function createNormalizedSubmissionData(values: {
  customerName: CellPrimitive | undefined;
  customerNameKana: CellPrimitive | undefined;
  postalCode: CellPrimitive | undefined;
  address: CellPrimitive | undefined;
  phone: CellPrimitive | undefined;
  email: CellPrimitive | undefined;
  applicationDate: CellPrimitive | undefined;
  warrantyStartDate: CellPrimitive | undefined;
  planCode: CellPrimitive | undefined;
  manufacturerName: CellPrimitive | undefined;
  productName: CellPrimitive | undefined;
  modelNumber: CellPrimitive | undefined;
  quantity: CellPrimitive | undefined;
  additionalProductName: CellPrimitive | undefined;
  additionalModelNumber: CellPrimitive | undefined;
  additionalQuantity: CellPrimitive | undefined;
  warrantyFeeExTax: CellPrimitive | undefined;
}): NormalizedSubmissionData {
  return {
    customer_name: normalizeCustomerName(values.customerName),
    customer_name_comparison:
      normalizeCustomerNameForComparison(values.customerName),

    customer_name_kana:
      normalizeKana(values.customerNameKana),

    postal_code: normalizePostalCode(values.postalCode),
    postal_code_comparison:
      normalizePostalCodeForComparison(values.postalCode),

    address: normalizeAddress(values.address),
    address_comparison:
      normalizeAddressForComparison(values.address),

    phone: normalizePhone(values.phone),
    email: normalizeEmail(values.email),

    application_date:
      normalizeDate(values.applicationDate),

    warranty_start_date:
      normalizeDate(values.warrantyStartDate),

    plan_code: normalizePlanCode(values.planCode),

    manufacturer_name:
      normalizeManufacturerName(values.manufacturerName),

    product_name:
      normalizeProductName(values.productName),

    product_name_comparison:
      normalizeProductNameForComparison(values.productName),

    model_number:
      normalizeModelNumber(values.modelNumber),

    quantity:
      normalizePositiveInteger(values.quantity),

    additional_product_name:
      normalizeProductName(values.additionalProductName),

    additional_product_name_comparison:
      normalizeProductNameForComparison(
        values.additionalProductName
      ),

    additional_model_number:
      normalizeModelNumber(values.additionalModelNumber),

    additional_quantity:
      normalizePositiveInteger(values.additionalQuantity),

    warranty_fee_ex_tax:
      normalizeMoney(values.warrantyFeeExTax),
  };
}