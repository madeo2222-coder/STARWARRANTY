import type {
  CellPrimitive,
  ParsedSubmissionRow,
  RawSubmissionData,
  SpringWaMasterItem,
  SubmissionParserContext,
} from "./types";

import {
  getCellByColumnName,
  getCellTextByColumnName,
} from "./workbook";

import {
  getDetectedSpringWaSheets,
} from "./detector";

import {
  createNormalizedSubmissionData,
  normalizeAddress,
  normalizeCustomerName,
  normalizeDate,
  normalizeEmail,
  normalizeKana,
  normalizeManufacturerName,
  normalizeModelNumber,
  normalizeMoney,
  normalizePhone,
  normalizePlanCode,
  normalizePositiveInteger,
  normalizePostalCode,
  normalizeProductName,
  normalizeProductNameForComparison,
  normalizeText,
} from "./normalizer";

import type {
  ParsedWorkbook,
  WorkbookCell,
  WorkbookSheet,
} from "./workbook";

const PLAN_DATA_START_ROW = 8;
const PLAN_DATA_END_ROW = 15;

const INDIVIDUAL_DATA_START_ROW = 6;
const INDIVIDUAL_DATA_END_ROW = 15;

const MASTER_DATA_START_ROW = 3;
const MASTER_DATA_END_ROW = 31;

type SpringWaParseResult = {
  targetMonth: string | null;
  rows: ParsedSubmissionRow[];
  masterItems: SpringWaMasterItem[];
  warnings: string[];
};

function getCellRawValue(cell: WorkbookCell): CellPrimitive {
  return cell.value;
}

function getCellRawRecordValue(
  cell: WorkbookCell
): CellPrimitive | CellPrimitive[] {
  if (!cell.formula) {
    return getCellRawValue(cell);
  }

  return [
    getCellRawValue(cell),
    `FORMULA:${cell.formula}`,
  ];
}

function createRawData(
  values: Record<string, WorkbookCell>
): RawSubmissionData {
  return Object.fromEntries(
    Object.entries(values).map(([key, cell]) => [
      key,
      getCellRawRecordValue(cell),
    ])
  );
}

