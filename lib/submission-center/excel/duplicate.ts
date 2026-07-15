import { createHash } from "node:crypto";

import type {
  DuplicateCheckResult,
  DuplicateComparisonRow,
  ParsedSubmissionRow,
} from "./types";

import {
  normalizeAddressForComparison,
  normalizeCustomerNameForComparison,
  normalizeModelNumber,
  normalizePostalCodeForComparison,
  normalizeProductNameForComparison,
} from "./normalizer";

type DuplicateIdentity = {
  partnerId: string | null;
  customerName: string | null;
  postalCode: string | null;
  address: string | null;
  warrantyStartDate: string | null;
  productName: string | null;
  modelNumber: string | null;
};

type PartialMatchRule = {
  name: string;
  requiredFields: Array<keyof DuplicateIdentity>;
  minimumMatchedFields: number;
  reason: string;
};

const PARTIAL_MATCH_RULES: PartialMatchRule[] = [
  {
    name: "customer_address",
    requiredFields: [
      "partnerId",
      "customerName",
      "address",
    ],
    minimumMatchedFields: 3,
    reason:
      "同じ取引先で購入者名と設置住所が一致しています",
  },
  {
    name: "customer_postal_start_date",
    requiredFields: [
      "partnerId",
      "customerName",
      "postalCode",
      "warrantyStartDate",
    ],
    minimumMatchedFields: 4,
    reason:
      "同じ取引先で購入者名・郵便番号・保証開始日が一致しています",
  },
  {
    name: "customer_product_start_date",
    requiredFields: [
      "partnerId",
      "customerName",
      "productName",
      "warrantyStartDate",
    ],
    minimumMatchedFields: 4,
    reason:
      "同じ取引先で購入者名・加入機器・保証開始日が一致しています",
  },
  {
    name: "address_product_start_date",
    requiredFields: [
      "partnerId",
      "address",
      "productName",
      "warrantyStartDate",
    ],
    minimumMatchedFields: 4,
    reason:
      "同じ取引先で設置住所・加入機器・保証開始日が一致しています",
  },
  {
    name: "customer_model",
    requiredFields: [
      "partnerId",
      "customerName",
      "modelNumber",
    ],
    minimumMatchedFields: 3,
    reason:
      "同じ取引先で購入者名と型番が一致しています",
  },
];

function normalizeIdentityValue(
  field: keyof DuplicateIdentity,
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  switch (field) {
    case "partnerId":
      return value.trim() || null;

    case "customerName":
      return normalizeCustomerNameForComparison(
        value
      );

    case "postalCode":
      return normalizePostalCodeForComparison(
        value
      );

    case "address":
      return normalizeAddressForComparison(value);

    case "warrantyStartDate":
      return value.trim() || null;

    case "productName":
      return normalizeProductNameForComparison(
        value
      );

    case "modelNumber":
      return normalizeModelNumber(value);

    default:
      return value.trim() || null;
  }
}

function createIdentityFromParsedRow(
  row: ParsedSubmissionRow
): DuplicateIdentity {
  return {
    partnerId: normalizeIdentityValue(
      "partnerId",
      row.partnerId
    ),
    customerName: normalizeIdentityValue(
      "customerName",
      row.customerName
    ),
    postalCode: normalizeIdentityValue(
      "postalCode",
      row.postalCode
    ),
    address: normalizeIdentityValue(
      "address",
      row.address
    ),
    warrantyStartDate: normalizeIdentityValue(
      "warrantyStartDate",
      row.warrantyStartDate
    ),
    productName: normalizeIdentityValue(
      "productName",
      row.productName
    ),
    modelNumber: normalizeIdentityValue(
      "modelNumber",
      row.modelNumber
    ),
  };
}

