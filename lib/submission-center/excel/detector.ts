import type {
  SubmissionSheetType,
  WorkbookDetectionResult,
} from "./types";

import {
  getCellTextByColumnName,
  getSheetByName,
  getSheetNames,
  type ParsedWorkbook,
  type WorkbookSheet,
} from "./workbook";

const SPRINGWA_PLAN_SHEET_NAME =
  "プラン加入用【プランA・プランB】";

const SPRINGWA_INDIVIDUAL_SHEET_NAME =
  "個別加入用【単品】";

const SPRINGWA_MASTER_SHEET_NAME = "マスタ";

type SheetDetectionCheck = {
  matched: boolean;
  score: number;
  reasons: string[];
};

function normalizeDetectionText(
  value: string | null | undefined
): string {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s　\r\n\t]/g, "")
    .trim()
    .toLowerCase();
}

function includesNormalizedText(
  actualValue: string | null,
  expectedValue: string
): boolean {
  const actual = normalizeDetectionText(actualValue);
  const expected = normalizeDetectionText(expectedValue);

  if (!actual || !expected) {
    return false;
  }

  return actual.includes(expected);
}

function cellMatchesAny(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnName: string,
  expectedValues: string[]
): boolean {
  const actualValue = getCellTextByColumnName(
    sheet,
    rowNumber,
    columnName
  );

  return expectedValues.some((expectedValue) =>
    includesNormalizedText(actualValue, expectedValue)
  );
}

function detectSpringWaPlanSheet(
  sheet: WorkbookSheet
): SheetDetectionCheck {
  let score = 0;
  const reasons: string[] = [];

  if (sheet.name === SPRINGWA_PLAN_SHEET_NAME) {
    score += 40;
    reasons.push(
      `シート名が「${SPRINGWA_PLAN_SHEET_NAME}」と一致`
    );
  }

  const customerNameMatched = cellMatchesAny(
    sheet,
    6,
    "C",
    ["購入者名"]
  );

  if (customerNameMatched) {
    score += 10;
    reasons.push("6行目C列に購入者名の見出しを確認");
  }

  const kanaMatched = cellMatchesAny(
    sheet,
    6,
    "D",
    ["フリガナ", "ふりがな"]
  );

  if (kanaMatched) {
    score += 10;
    reasons.push("6行目D列にフリガナの見出しを確認");
  }

  const warrantyStartDateMatched = cellMatchesAny(
    sheet,
    6,
    "L",
    ["保証開始日"]
  );

  if (warrantyStartDateMatched) {
    score += 10;
    reasons.push("6行目L列に保証開始日の見出しを確認");
  }

  const planMatched = cellMatchesAny(
    sheet,
    6,
    "M",
    ["プラン区分", "プラン"]
  );

  if (planMatched) {
    score += 10;
    reasons.push("6行目M列にプラン区分の見出しを確認");
  }

  const waterHeaterMatched = cellMatchesAny(
    sheet,
    6,
    "N",
    ["給湯器種類", "給湯器"]
  );

  if (waterHeaterMatched) {
    score += 10;
    reasons.push("6行目N列に給湯器種類の見出しを確認");
  }

  const warrantyFeeMatched = cellMatchesAny(
    sheet,
    6,
    "Q",
    ["保証料", "保証料税別"]
  );

  if (warrantyFeeMatched) {
    score += 10;
    reasons.push("6行目Q列に保証料の見出しを確認");
  }

  return {
    matched: score >= 70,
    score,
    reasons,
  };
}

