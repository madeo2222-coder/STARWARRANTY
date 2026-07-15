import type {
  ParsedSubmissionRow,
  SpringWaMasterItem,
  ValidationIssue,
  ValidationStatus,
} from "./types";

import {
  normalizeEmail,
  normalizePhone,
  normalizeProductNameForComparison,
} from "./normalizer";

type ValidationContext = {
  masterItems: SpringWaMasterItem[];
};

type ValidationResult = {
  status: ValidationStatus;
  issues: ValidationIssue[];
};

const PLAN_BASE_PRICES: Record<"A" | "B", number> = {
  A: 85_000,
  B: 100_000,
};

const PLAN_ADDITIONAL_PRODUCT_PRICES: Record<string, number> = {
  壁掛けエアコン: 7_000,
  ビルトインエアコン: 10_000,
  温水洗浄便座: 5_000,
  コンロ: 5_000,
  ガスコンロ: 5_000,
  IHコンロ: 5_000,
};

function createIssue(
  row: ParsedSubmissionRow,
  values: {
    code: string;
    field: string | null;
    severity: "warning" | "error";
    message: string;
  }
): ValidationIssue {
  return {
    code: values.code,
    field: values.field,
    severity: values.severity,
    message: values.message,
    sourceSheet: row.sourceSheet,
    sourceRowNumber: row.sourceRowNumber,
  };
}

function hasError(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

function hasWarning(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "warning");
}

function resolveValidationStatus(
  issues: ValidationIssue[]
): ValidationStatus {
  if (hasError(issues)) {
    return "error";
  }

  if (hasWarning(issues)) {
    return "warning";
  }

  return "valid";
}

function isValidIsoDate(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidJapanesePhone(value: string): boolean {
  const normalized = normalizePhone(value);

  if (!normalized) {
    return false;
  }

  return /^0\d{9,10}$/.test(normalized);
}

function getMasterItemMap(
  masterItems: SpringWaMasterItem[]
): Map<string, SpringWaMasterItem> {
  const map = new Map<string, SpringWaMasterItem>();

  for (const item of masterItems) {
    if (!item.normalizedProductName) {
      continue;
    }

    map.set(item.normalizedProductName, item);
  }

  return map;
}

function getMasterItem(
  productName: string | null,
  masterItems: SpringWaMasterItem[]
): SpringWaMasterItem | null {
  if (!productName) {
    return null;
  }

  const normalized =
    normalizeProductNameForComparison(productName);

  if (!normalized) {
    return null;
  }

  return getMasterItemMap(masterItems).get(normalized) || null;
}

function normalizeAdditionalPlanProductName(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize("NFKC")
    .replace(/[\s　・･()（）\-ー―‐－]/g, "")
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("壁掛けエアコン")) {
    return "壁掛けエアコン";
  }

  if (normalized.includes("ビルトインエアコン")) {
    return "ビルトインエアコン";
  }

  if (normalized.includes("温水洗浄便座")) {
    return "温水洗浄便座";
  }

  if (
    normalized.includes("ガスコンロ") ||
    normalized.includes("ihコンロ") ||
    normalized.includes("コンロ")
  ) {
    return "コンロ";
  }

  return value.trim() || null;
}

function calculatePlanWarrantyFee(
  row: ParsedSubmissionRow
): number | null {
  if (!row.planCode) {
    return null;
  }

  const basePrice = PLAN_BASE_PRICES[row.planCode];

  if (!row.additionalProductName) {
    return basePrice;
  }

  const normalizedAdditionalProduct =
    normalizeAdditionalPlanProductName(
      row.additionalProductName
    );

  if (!normalizedAdditionalProduct) {
    return basePrice;
  }

  const additionalUnitPrice =
    PLAN_ADDITIONAL_PRODUCT_PRICES[
      normalizedAdditionalProduct
    ];

  if (!additionalUnitPrice) {
    return null;
  }

  const additionalQuantity =
    row.additionalQuantity ?? 1;

  if (additionalQuantity <= 0) {
    return null;
  }

  return (
    basePrice +
    additionalUnitPrice * additionalQuantity
  );
}