function createIdentityFromComparisonRow(
  row: DuplicateComparisonRow
): DuplicateIdentity {
  return {
    partnerId: normalizeIdentityValue(
      "partnerId",
      row.partnerId
    ),
    customerName: normalizeIdentityValue(
      "customerName",
      row.customerName
    ),
    postalCode: normalizeIdentityValue(
      "postalCode",
      row.postalCode
    ),
    address: normalizeIdentityValue(
      "address",
      row.address
    ),
    warrantyStartDate: normalizeIdentityValue(
      "warrantyStartDate",
      row.warrantyStartDate
    ),
    productName: normalizeIdentityValue(
      "productName",
      row.productName
    ),
    modelNumber: normalizeIdentityValue(
      "modelNumber",
      row.modelNumber
    ),
  };
}

function getHashSource(
  identity: DuplicateIdentity
): string {
  return [
    identity.partnerId || "",
    identity.customerName || "",
    identity.postalCode || "",
    identity.address || "",
    identity.warrantyStartDate || "",
    identity.productName || "",
    identity.modelNumber || "",
  ].join("|");
}

function hasMinimumHashFields(
  identity: DuplicateIdentity
): boolean {
  return Boolean(
    identity.partnerId &&
      identity.customerName &&
      identity.address &&
      identity.warrantyStartDate &&
      identity.productName
  );
}

function getMatchedFields(
  left: DuplicateIdentity,
  right: DuplicateIdentity
): Array<keyof DuplicateIdentity> {
  const fields: Array<
    keyof DuplicateIdentity
  > = [
    "partnerId",
    "customerName",
    "postalCode",
    "address",
    "warrantyStartDate",
    "productName",
    "modelNumber",
  ];

  return fields.filter((field) => {
    const leftValue = left[field];
    const rightValue = right[field];

    if (!leftValue || !rightValue) {
      return false;
    }

    return leftValue === rightValue;
  });
}

function matchesPartialRule(
  rule: PartialMatchRule,
  left: DuplicateIdentity,
  right: DuplicateIdentity
): boolean {
  const matchedRequiredFields =
    rule.requiredFields.filter((field) => {
      const leftValue = left[field];
      const rightValue = right[field];

      if (!leftValue || !rightValue) {
        return false;
      }

      return leftValue === rightValue;
    });

  return (
    matchedRequiredFields.length >=
    rule.minimumMatchedFields
  );
}

function findPartialMatchReasons(
  left: DuplicateIdentity,
  right: DuplicateIdentity
): string[] {
  const reasons: string[] = [];

  for (const rule of PARTIAL_MATCH_RULES) {
    if (
      matchesPartialRule(rule, left, right)
    ) {
      reasons.push(rule.reason);
    }
  }

  return Array.from(new Set(reasons));
}

export function createSubmissionRowHash(
  row: ParsedSubmissionRow
): string | null {
  const identity =
    createIdentityFromParsedRow(row);

  if (!hasMinimumHashFields(identity)) {
    return null;
  }

  return createHash("sha256")
    .update(getHashSource(identity), "utf8")
    .digest("hex");
}

export function applyRowHash(
  row: ParsedSubmissionRow
): ParsedSubmissionRow {
  return {
    ...row,
    rowHash: createSubmissionRowHash(row),
  };
}

export function applyRowHashes(
  rows: ParsedSubmissionRow[]
): ParsedSubmissionRow[] {
  return rows.map(applyRowHash);
}