function detectSpringWaIndividualSheet(
  sheet: WorkbookSheet
): SheetDetectionCheck {
  let score = 0;
  const reasons: string[] = [];

  if (sheet.name === SPRINGWA_INDIVIDUAL_SHEET_NAME) {
    score += 40;
    reasons.push(
      `シート名が「${SPRINGWA_INDIVIDUAL_SHEET_NAME}」と一致`
    );
  }

  const customerNameMatched = cellMatchesAny(
    sheet,
    5,
    "C",
    ["購入者名"]
  );

  if (customerNameMatched) {
    score += 10;
    reasons.push("5行目C列に購入者名の見出しを確認");
  }

  const warrantyStartDateMatched = cellMatchesAny(
    sheet,
    5,
    "J",
    ["保証開始日"]
  );

  if (warrantyStartDateMatched) {
    score += 10;
    reasons.push("5行目J列に保証開始日の見出しを確認");
  }

  const manufacturerMatched = cellMatchesAny(
    sheet,
    5,
    "K",
    ["メーカー名", "メーカー"]
  );

  if (manufacturerMatched) {
    score += 10;
    reasons.push("5行目K列にメーカー名の見出しを確認");
  }

  const modelNumberMatched = cellMatchesAny(
    sheet,
    5,
    "L",
    ["品番・型番", "品番", "型番"]
  );

  if (modelNumberMatched) {
    score += 10;
    reasons.push("5行目L列に品番・型番の見出しを確認");
  }

  const productMatched = cellMatchesAny(
    sheet,
    5,
    "M",
    ["保証加入機器", "加入機器"]
  );

  if (productMatched) {
    score += 10;
    reasons.push("5行目M列に保証加入機器の見出しを確認");
  }

  const warrantyFeeMatched = cellMatchesAny(
    sheet,
    5,
    "R",
    ["保証料", "保証料税別"]
  );

  if (warrantyFeeMatched) {
    score += 10;
    reasons.push("5行目R列に保証料の見出しを確認");
  }

  return {
    matched: score >= 70,
    score,
    reasons,
  };
}

function detectSpringWaMasterSheet(
  sheet: WorkbookSheet
): SheetDetectionCheck {
  let score = 0;
  const reasons: string[] = [];

  if (sheet.name === SPRINGWA_MASTER_SHEET_NAME) {
    score += 40;
    reasons.push(
      `シート名が「${SPRINGWA_MASTER_SHEET_NAME}」と一致`
    );
  }

  const productMatched = cellMatchesAny(
    sheet,
    2,
    "B",
    ["保証加入機器", "機器名", "加入機器"]
  );

  if (productMatched) {
    score += 30;
    reasons.push("2行目B列に機器名の見出しを確認");
  }

  const priceMatched = cellMatchesAny(
    sheet,
    2,
    "C",
    [
      "1台当たり保証料",
      "保証料",
      "単価",
    ]
  );

  if (priceMatched) {
    score += 30;
    reasons.push("2行目C列に保証料単価の見出しを確認");
  }

  return {
    matched: score >= 70,
    score,
    reasons,
  };
}

function detectSheetType(
  sheet: WorkbookSheet
): {
  sheetType: SubmissionSheetType;
  score: number;
  reasons: string[];
} {
  const planResult = detectSpringWaPlanSheet(sheet);
  const individualResult =
    detectSpringWaIndividualSheet(sheet);
  const masterResult = detectSpringWaMasterSheet(sheet);

  const results = [
    {
      sheetType: "springwa_plan" as const,
      ...planResult,
    },
    {
      sheetType: "springwa_individual" as const,
      ...individualResult,
    },
    {
      sheetType: "springwa_master" as const,
      ...masterResult,
    },
  ].sort((a, b) => b.score - a.score);

  const bestResult = results[0];

  if (!bestResult || !bestResult.matched) {
    return {
      sheetType: "unknown",
      score: bestResult?.score || 0,
      reasons: bestResult?.reasons || [],
    };
  }

  return {
    sheetType: bestResult.sheetType,
    score: bestResult.score,
    reasons: bestResult.reasons,
  };
}