function calculateIndividualWarrantyFee(
  row: ParsedSubmissionRow,
  masterItems: SpringWaMasterItem[]
): number | null {
  if (!row.productName || !row.quantity) {
    return null;
  }

  const masterItem = getMasterItem(
    row.productName,
    masterItems
  );

  if (!masterItem) {
    return null;
  }

  if (row.quantity <= 0) {
    return null;
  }

  return masterItem.unitPriceExTax * row.quantity;
}

function validateCommonFields(
  row: ParsedSubmissionRow
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!row.customerName) {
    issues.push(
      createIssue(row, {
        code: "customer_name_required",
        field: "customerName",
        severity: "error",
        message: "購入者名が入力されていません",
      })
    );
  }

  if (!row.postalCode) {
    issues.push(
      createIssue(row, {
        code: "postal_code_required",
        field: "postalCode",
        severity: "error",
        message: "設置住所の郵便番号が入力されていません",
      })
    );
  } else if (!/^\d{3}-?\d{4}$/.test(row.postalCode)) {
    issues.push(
      createIssue(row, {
        code: "postal_code_invalid",
        field: "postalCode",
        severity: "warning",
        message: "郵便番号の形式を確認してください",
      })
    );
  }

  if (!row.address) {
    issues.push(
      createIssue(row, {
        code: "address_required",
        field: "address",
        severity: "error",
        message: "設置住所が入力されていません",
      })
    );
  }

  if (!row.phone) {
    issues.push(
      createIssue(row, {
        code: "phone_required",
        field: "phone",
        severity: "warning",
        message: "電話番号が入力されていません",
      })
    );
  } else if (!isValidJapanesePhone(row.phone)) {
    issues.push(
      createIssue(row, {
        code: "phone_invalid",
        field: "phone",
        severity: "warning",
        message: "電話番号の桁数または形式を確認してください",
      })
    );
  }

  if (row.email) {
    const normalizedEmail = normalizeEmail(row.email);

    if (
      !normalizedEmail ||
      !isValidEmailFormat(normalizedEmail)
    ) {
      issues.push(
        createIssue(row, {
          code: "email_invalid",
          field: "email",
          severity: "warning",
          message: "メールアドレスの形式を確認してください",
        })
      );
    }
  }

  if (!row.applicationDate) {
    issues.push(
      createIssue(row, {
        code: "application_date_required",
        field: "applicationDate",
        severity: "warning",
        message: "申込日が入力されていません",
      })
    );
  } else if (!isValidIsoDate(row.applicationDate)) {
    issues.push(
      createIssue(row, {
        code: "application_date_invalid",
        field: "applicationDate",
        severity: "error",
        message: "申込日の形式が正しくありません",
      })
    );
  }

  if (!row.warrantyStartDate) {
    issues.push(
      createIssue(row, {
        code: "warranty_start_date_required",
        field: "warrantyStartDate",
        severity: "error",
        message: "保証開始日が入力されていません",
      })
    );
  } else if (!isValidIsoDate(row.warrantyStartDate)) {
    issues.push(
      createIssue(row, {
        code: "warranty_start_date_invalid",
        field: "warrantyStartDate",
        severity: "error",
        message: "保証開始日の形式が正しくありません",
      })
    );
  }

  if (
    row.applicationDate &&
    row.warrantyStartDate &&
    isValidIsoDate(row.applicationDate) &&
    isValidIsoDate(row.warrantyStartDate)
  ) {
    const applicationDate = new Date(
      `${row.applicationDate}T00:00:00.000Z`
    );

    const warrantyStartDate = new Date(
      `${row.warrantyStartDate}T00:00:00.000Z`
    );

    if (warrantyStartDate < applicationDate) {
      issues.push(
        createIssue(row, {
          code: "warranty_start_before_application",
          field: "warrantyStartDate",
          severity: "warning",
          message:
            "保証開始日が申込日より前になっています",
        })
      );
    }
  }

  return issues;
}