function getTargetMonthFromText(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();

  const match = normalized.match(
    /(\d{4})年(\d{1,2})月分?/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function resolveTargetMonth(
  planSheet: WorkbookSheet,
  context: SubmissionParserContext
): string | null {
  const sheetTargetMonth = getTargetMonthFromText(
    getCellTextByColumnName(planSheet, 5, "B")
  );

  if (sheetTargetMonth) {
    return sheetTargetMonth;
  }

  const contextTargetMonth = normalizeDate(
    context.targetMonth
  );

  if (contextTargetMonth) {
    return contextTargetMonth.slice(0, 7) + "-01";
  }

  const monthOnlyMatch = context.targetMonth.match(
    /^(\d{4})-(\d{2})$/
  );

  if (monthOnlyMatch) {
    return `${context.targetMonth}-01`;
  }

  return null;
}

function hasMeaningfulCustomerData(
  customerName: CellPrimitive,
  address: CellPrimitive,
  phone: CellPrimitive,
  email: CellPrimitive,
  warrantyStartDate: CellPrimitive
): boolean {
  return Boolean(
    normalizeCustomerName(customerName) ||
      normalizeAddress(address) ||
      normalizePhone(phone) ||
      normalizeEmail(email) ||
      normalizeDate(warrantyStartDate)
  );
}

function getPlanRowCells(
  sheet: WorkbookSheet,
  rowNumber: number
) {
  return {
    no: getCellByColumnName(sheet, rowNumber, "B"),
    customerName: getCellByColumnName(
      sheet,
      rowNumber,
      "C"
    ),
    customerNameKana: getCellByColumnName(
      sheet,
      rowNumber,
      "D"
    ),
    postalCode: getCellByColumnName(
      sheet,
      rowNumber,
      "E"
    ),
    address: getCellByColumnName(
      sheet,
      rowNumber,
      "F"
    ),
    phone: getCellByColumnName(
      sheet,
      rowNumber,
      "I"
    ),
    email: getCellByColumnName(
      sheet,
      rowNumber,
      "J"
    ),
    applicationDate: getCellByColumnName(
      sheet,
      rowNumber,
      "K"
    ),
    warrantyStartDate: getCellByColumnName(
      sheet,
      rowNumber,
      "L"
    ),
    planCode: getCellByColumnName(
      sheet,
      rowNumber,
      "M"
    ),
    waterHeaterType: getCellByColumnName(
      sheet,
      rowNumber,
      "N"
    ),
    additionalProductName: getCellByColumnName(
      sheet,
      rowNumber,
      "O"
    ),
    additionalQuantity: getCellByColumnName(
      sheet,
      rowNumber,
      "P"
    ),
    warrantyFeeExTax: getCellByColumnName(
      sheet,
      rowNumber,
      "Q"
    ),
  };
}

function parsePlanRows(
  sheet: WorkbookSheet,
  context: SubmissionParserContext,
  targetMonth: string | null
): ParsedSubmissionRow[] {
  const rows: ParsedSubmissionRow[] = [];

  for (
    let sourceRowNumber = PLAN_DATA_START_ROW;
    sourceRowNumber <= PLAN_DATA_END_ROW;
    sourceRowNumber += 1
  ) {
    const cells = getPlanRowCells(
      sheet,
      sourceRowNumber
    );

    const customerNameValue = cells.customerName.value;
    const addressValue = cells.address.value;
    const phoneValue = cells.phone.value;
    const emailValue = cells.email.value;
    const warrantyStartDateValue =
      cells.warrantyStartDate.value;

    if (
      !hasMeaningfulCustomerData(
        customerNameValue,
        addressValue,
        phoneValue,
        emailValue,
        warrantyStartDateValue
      )
    ) {
      continue;
    }

    const normalizedData =
      createNormalizedSubmissionData({
        customerName: customerNameValue,
        customerNameKana:
          cells.customerNameKana.value,
        postalCode: cells.postalCode.value,
        address: addressValue,
        phone: phoneValue,
        email: emailValue,
        applicationDate:
          cells.applicationDate.value,
        warrantyStartDate:
          warrantyStartDateValue,
        planCode: cells.planCode.value,
        manufacturerName: null,
        productName:
          cells.waterHeaterType.value,
        modelNumber: null,
        quantity: 1,
        additionalProductName:
          cells.additionalProductName.value,
        additionalModelNumber: null,
        additionalQuantity:
          cells.additionalQuantity.value,
        warrantyFeeExTax:
          cells.warrantyFeeExTax.value,
      });

    rows.push({
      rowIndex: rows.length,

      batchId: context.batchId,
      fileId: context.fileId,
      partnerId: context.partnerId,
      targetMonth:
        targetMonth || context.targetMonth,

      sourceSheet: sheet.name,
      sourceRowNumber,
      submissionType: "plan",

      customerName: normalizeCustomerName(
        customerNameValue
      ),
      customerNameKana: normalizeKana(
        cells.customerNameKana.value
      ),
      postalCode: normalizePostalCode(
        cells.postalCode.value
      ),
      address: normalizeAddress(addressValue),
      phone: normalizePhone(phoneValue),
      email: normalizeEmail(emailValue),

      applicationDate: normalizeDate(
        cells.applicationDate.value
      ),
      warrantyStartDate: normalizeDate(
        warrantyStartDateValue
      ),

      planCode: normalizePlanCode(
        cells.planCode.value
      ),
      manufacturerName: null,

      productName: normalizeProductName(
        cells.waterHeaterType.value
      ),
      modelNumber: null,
      quantity: 1,

      additionalProductName:
        normalizeProductName(
          cells.additionalProductName.value
        ),
      additionalModelNumber: null,
      additionalQuantity:
        normalizePositiveInteger(
          cells.additionalQuantity.value
        ),

      warrantyFeeExTax: normalizeMoney(
        cells.warrantyFeeExTax.value
      ),
      calculatedWarrantyFeeExTax: null,
      warrantyFeeMatches: null,

      rawData: createRawData(cells),
      normalizedData,

      rowHash: null,

      validationStatus: "valid",
      validationIssues: [],

      duplicateStatus: "unchecked",
      duplicateRowId: null,
    });
  }

  return rows;
}

function getIndividualRowCells(
  sheet: WorkbookSheet,
  rowNumber: number
) {
  return {
    no: getCellByColumnName(sheet, rowNumber, "B"),
    customerName: getCellByColumnName(
      sheet,
      rowNumber,
      "C"
    ),
    customerNameKana: getCellByColumnName(
      sheet,
      rowNumber,
      "D"
    ),
    postalCode: getCellByColumnName(
      sheet,
      rowNumber,
      "E"
    ),
    address: getCellByColumnName(
      sheet,
      rowNumber,
      "F"
    ),
    phone: getCellByColumnName(
      sheet,
      rowNumber,
      "G"
    ),
    email: getCellByColumnName(
      sheet,
      rowNumber,
      "H"
    ),
    applicationDate: getCellByColumnName(
      sheet,
      rowNumber,
      "I"
    ),
    warrantyStartDate: getCellByColumnName(
      sheet,
      rowNumber,
      "J"
    ),
    manufacturerName: getCellByColumnName(
      sheet,
      rowNumber,
      "K"
    ),
    modelNumber: getCellByColumnName(
      sheet,
      rowNumber,
      "L"
    ),
    productName: getCellByColumnName(
      sheet,
      rowNumber,
      "M"
    ),
    quantity: getCellByColumnName(
      sheet,
      rowNumber,
      "N"
    ),
    additionalProductName: getCellByColumnName(
      sheet,
      rowNumber,
      "O"
    ),
    additionalModelNumber: getCellByColumnName(
      sheet,
      rowNumber,
      "P"
    ),
    additionalQuantity: getCellByColumnName(
      sheet,
      rowNumber,
      "Q"
    ),
    warrantyFeeExTax: getCellByColumnName(
      sheet,
      rowNumber,
      "R"
    ),
  };
}

function parseIndividualRows(
  sheet: WorkbookSheet,
  context: SubmissionParserContext,
  targetMonth: string | null
): ParsedSubmissionRow[] {
  const rows: ParsedSubmissionRow[] = [];

  for (
    let sourceRowNumber = INDIVIDUAL_DATA_START_ROW;
    sourceRowNumber <= INDIVIDUAL_DATA_END_ROW;
    sourceRowNumber += 1
  ) {
    const cells = getIndividualRowCells(
      sheet,
      sourceRowNumber
    );

    const customerNameValue = cells.customerName.value;
    const addressValue = cells.address.value;
    const phoneValue = cells.phone.value;
    const emailValue = cells.email.value;
    const warrantyStartDateValue =
      cells.warrantyStartDate.value;

    if (
      !hasMeaningfulCustomerData(
        customerNameValue,
        addressValue,
        phoneValue,
        emailValue,
        warrantyStartDateValue
      )
    ) {
      continue;
    }

    const normalizedData =
      createNormalizedSubmissionData({
        customerName: customerNameValue,
        customerNameKana:
          cells.customerNameKana.value,
        postalCode: cells.postalCode.value,
        address: addressValue,
        phone: phoneValue,
        email: emailValue,
        applicationDate:
          cells.applicationDate.value,
        warrantyStartDate:
          warrantyStartDateValue,
        planCode: null,
        manufacturerName:
          cells.manufacturerName.value,
        productName: cells.productName.value,
        modelNumber: cells.modelNumber.value,
        quantity: cells.quantity.value,
        additionalProductName:
          cells.additionalProductName.value,
        additionalModelNumber:
          cells.additionalModelNumber.value,
        additionalQuantity:
          cells.additionalQuantity.value,
        warrantyFeeExTax:
          cells.warrantyFeeExTax.value,
      });

    rows.push({
      rowIndex: rows.length,

      batchId: context.batchId,
      fileId: context.fileId,
      partnerId: context.partnerId,
      targetMonth:
        targetMonth || context.targetMonth,

      sourceSheet: sheet.name,
      sourceRowNumber,
      submissionType: "individual",

      customerName: normalizeCustomerName(
        customerNameValue
      ),
      customerNameKana: normalizeKana(
        cells.customerNameKana.value
      ),
      postalCode: normalizePostalCode(
        cells.postalCode.value
      ),
      address: normalizeAddress(addressValue),
      phone: normalizePhone(phoneValue),
      email: normalizeEmail(emailValue),

      applicationDate: normalizeDate(
        cells.applicationDate.value
      ),
      warrantyStartDate: normalizeDate(
        warrantyStartDateValue
      ),

      planCode: null,
      manufacturerName:
        normalizeManufacturerName(
          cells.manufacturerName.value
        ),

      productName: normalizeProductName(
        cells.productName.value
      ),
      modelNumber: normalizeModelNumber(
        cells.modelNumber.value
      ),
      quantity: normalizePositiveInteger(
        cells.quantity.value
      ),

      additionalProductName:
        normalizeProductName(
          cells.additionalProductName.value
        ),
      additionalModelNumber:
        normalizeModelNumber(
          cells.additionalModelNumber.value
        ),
      additionalQuantity:
        normalizePositiveInteger(
          cells.additionalQuantity.value
        ),

      warrantyFeeExTax: normalizeMoney(
        cells.warrantyFeeExTax.value
      ),
      calculatedWarrantyFeeExTax: null,
      warrantyFeeMatches: null,

      rawData: createRawData(cells),
      normalizedData,

      rowHash: null,

      validationStatus: "valid",
      validationIssues: [],

      duplicateStatus: "unchecked",
      duplicateRowId: null,
    });
  }

  return rows;
}

function parseMasterItems(
  sheet: WorkbookSheet
): SpringWaMasterItem[] {
  const items: SpringWaMasterItem[] = [];

  for (
    let sourceRowNumber = MASTER_DATA_START_ROW;
    sourceRowNumber <= MASTER_DATA_END_ROW;
    sourceRowNumber += 1
  ) {
    const productNameCell = getCellByColumnName(
      sheet,
      sourceRowNumber,
      "B"
    );

    const unitPriceCell = getCellByColumnName(
      sheet,
      sourceRowNumber,
      "C"
    );

    const productName = normalizeProductName(
      productNameCell.value
    );

    const normalizedProductName =
      normalizeProductNameForComparison(
        productNameCell.value
      );

    const unitPriceExTax = normalizeMoney(
      unitPriceCell.value
    );

    if (
      !productName ||
      !normalizedProductName ||
      unitPriceExTax === null
    ) {
      continue;
    }

    items.push({
      productName,
      normalizedProductName,
      unitPriceExTax,
      sourceSheet: sheet.name,
      sourceRowNumber,
    });
  }

  return items;
}

function reindexRows(
  rows: ParsedSubmissionRow[]
): ParsedSubmissionRow[] {
  return rows.map((row, rowIndex) => ({
    ...row,
    rowIndex,
  }));
}

export function parseSpringWaWorkbook(
  parsedWorkbook: ParsedWorkbook,
  context: SubmissionParserContext
): SpringWaParseResult {
  const warnings: string[] = [];

  const {
    planSheet,
    individualSheet,
    masterSheet,
  } = getDetectedSpringWaSheets(parsedWorkbook);

  if (!planSheet) {
    throw new Error(
      "春和建業のプラン加入シートを確認できません"
    );
  }

  if (!individualSheet) {
    throw new Error(
      "春和建業の個別加入シートを確認できません"
    );
  }

  if (!masterSheet) {
    throw new Error(
      "春和建業のマスタシートを確認できません"
    );
  }

  const targetMonth = resolveTargetMonth(
    planSheet,
    context
  );

  if (!targetMonth) {
    warnings.push(
      "Excel内の対象月を取得できなかったため、提出時の対象月を使用します"
    );
  } else {
    const contextMonth = context.targetMonth.slice(
      0,
      7
    );

    const workbookMonth = targetMonth.slice(0, 7);

    if (
      contextMonth &&
      workbookMonth &&
      contextMonth !== workbookMonth
    ) {
      warnings.push(
        `提出時の対象月${contextMonth}とExcel内の対象月${workbookMonth}が一致しません`
      );
    }
  }

  const masterItems = parseMasterItems(masterSheet);

  if (masterItems.length === 0) {
    throw new Error(
      "春和建業の機器マスタを読み取れませんでした"
    );
  }

  if (masterItems.length < 29) {
    warnings.push(
      `春和建業の機器マスタは${masterItems.length}件だけ読み込まれました`
    );
  }

  const planRows = parsePlanRows(
    planSheet,
    context,
    targetMonth
  );

  const individualRows = parseIndividualRows(
    individualSheet,
    context,
    targetMonth
  );

  const rows = reindexRows([
    ...planRows,
    ...individualRows,
  ]);

  if (rows.length === 0) {
    warnings.push(
      "加入データとして判定できる行がありませんでした"
    );
  }

  return {
    targetMonth:
      targetMonth || context.targetMonth,
    rows,
    masterItems,
    warnings,
  };
}