function calculateConfidence(
  detectedSheetTypes: SubmissionSheetType[],
  totalScore: number
): number {
  const requiredTypes: SubmissionSheetType[] = [
    "springwa_plan",
    "springwa_individual",
    "springwa_master",
  ];

  const matchedRequiredTypes = requiredTypes.filter((type) =>
    detectedSheetTypes.includes(type)
  );

  const requiredSheetRatio =
    matchedRequiredTypes.length / requiredTypes.length;

  const maximumExpectedScore = 300;
  const scoreRatio = Math.min(
    totalScore / maximumExpectedScore,
    1
  );

  const confidence =
    requiredSheetRatio * 70 + scoreRatio * 30;

  return Math.round(
    Math.min(Math.max(confidence, 0), 100)
  );
}

export function detectWorkbookFormat(
  parsedWorkbook: ParsedWorkbook
): WorkbookDetectionResult {
  const detectedSheets: WorkbookDetectionResult["detectedSheets"] =
    [];
  const reasons: string[] = [];

  let totalScore = 0;

  for (const sheet of parsedWorkbook.sheets) {
    const result = detectSheetType(sheet);

    detectedSheets.push({
      sheetName: sheet.name,
      sheetType: result.sheetType,
    });

    totalScore += result.score;

    if (result.reasons.length > 0) {
      reasons.push(
        ...result.reasons.map(
          (reason) => `${sheet.name}: ${reason}`
        )
      );
    }
  }

  const detectedSheetTypes = detectedSheets.map(
    (sheet) => sheet.sheetType
  );

  const hasPlanSheet = detectedSheetTypes.includes(
    "springwa_plan"
  );

  const hasIndividualSheet = detectedSheetTypes.includes(
    "springwa_individual"
  );

  const hasMasterSheet = detectedSheetTypes.includes(
    "springwa_master"
  );

  const confidence = calculateConfidence(
    detectedSheetTypes,
    totalScore
  );

  if (
    hasPlanSheet &&
    hasIndividualSheet &&
    hasMasterSheet
  ) {
    reasons.unshift(
      "春和建業のプラン加入・個別加入・マスタの3シートを確認"
    );

    return {
      format: "springwa",
      confidence,
      detectedSheets,
      reasons,
    };
  }

  const sheetNames = getSheetNames(parsedWorkbook);

  if (
    sheetNames.includes(SPRINGWA_PLAN_SHEET_NAME) ||
    sheetNames.includes(SPRINGWA_INDIVIDUAL_SHEET_NAME) ||
    sheetNames.includes(SPRINGWA_MASTER_SHEET_NAME)
  ) {
    reasons.unshift(
      "春和建業に関連するシートはありますが、必要な3シートを確認できません"
    );

    return {
      format: "unknown",
      confidence,
      detectedSheets,
      reasons,
    };
  }

  reasons.unshift(
    "対応済みのExcelフォーマットを確認できません"
  );

  return {
    format: "unknown",
    confidence,
    detectedSheets,
    reasons,
  };
}

export function getDetectedSpringWaSheets(
  parsedWorkbook: ParsedWorkbook
): {
  planSheet: WorkbookSheet | null;
  individualSheet: WorkbookSheet | null;
  masterSheet: WorkbookSheet | null;
} {
  const detection = detectWorkbookFormat(parsedWorkbook);

  const findDetectedSheetName = (
    sheetType: SubmissionSheetType
  ) =>
    detection.detectedSheets.find(
      (sheet) => sheet.sheetType === sheetType
    )?.sheetName || null;

  const planSheetName = findDetectedSheetName(
    "springwa_plan"
  );

  const individualSheetName = findDetectedSheetName(
    "springwa_individual"
  );

  const masterSheetName = findDetectedSheetName(
    "springwa_master"
  );

  return {
    planSheet: planSheetName
      ? getSheetByName(parsedWorkbook, planSheetName)
      : null,

    individualSheet: individualSheetName
      ? getSheetByName(
          parsedWorkbook,
          individualSheetName
        )
      : null,

    masterSheet: masterSheetName
      ? getSheetByName(parsedWorkbook, masterSheetName)
      : null,
  };
}