function validatePlanRow(
  row: ParsedSubmissionRow
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!row.planCode) {
    issues.push(
      createIssue(row, {
        code: "plan_code_required",
        field: "planCode",
        severity: "error",
        message:
          "プラン区分がAまたはBで入力されていません",
      })
    );
  }

  if (!row.productName) {
    issues.push(
      createIssue(row, {
        code: "water_heater_required",
        field: "productName",
        severity: "error",
        message: "給湯器種類が入力されていません",
      })
    );
  }

  if (
    row.additionalProductName &&
    !row.additionalQuantity
  ) {
    issues.push(
      createIssue(row, {
        code: "additional_quantity_required",
        field: "additionalQuantity",
        severity: "error",
        message:
          "追加機器が入力されていますが台数がありません",
      })
    );
  }

  if (
    !row.additionalProductName &&
    row.additionalQuantity
  ) {
    issues.push(
      createIssue(row, {
        code: "additional_product_required",
        field: "additionalProductName",
        severity: "error",
        message:
          "追加台数が入力されていますが追加機器がありません",
      })
    );
  }

  if (row.additionalProductName) {
    const normalized =
      normalizeAdditionalPlanProductName(
        row.additionalProductName
      );

    if (
      !normalized ||
      !PLAN_ADDITIONAL_PRODUCT_PRICES[normalized]
    ) {
      issues.push(
        createIssue(row, {
          code: "additional_product_unknown",
          field: "additionalProductName",
          severity: "warning",
          message:
            "追加機器が対応料金表に存在しません",
        })
      );
    }
  }

  const calculatedFee =
    calculatePlanWarrantyFee(row);

  if (calculatedFee === null) {
    issues.push(
      createIssue(row, {
        code: "warranty_fee_calculation_failed",
        field: "warrantyFeeExTax",
        severity: "warning",
        message:
          "プラン保証料を再計算できませんでした",
      })
    );

    return issues;
  }

  if (row.warrantyFeeExTax === null) {
    issues.push(
      createIssue(row, {
        code: "warranty_fee_missing",
        field: "warrantyFeeExTax",
        severity: "warning",
        message:
          "Excel上の保証料が取得できませんでした",
      })
    );

    return issues;
  }

  if (row.warrantyFeeExTax !== calculatedFee) {
    issues.push(
      createIssue(row, {
        code: "warranty_fee_mismatch",
        field: "warrantyFeeExTax",
        severity: "warning",
        message:
          `Excel保証料${row.warrantyFeeExTax.toLocaleString(
            "ja-JP"
          )}円と再計算額${calculatedFee.toLocaleString(
            "ja-JP"
          )}円が一致しません`,
      })
    );
  }

  return issues;
}

