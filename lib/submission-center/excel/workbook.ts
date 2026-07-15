import * as XLSX from "xlsx";

import type { CellPrimitive } from "./types";

export type WorkbookCell = {
  address: string;
  rowNumber: number;
  columnNumber: number;

  value: CellPrimitive;
  formattedValue: string | null;
  formula: string | null;

  cellType: string | null;
  isFormula: boolean;
  isDate: boolean;
  isError: boolean;
};

export type WorkbookSheet = {
  name: string;
  worksheet: XLSX.WorkSheet;
  range: XLSX.Range | null;
  hiddenState: number;
};

export type ParsedWorkbook = {
  workbook: XLSX.WorkBook;
  sheets: WorkbookSheet[];
};

const EXCEL_EPOCH_OFFSET = 25569;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function normalizeString(value: string) {
  return value.replace(/\u0000/g, "").trim();
}

function parseCellRange(worksheet: XLSX.WorkSheet): XLSX.Range | null {
  const reference = worksheet["!ref"];

  if (!reference) {
    return null;
  }

  try {
    return XLSX.utils.decode_range(reference);
  } catch {
    return null;
  }
}

function getSheetHiddenState(
  workbook: XLSX.WorkBook,
  sheetName: string
): number {
  const sheetMetadata = workbook.Workbook?.Sheets?.find(
    (sheet) => sheet.name === sheetName
  );

  return sheetMetadata?.Hidden ?? 0;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) {
    return null;
  }

  const utcMilliseconds =
    (serial - EXCEL_EPOCH_OFFSET) * MILLISECONDS_PER_DAY;

  const date = new Date(utcMilliseconds);

  if (!isValidDate(date)) {
    return null;
  }

  return date;
}

function parseDateText(value: string): Date | null {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  const japaneseDateMatch = normalized.match(
    /^(\d{4})[年\/.-](\d{1,2})[月\/.-](\d{1,2})日?$/
  );

  if (japaneseDateMatch) {
    const year = Number(japaneseDateMatch[1]);
    const month = Number(japaneseDateMatch[2]);
    const day = Number(japaneseDateMatch[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date;
    }

    return null;
  }

  const parsed = new Date(normalized);

  if (!isValidDate(parsed)) {
    return null;
  }

  return parsed;
}

function isDateCell(cell: XLSX.CellObject) {
  if (cell.t === "d") {
    return true;
  }

  if (!cell.z) {
    return false;
  }

  try {
    return XLSX.SSF.is_date(cell.z);
  } catch {
    return false;
  }
}

function getCellPrimitiveValue(cell: XLSX.CellObject): CellPrimitive {
  if (cell.t === "e") {
    return null;
  }

  if (cell.t === "d") {
    if (cell.v instanceof Date) {
      return isValidDate(cell.v) ? cell.v : null;
    }

    if (typeof cell.v === "string") {
      return parseDateText(cell.v);
    }

    return null;
  }

  if (isDateCell(cell) && typeof cell.v === "number") {
    return excelSerialToDate(cell.v);
  }

  if (typeof cell.v === "string") {
    const normalized = normalizeString(cell.v);
    return normalized || null;
  }

  if (typeof cell.v === "number") {
    return Number.isFinite(cell.v) ? cell.v : null;
  }

  if (typeof cell.v === "boolean") {
    return cell.v;
  }

  if (cell.v instanceof Date) {
    return isValidDate(cell.v) ? cell.v : null;
  }

  if (cell.v === null || cell.v === undefined) {
    return null;
  }

  const normalized = normalizeString(String(cell.v));

  return normalized || null;
}

export function readWorkbook(
  buffer: ArrayBuffer | Uint8Array | Buffer
): ParsedWorkbook {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    cellText: true,
    raw: true,
  });

  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`シート「${sheetName}」を読み込めませんでした`);
    }

    return {
      name: sheetName,
      worksheet,
      range: parseCellRange(worksheet),
      hiddenState: getSheetHiddenState(workbook, sheetName),
    };
  });

  return {
    workbook,
    sheets,
  };
}

export function getSheetByName(
  parsedWorkbook: ParsedWorkbook,
  sheetName: string
): WorkbookSheet | null {
  return (
    parsedWorkbook.sheets.find((sheet) => sheet.name === sheetName) || null
  );
}

export function getSheetNames(parsedWorkbook: ParsedWorkbook) {
  return parsedWorkbook.sheets.map((sheet) => sheet.name);
}

export function getCellAddress(
  rowNumber: number,
  columnNumber: number
): string {
  if (!Number.isInteger(rowNumber) || rowNumber < 1) {
    throw new Error("行番号は1以上の整数で指定してください");
  }

  if (!Number.isInteger(columnNumber) || columnNumber < 1) {
    throw new Error("列番号は1以上の整数で指定してください");
  }

  return XLSX.utils.encode_cell({
    r: rowNumber - 1,
    c: columnNumber - 1,
  });
}

export function getColumnNumber(columnName: string): number {
  const normalized = columnName.trim().toUpperCase();

  if (!/^[A-Z]+$/.test(normalized)) {
    throw new Error(`列名「${columnName}」が正しくありません`);
  }

  return XLSX.utils.decode_col(normalized) + 1;
}

