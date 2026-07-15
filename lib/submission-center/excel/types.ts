export type SupportedSpreadsheetExtension = "xlsx";

export type SubmissionWorkbookFormat =
  | "springwa"
  | "unsupported"
  | "unknown";

export type SubmissionSheetType =
  | "springwa_plan"
  | "springwa_individual"
  | "springwa_master"
  | "unknown";

export type SubmissionType =
  | "plan"
  | "individual";

export type ValidationSeverity =
  | "warning"
  | "error";

export type ValidationStatus =
  | "valid"
  | "warning"
  | "error";

export type DuplicateStatus =
  | "unchecked"
  | "unique"
  | "duplicate"
  | "needs_review";

export type ParseStatus =
  | "pending"
  | "parsing"
  | "parsed"
  | "warning"
  | "failed";

export type ImportStatus =
  | "pending"
  | "ready"
  | "imported"
  | "skipped"
  | "failed";

export type SpringWaPlanCode = "A" | "B";

export type CellPrimitive =
  | string
  | number
  | boolean
  | Date
  | null;

export type RawSubmissionData = Record<
  string,
  CellPrimitive | CellPrimitive[]
>;

export type NormalizedSubmissionData = Record<
  string,
  string | number | boolean | null
>;

export type ValidationIssue = {
  code: string;
  field: string | null;
  severity: ValidationSeverity;
  message: string;
  sourceSheet: string;
  sourceRowNumber: number;
};

export type SpringWaMasterItem = {
  productName: string;
  normalizedProductName: string;
  unitPriceExTax: number;
  sourceSheet: string;
  sourceRowNumber: number;
};

export type SubmissionParserContext = {
  batchId: string;
  fileId: string | null;
  partnerId: string;
  targetMonth: string;
  originalFilename: string;
};

export type ParsedSubmissionRow = {
  rowIndex: number;

  batchId: string;
  fileId: string | null;
  partnerId: string;
  targetMonth: string;

  sourceSheet: string;
  sourceRowNumber: number;
  submissionType: SubmissionType;

  customerName: string | null;
  customerNameKana: string | null;
  postalCode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;

  applicationDate: string | null;
  warrantyStartDate: string | null;

  planCode: SpringWaPlanCode | null;
  manufacturerName: string | null;

  productName: string | null;
  modelNumber: string | null;
  quantity: number | null;

  additionalProductName: string | null;
  additionalModelNumber: string | null;
  additionalQuantity: number | null;

  warrantyFeeExTax: number | null;
  calculatedWarrantyFeeExTax: number | null;
  warrantyFeeMatches: boolean | null;

  rawData: RawSubmissionData;
  normalizedData: NormalizedSubmissionData;

  rowHash: string | null;

  validationStatus: ValidationStatus;
  validationIssues: ValidationIssue[];

  duplicateStatus: DuplicateStatus;
  duplicateRowId: string | null;
};

export type WorkbookDetectionResult = {
  format: SubmissionWorkbookFormat;
  confidence: number;
  detectedSheets: {
    sheetName: string;
    sheetType: SubmissionSheetType;
  }[];
  reasons: string[];
};

export type SubmissionParseSummary = {
  totalCount: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  duplicateCount: number;
  needsReviewCount: number;
};

export type SubmissionParseResult = {
  success: boolean;
  format: SubmissionWorkbookFormat;
  detection: WorkbookDetectionResult;

  targetMonth: string | null;

  rows: ParsedSubmissionRow[];
  masterItems: SpringWaMasterItem[];

  summary: SubmissionParseSummary;

  workbookWarnings: string[];
  fatalErrors: string[];
};

export type SubmissionRowInsert = {
  batch_id: string;

  sheet_name: string;
  row_number: number;
  row_type: SubmissionType;

  customer_name: string | null;
  customer_name_kana: string | null;
  postal_code: string | null;

  address_prefecture: string | null;
  address_city: string | null;
  address_detail: string | null;
  address_full: string | null;

  phone: string | null;
  email: string | null;

  application_date: string | null;
  warranty_start_date: string | null;

  plan_code: SpringWaPlanCode | null;
  water_heater_type: string | null;

  manufacturer: string | null;
  model_number: string | null;
  equipment_name: string | null;
  quantity: number | null;

  additional_equipment: string | null;
  additional_model_number: string | null;
  additional_quantity: number | null;

  warranty_fee: number | null;

  row_hash: string | null;

  validation_status: ValidationStatus;
  validation_errors: ValidationIssue[];

  duplicate_status: DuplicateStatus;
  duplicate_of_row_id: string | null;

  import_status: "pending";

  raw_data: RawSubmissionData;
  normalized_data: NormalizedSubmissionData;
};

export type DuplicateComparisonRow = {
  id: string;
  partnerId: string;

  customerName: string | null;
  postalCode: string | null;
  address: string | null;
  warrantyStartDate: string | null;
  productName: string | null;
  modelNumber: string | null;

  rowHash: string | null;
};

export type DuplicateCheckResult = {
  status: DuplicateStatus;
  duplicateRowId: string | null;
  matchedFields: string[];
  reasons: string[];
};