function validateIndividualRow(
  row: ParsedSubmissionRow,
  context: ValidationContext
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!row.manufacturerName) {
    issues.push(
      createIssue(row, {
        code: "manufacturer_name_required",
        field: "manufacturerName",
        severity: "warning",
        message: "メーカー名が入力されていません",
      })
    );
  }

  if (!row.modelNumber) {
    issues.push(
      createIssue(row, {
        code: "model_number_required",
        field: "modelNumber",
        severity: "warning",
        message: "品番・型番が入力されていません",
      })
    );
  }

  if (!row.productName) {
    issues.push(
      createIssue(row, {
        code: "product_name_required",
        field: "productName",
        severity: "error",
        message: "保証加入機器が入力されていません",
      })
    );
  }

  if (!row.quantity || row.quantity <= 0) {
    issues.push(
      createIssue(row, {
        code: "quantity_required",
        field: "quantity",
        severity: "error",
        message: "加入機器の台数が入力されていません",
      })
    );
  }

  const masterItem = getMasterItem(
    row.productName,
    context.masterItems
  );

  if (row.productName && !masterItem) {
    issues.push(
      createIssue(row, {
        code: "product_not_found_in_master",
        field: "productName",
        severity: "error",
        message:
          "保証加入機器がマスタに登録されていません",
      })
    );
  }

  const hasAnyAdditionalValue = Boolean(
    row.additionalProductName ||
      row.additionalModelNumber ||
      row.additionalQuantity
  );

  if (hasAnyAdditionalValue) {
    if (!row.additionalProductName) {
      issues.push(
        createIssue(row, {
          code: "additional_product_required",
          field: "additionalProductName",
          severity: "error",
          message:
            "追加機器の情報がありますが機器名がありません",
        })
      );
    }

    if (!row.additionalQuantity) {
      issues.push(
        createIssue(row, {
          code: "additional_quantity_required",
          field: "additionalQuantity",
          severity: "error",
          message:
            "追加機器の情報がありますが台数がありません",
        })
      );
    }

    issues.push(
      createIssue(row, {
        code: "individual_additional_product_review",
        field: "additionalProductName",
        severity: "warning",
        message:
          "個別加入の追加機器は現行Excelの保証料数式に含まれないため、本部確認が必要です",
      })
    );
  }

  const calculatedFee =
    calculateIndividualWarrantyFee(
      row,
      context.masterItems
    );

  if (calculatedFee === null) {
    issues.push(
      createIssue(row, {
        code: "warranty_fee_calculation_failed",
        field: "warrantyFeeExTax",
        severity: "warning",
        message:
          "マスタを使用した保証料の再計算ができませんでした",
      })
    );

    return issues;
  }

  if (row.warrantyFeeExTax === null) {
    issues.push(
      createIssue(row, {
        code: "warranty_fee_missing",
        field: "warrantyFeeExTax",
        severity: "warning",
        message:
          "Excel上の保証料が取得できませんでした",
      })
    );

    return issues;
  }

  if (row.warrantyFeeExTax !== calculatedFee) {
    issues.push(
      createIssue(row, {
        code: "warranty_fee_mismatch",
        field: "warrantyFeeExTax",
        severity: "warning",
        message:
          `Excel保証料${row.warrantyFeeExTax.toLocaleString(
            "ja-JP"
          )}円とマスタ再計算額${calculatedFee.toLocaleString(
            "ja-JP"
          )}円が一致しません`,
      })
    );
  }

  return issues;
}

export function calculateWarrantyFee(
  row: ParsedSubmissionRow,
  masterItems: SpringWaMasterItem[]
): number | null {
  if (row.submissionType === "plan") {
    return calculatePlanWarrantyFee(row);
  }

  return calculateIndividualWarrantyFee(
    row,
    masterItems
  );
}

export function validateSubmissionRow(
  row: ParsedSubmissionRow,
  context: ValidationContext
): ValidationResult {
  const issues = [
    ...validateCommonFields(row),
    ...(row.submissionType === "plan"
      ? validatePlanRow(row)
      : validateIndividualRow(row, context)),
  ];

  return {
    status: resolveValidationStatus(issues),
    issues,
  };
}

export function applyValidationToRow(
  row: ParsedSubmissionRow,
  context: ValidationContext
): ParsedSubmissionRow {
  const calculatedWarrantyFeeExTax =
    calculateWarrantyFee(
      row,
      context.masterItems
    );

  const validation = validateSubmissionRow(
    {
      ...row,
      calculatedWarrantyFeeExTax,
      warrantyFeeMatches:
        calculatedWarrantyFeeExTax !== null &&
        row.warrantyFeeExTax !== null
          ? calculatedWarrantyFeeExTax ===
            row.warrantyFeeExTax
          : null,
    },
    context
  );

  return {
    ...row,
    calculatedWarrantyFeeExTax,
    warrantyFeeMatches:
      calculatedWarrantyFeeExTax !== null &&
      row.warrantyFeeExTax !== null
        ? calculatedWarrantyFeeExTax ===
          row.warrantyFeeExTax
        : null,
    validationStatus: validation.status,
    validationIssues: validation.issues,
  };
}

export function applyValidationToRows(
  rows: ParsedSubmissionRow[],
  context: ValidationContext
): ParsedSubmissionRow[] {
  return rows.map((row) =>
    applyValidationToRow(row, context)
  );
}