export function checkDuplicateRow(
  row: ParsedSubmissionRow,
  comparisonRows: DuplicateComparisonRow[]
): DuplicateCheckResult {
  const currentIdentity =
    createIdentityFromParsedRow(row);

  const currentHash =
    row.rowHash ||
    createSubmissionRowHash(row);

  let bestReviewCandidate: {
    rowId: string;
    matchedFields: string[];
    reasons: string[];
    score: number;
  } | null = null;

  for (const comparisonRow of comparisonRows) {
    const comparisonIdentity =
      createIdentityFromComparisonRow(
        comparisonRow
      );

    if (
      !currentIdentity.partnerId ||
      !comparisonIdentity.partnerId ||
      currentIdentity.partnerId !==
        comparisonIdentity.partnerId
    ) {
      continue;
    }

    if (
      currentHash &&
      comparisonRow.rowHash &&
      currentHash === comparisonRow.rowHash
    ) {
      return {
        status: "duplicate",
        duplicateRowId: comparisonRow.id,
        matchedFields: [
          "partnerId",
          "customerName",
          "postalCode",
          "address",
          "warrantyStartDate",
          "productName",
          "modelNumber",
        ],
        reasons: [
          "正規化した加入情報の完全一致を確認しました",
        ],
      };
    }

    const reasons = findPartialMatchReasons(
      currentIdentity,
      comparisonIdentity
    );

    if (reasons.length === 0) {
      continue;
    }

    const matchedFields = getMatchedFields(
      currentIdentity,
      comparisonIdentity
    ).map(String);

    const score = matchedFields.length;

    if (
      !bestReviewCandidate ||
      score > bestReviewCandidate.score
    ) {
      bestReviewCandidate = {
        rowId: comparisonRow.id,
        matchedFields,
        reasons,
        score,
      };
    }
  }

  if (bestReviewCandidate) {
    return {
      status: "needs_review",
      duplicateRowId:
        bestReviewCandidate.rowId,
      matchedFields:
        bestReviewCandidate.matchedFields,
      reasons:
        bestReviewCandidate.reasons,
    };
  }

  return {
    status: "unique",
    duplicateRowId: null,
    matchedFields: [],
    reasons: [],
  };
}

export function applyDuplicateCheckToRow(
  row: ParsedSubmissionRow,
  comparisonRows: DuplicateComparisonRow[]
): ParsedSubmissionRow {
  const rowWithHash = row.rowHash
    ? row
    : applyRowHash(row);

  const result = checkDuplicateRow(
    rowWithHash,
    comparisonRows
  );

  return {
    ...rowWithHash,
    duplicateStatus: result.status,
    duplicateRowId:
      result.duplicateRowId,
  };
}

export function applyDuplicateCheckToRows(
  rows: ParsedSubmissionRow[],
  comparisonRows: DuplicateComparisonRow[]
): ParsedSubmissionRow[] {
  const processedRows:
    ParsedSubmissionRow[] = [];

  const inMemoryComparisonRows = [
    ...comparisonRows,
  ];

  for (const row of rows) {
    const checkedRow =
      applyDuplicateCheckToRow(
        row,
        inMemoryComparisonRows
      );

    processedRows.push(checkedRow);

    inMemoryComparisonRows.push({
      id: `current:${checkedRow.rowIndex}`,
      partnerId: checkedRow.partnerId,
      customerName:
        checkedRow.customerName,
      postalCode: checkedRow.postalCode,
      address: checkedRow.address,
      warrantyStartDate:
        checkedRow.warrantyStartDate,
      productName:
        checkedRow.productName,
      modelNumber:
        checkedRow.modelNumber,
      rowHash: checkedRow.rowHash,
    });
  }

  return processedRows;
}

export function getDuplicateSummary(
  rows: ParsedSubmissionRow[]
): {
  duplicateCount: number;
  needsReviewCount: number;
  uniqueCount: number;
  uncheckedCount: number;
} {
  return rows.reduce(
    (summary, row) => {
      switch (row.duplicateStatus) {
        case "duplicate":
          summary.duplicateCount += 1;
          break;

        case "needs_review":
          summary.needsReviewCount += 1;
          break;

        case "unique":
          summary.uniqueCount += 1;
          break;

        default:
          summary.uncheckedCount += 1;
          break;
      }

      return summary;
    },
    {
      duplicateCount: 0,
      needsReviewCount: 0,
      uniqueCount: 0,
      uncheckedCount: 0,
    }
  );
}