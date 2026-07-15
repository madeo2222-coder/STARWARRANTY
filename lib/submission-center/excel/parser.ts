import type {
  DuplicateComparisonRow,
  ParsedSubmissionRow,
  SubmissionParseResult,
  SubmissionParseSummary,
  SubmissionParserContext,
  SubmissionRowInsert,
} from "./types";

import { detectWorkbookFormat } from "./detector";

import {
  applyDuplicateCheckToRows,
  applyRowHashes,
} from "./duplicate";

import { parseSpringWaWorkbook } from "./springwa";

import {
  applyValidationToRows,
} from "./validator";

import { readWorkbook } from "./workbook";

export type ParseSubmissionExcelOptions = {
  comparisonRows?: DuplicateComparisonRow[];
};

function createEmptySummary(): SubmissionParseSummary {
  return {
    totalCount: 0,
    validCount: 0,
    warningCount: 0,
    errorCount: 0,
    duplicateCount: 0,
    needsReviewCount: 0,
  };
}

function createSummary(
  rows: ParsedSubmissionRow[]
): SubmissionParseSummary {
  return rows.reduce<SubmissionParseSummary>(
    (summary, row) => {
      summary.totalCount += 1;

      switch (row.validationStatus) {
        case "valid":
          summary.validCount += 1;
          break;

        case "warning":
          summary.warningCount += 1;
          break;

        case "error":
          summary.errorCount += 1;
          break;
      }

      switch (row.duplicateStatus) {
        case "duplicate":
          summary.duplicateCount += 1;
          break;

        case "needs_review":
          summary.needsReviewCount += 1;
          break;
      }

      return summary;
    },
    createEmptySummary()
  );
}

function getFatalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Excelの解析中に不明なエラーが発生しました";
}

function validateParserContext(
  context: SubmissionParserContext
): void {
  if (!context.batchId.trim()) {
    throw new Error("提出バッチIDが指定されていません");
  }

  if (!context.partnerId.trim()) {
    throw new Error("取引先IDが指定されていません");
  }

  if (!context.targetMonth.trim()) {
    throw new Error("対象月が指定されていません");
  }

  if (!context.originalFilename.trim()) {
    throw new Error("元ファイル名が指定されていません");
  }
}

function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return filename
    .slice(lastDotIndex + 1)
    .trim()
    .toLowerCase();
}

function validateParserFileExtension(
  originalFilename: string
): void {
  const extension = getFileExtension(
    originalFilename
  );

  if (extension !== "xlsx") {
    throw new Error(
      "Excel Parser Engine v1は.xlsx形式のみ対応しています"
    );
  }
}

function normalizeComparisonRows(
  rows: DuplicateComparisonRow[]
): DuplicateComparisonRow[] {
  return rows.filter((row) => {
    return Boolean(
      row.id &&
        row.partnerId
    );
  });
}

export function parsedRowToSubmissionRowInsert(
  row: ParsedSubmissionRow
): SubmissionRowInsert {
  return {
    batch_id: row.batchId,
    file_id: row.fileId,
    partner_id: row.partnerId,

    source_sheet: row.sourceSheet,
    source_row_number: row.sourceRowNumber,
    submission_type: row.submissionType,

    customer_name: row.customerName,
    customer_name_kana: row.customerNameKana,
    postal_code: row.postalCode,
    address: row.address,
    phone: row.phone,
    email: row.email,

    application_date: row.applicationDate,
    warranty_start_date:
      row.warrantyStartDate,

    plan_code: row.planCode,
    manufacturer_name:
      row.manufacturerName,

    product_name: row.productName,
    model_number: row.modelNumber,
    quantity: row.quantity,

    additional_product_name:
      row.additionalProductName,
    additional_model_number:
      row.additionalModelNumber,
    additional_quantity:
      row.additionalQuantity,

    warranty_fee_ex_tax:
      row.warrantyFeeExTax,
    calculated_warranty_fee_ex_tax:
      row.calculatedWarrantyFeeExTax,
    warranty_fee_matches:
      row.warrantyFeeMatches,

    raw_data: row.rawData,
    normalized_data: row.normalizedData,

    row_hash: row.rowHash,

    validation_status:
      row.validationStatus,
    validation_issues:
      row.validationIssues,

    duplicate_status:
      row.duplicateStatus,
    duplicate_row_id:
      row.duplicateRowId,
  };
}

export function parsedRowsToSubmissionRowInserts(
  rows: ParsedSubmissionRow[]
): SubmissionRowInsert[] {
  return rows.map(
    parsedRowToSubmissionRowInsert
  );
}

export function parseSubmissionExcel(
  buffer: ArrayBuffer | Uint8Array | Buffer,
  context: SubmissionParserContext,
  options: ParseSubmissionExcelOptions = {}
): SubmissionParseResult {
  try {
    validateParserContext(context);

    validateParserFileExtension(
      context.originalFilename
    );

    const parsedWorkbook = readWorkbook(buffer);

    const detection = detectWorkbookFormat(
      parsedWorkbook
    );

    if (detection.format !== "springwa") {
      return {
        success: false,
        format: detection.format,
        detection,

        targetMonth: null,

        rows: [],
        masterItems: [],

        summary: createEmptySummary(),

        workbookWarnings: [],
        fatalErrors: [
          "対応済みの春和建業Excelフォーマットを確認できませんでした",
        ],
      };
    }

    const springWaResult =
      parseSpringWaWorkbook(
        parsedWorkbook,
        context
      );

    const validatedRows =
      applyValidationToRows(
        springWaResult.rows,
        {
          masterItems:
            springWaResult.masterItems,
        }
      );

    const rowsWithHashes =
      applyRowHashes(validatedRows);

    const comparisonRows =
      normalizeComparisonRows(
        options.comparisonRows || []
      );

    const checkedRows =
      applyDuplicateCheckToRows(
        rowsWithHashes,
        comparisonRows
      );

    const summary =
      createSummary(checkedRows);

    const workbookWarnings = [
      ...springWaResult.warnings,
    ];

    if (summary.errorCount > 0) {
      workbookWarnings.push(
        `${summary.errorCount}件の加入データに取込を止める必要がある不備があります`
      );
    }

    if (summary.warningCount > 0) {
      workbookWarnings.push(
        `${summary.warningCount}件の加入データに本部確認が必要な警告があります`
      );
    }

    if (summary.duplicateCount > 0) {
      workbookWarnings.push(
        `${summary.duplicateCount}件の完全一致重複を検出しました`
      );
    }

    if (summary.needsReviewCount > 0) {
      workbookWarnings.push(
        `${summary.needsReviewCount}件の重複候補を検出しました`
      );
    }

    return {
      success: true,
      format: "springwa",
      detection,

      targetMonth:
        springWaResult.targetMonth,

      rows: checkedRows,
      masterItems:
        springWaResult.masterItems,

      summary,

      workbookWarnings:
        Array.from(
          new Set(workbookWarnings)
        ),

      fatalErrors: [],
    };
  } catch (error) {
    return {
      success: false,
      format: "unknown",

      detection: {
        format: "unknown",
        confidence: 0,
        detectedSheets: [],
        reasons: [],
      },

      targetMonth: null,

      rows: [],
      masterItems: [],

      summary: createEmptySummary(),

      workbookWarnings: [],
      fatalErrors: [
        getFatalErrorMessage(error),
      ],
    };
  }
}