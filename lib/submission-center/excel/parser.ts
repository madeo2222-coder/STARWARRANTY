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

import { applyValidationToRows } from "./validator";

import { readWorkbook } from "./workbook";

export type ParseSubmissionExcelOptions = {
  comparisonRows?: DuplicateComparisonRow[];
};

type ParsedJapaneseAddress = {
  prefecture: string | null;
  city: string | null;
  detail: string | null;
  full: string | null;
};

const JAPANESE_PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

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
  const extension = getFileExtension(originalFilename);

  if (extension !== "xlsx") {
    throw new Error(
      "Excel Parser Engine v1は.xlsx形式のみ対応しています"
    );
  }
}

function normalizeComparisonRows(
  rows: DuplicateComparisonRow[]
): DuplicateComparisonRow[] {
  return rows.filter((row) =>
    Boolean(row.id && row.partnerId)
  );
}

function normalizeAddressText(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\s　]+/g, " ")
    .trim();

  return normalized || null;
}

function parseJapaneseAddress(
  value: string | null
): ParsedJapaneseAddress {
  const full = normalizeAddressText(value);

  if (!full) {
    return {
      prefecture: null,
      city: null,
      detail: null,
      full: null,
    };
  }

  const prefecture =
    JAPANESE_PREFECTURES.find((name) =>
      full.startsWith(name)
    ) || null;

  const afterPrefecture = prefecture
    ? full.slice(prefecture.length).trim()
    : full;

  if (!afterPrefecture) {
    return {
      prefecture,
      city: null,
      detail: null,
      full,
    };
  }

  const municipalityMatch =
    afterPrefecture.match(
      /^(.+?(?:市.+?区|郡.+?[町村]|市|区|町|村))(.*)$/
    );

  if (!municipalityMatch) {
    return {
      prefecture,
      city: null,
      detail: afterPrefecture || null,
      full,
    };
  }

  const city =
    municipalityMatch[1]?.trim() || null;

  const detail =
    municipalityMatch[2]?.trim() || null;

  return {
    prefecture,
    city,
    detail,
    full,
  };
}

export function parsedRowToSubmissionRowInsert(
  row: ParsedSubmissionRow
): SubmissionRowInsert {
  const address = parseJapaneseAddress(row.address);

  return {
    batch_id: row.batchId,

    sheet_name: row.sourceSheet,
    row_number: row.sourceRowNumber,
    row_type: row.submissionType,

    customer_name: row.customerName,
    customer_name_kana: row.customerNameKana,
    postal_code: row.postalCode,

    address_prefecture: address.prefecture,
    address_city: address.city,
    address_detail: address.detail,
    address_full: address.full,

    phone: row.phone,
    email: row.email,

    application_date: row.applicationDate,
    warranty_start_date: row.warrantyStartDate,

    plan_code: row.planCode,

    water_heater_type:
      row.submissionType === "plan"
        ? row.productName
        : null,

    manufacturer: row.manufacturerName,
    model_number: row.modelNumber,

    equipment_name:
      row.submissionType === "individual"
        ? row.productName
        : null,

    quantity: row.quantity,

    additional_equipment:
      row.additionalProductName,

    additional_model_number:
      row.additionalModelNumber,

    additional_quantity:
      row.additionalQuantity,

    warranty_fee:
      row.warrantyFeeExTax ??
      row.calculatedWarrantyFeeExTax,

    row_hash: row.rowHash,

    validation_status:
      row.validationStatus,

    validation_errors:
      row.validationIssues,

    duplicate_status:
      row.duplicateStatus,

    duplicate_of_row_id:
      row.duplicateRowId,

    import_status: "pending",

    raw_data: row.rawData,

    normalized_data: {
      ...row.normalizedData,

      calculated_warranty_fee_ex_tax:
        row.calculatedWarrantyFeeExTax,

      warranty_fee_matches:
        row.warrantyFeeMatches,

      target_month:
        row.targetMonth,

      source_file_id:
        row.fileId,

      partner_id:
        row.partnerId,
    },
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

    const detection =
      detectWorkbookFormat(parsedWorkbook);

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

    const summary = createSummary(checkedRows);

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