export function getColumnName(columnNumber: number): string {
  if (!Number.isInteger(columnNumber) || columnNumber < 1) {
    throw new Error("列番号は1以上の整数で指定してください");
  }

  return XLSX.utils.encode_col(columnNumber - 1);
}

export function getWorkbookCell(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnNumber: number
): WorkbookCell {
  const address = getCellAddress(rowNumber, columnNumber);
  const cell = sheet.worksheet[address] as XLSX.CellObject | undefined;

  if (!cell) {
    return {
      address,
      rowNumber,
      columnNumber,
      value: null,
      formattedValue: null,
      formula: null,
      cellType: null,
      isFormula: false,
      isDate: false,
      isError: false,
    };
  }

  const value = getCellPrimitiveValue(cell);

  const formattedValue =
    typeof cell.w === "string" && cell.w.trim()
      ? normalizeString(cell.w)
      : value instanceof Date
        ? formatDateIso(value)
        : value === null
          ? null
          : String(value);

  const formula =
    typeof cell.f === "string" && cell.f.trim()
      ? cell.f.trim()
      : null;

  return {
    address,
    rowNumber,
    columnNumber,
    value,
    formattedValue,
    formula,
    cellType: typeof cell.t === "string" ? cell.t : null,
    isFormula: Boolean(formula),
    isDate: isDateCell(cell),
    isError: cell.t === "e",
  };
}

export function getCellByColumnName(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnName: string
): WorkbookCell {
  return getWorkbookCell(
    sheet,
    rowNumber,
    getColumnNumber(columnName)
  );
}

export function getCellValue(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnNumber: number
): CellPrimitive {
  return getWorkbookCell(sheet, rowNumber, columnNumber).value;
}

export function getCellValueByColumnName(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnName: string
): CellPrimitive {
  return getCellByColumnName(sheet, rowNumber, columnName).value;
}

export function getCellText(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnNumber: number
): string | null {
  const cell = getWorkbookCell(sheet, rowNumber, columnNumber);

  if (cell.value === null) {
    return null;
  }

  if (cell.value instanceof Date) {
    return formatDateIso(cell.value);
  }

  if (typeof cell.value === "boolean") {
    return cell.value ? "true" : "false";
  }

  const normalized = normalizeString(String(cell.value));

  return normalized || null;
}

export function getCellTextByColumnName(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnName: string
): string | null {
  return getCellText(
    sheet,
    rowNumber,
    getColumnNumber(columnName)
  );
}

export function getCellNumber(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnNumber: number
): number | null {
  const cell = getWorkbookCell(sheet, rowNumber, columnNumber);
  const value = cell.value;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/[,\s]/g, "")
    .replace(/[円￥]/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

export function getCellNumberByColumnName(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnName: string
): number | null {
  return getCellNumber(
    sheet,
    rowNumber,
    getColumnNumber(columnName)
  );
}

export function getCellDate(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnNumber: number
): Date | null {
  const cell = getWorkbookCell(sheet, rowNumber, columnNumber);
  const value = cell.value;

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  if (typeof value === "string") {
    return parseDateText(value);
  }

  return null;
}

export function getCellDateByColumnName(
  sheet: WorkbookSheet,
  rowNumber: number,
  columnName: string
): Date | null {
  return getCellDate(
    sheet,
    rowNumber,
    getColumnNumber(columnName)
  );
}

export function getRowCells(
  sheet: WorkbookSheet,
  rowNumber: number,
  startColumnNumber: number,
  endColumnNumber: number
): WorkbookCell[] {
  if (endColumnNumber < startColumnNumber) {
    throw new Error("終了列は開始列以上で指定してください");
  }

  const cells: WorkbookCell[] = [];

  for (
    let columnNumber = startColumnNumber;
    columnNumber <= endColumnNumber;
    columnNumber += 1
  ) {
    cells.push(getWorkbookCell(sheet, rowNumber, columnNumber));
  }

  return cells;
}

export function getRowValues(
  sheet: WorkbookSheet,
  rowNumber: number,
  startColumnNumber: number,
  endColumnNumber: number
): CellPrimitive[] {
  return getRowCells(
    sheet,
    rowNumber,
    startColumnNumber,
    endColumnNumber
  ).map((cell) => cell.value);
}

export function isRowEmpty(
  sheet: WorkbookSheet,
  rowNumber: number,
  startColumnNumber: number,
  endColumnNumber: number
): boolean {
  return getRowValues(
    sheet,
    rowNumber,
    startColumnNumber,
    endColumnNumber
  ).every((value) => {
    if (value === null) {
      return true;
    }

    if (typeof value === "string") {
      return !value.trim();
    }

    return false;
  });
}

export function formatDateIso(value: Date): string {
  if (!isValidDate(value)) {
    throw new Error("正しい日付ではありません");
  }

  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getSheetRange(sheet: WorkbookSheet): {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
} | null {
  if (!sheet.range) {
    return null;
  }

  return {
    startRow: sheet.range.s.r + 1,
    endRow: sheet.range.e.r + 1,
    startColumn: sheet.range.s.c + 1,
    endColumn: sheet.range.e.c + 1,
  };
}