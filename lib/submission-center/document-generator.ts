export type SubmissionDocumentBatch = {
  id: string;
  batch_no: string;
  partner_id: string;
  partner_name: string;
  target_month: string;
};

export type SubmissionDocumentRow = {
  id: string;
  sheet_name: string;
  row_number: number;
  row_type: "plan" | "single";
  customer_name: string | null;
  customer_name_kana: string | null;
  postal_code: string | null;
  address_full: string | null;
  phone: string | null;
  email: string | null;
  application_date: string | null;
  warranty_start_date: string | null;
  plan_code: string | null;
  water_heater_type: string | null;
  manufacturer: string | null;
  model_number: string | null;
  equipment_name: string | null;
  quantity: number | null;
  additional_equipment: string | null;
  additional_model_number: string | null;
  additional_quantity: number | null;
  warranty_fee: number | null;
  validation_status: string;
  duplicate_status: string;
};

export type WarrantyDocumentDraft = {
  draft_reference: string;
  source: {
    row_id: string;
    sheet_name: string;
    row_number: number;
    row_type: "plan" | "single";
  };
  generation_status: "ready" | "needs_review";
  issues: string[];
  customer: {
    name: string | null;
    name_kana: string | null;
    postal_code: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  warranty: {
    application_date: string | null;
    start_date: string | null;
    plan_code: string | null;
    water_heater_type: string | null;
  };
  products: {
    equipment_name: string | null;
    manufacturer: string | null;
    model_number: string | null;
    quantity: number;
  }[];
  warranty_fee_ex_tax: number;
};

export type InvoiceDocumentDraft = {
  draft_reference: string;
  subject: string;
  target_month: string;
  bill_to: {
    partner_id: string;
    company_name: string;
  };
  items: {
    source_row_id: string;
    item_name: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  warnings: string[];
};

export type SubmissionDocumentGeneration = {
  generated_at: string;
  batch: SubmissionDocumentBatch;
  summary: {
    row_count: number;
    warranty_ready_count: number;
    warranty_needs_review_count: number;
    invoice_item_count: number;
  };
  warranty_documents: WarrantyDocumentDraft[];
  invoice: InvoiceDocumentDraft;
};

function text(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function number(value: number | null | undefined, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function buildIssues(row: SubmissionDocumentRow) {
  const issues: string[] = [];

  if (!text(row.customer_name)) issues.push("顧客名がありません");
  if (!text(row.postal_code)) issues.push("郵便番号がありません");
  if (!text(row.address_full)) issues.push("住所がありません");
  if (!text(row.warranty_start_date)) issues.push("保証開始日がありません");
  if (row.row_type === "plan") {
    if (!text(row.plan_code)) issues.push("プランコードがありません");
    if (!text(row.water_heater_type)) issues.push("給湯器種類がありません");
  } else {
    if (!text(row.manufacturer)) issues.push("メーカーがありません");
    if (!text(row.model_number)) issues.push("型番がありません");
    if (!text(row.equipment_name)) issues.push("保証加入機器がありません");
    if (!row.quantity || Number(row.quantity) <= 0) {
      issues.push("加入機器の台数がありません");
    }
  }
  if (text(row.additional_equipment) && number(row.additional_quantity) <= 0) {
    issues.push("追加機器が入力されていますが追加台数がありません");
  }
  if (!text(row.additional_equipment) && number(row.additional_quantity) > 0) {
    issues.push("追加台数が入力されていますが追加機器がありません");
  }
  if (row.warranty_fee === null || !Number.isFinite(Number(row.warranty_fee))) {
    issues.push("保証料がありません");
  }
  if (row.validation_status !== "valid") {
    issues.push(`validation_status: ${row.validation_status}`);
  }
  if (row.duplicate_status !== "unique") {
    issues.push(`duplicate_status: ${row.duplicate_status}`);
  }

  return issues;
}

function buildProducts(row: SubmissionDocumentRow) {
  const products: WarrantyDocumentDraft["products"] = [
    {
      equipment_name:
        row.row_type === "plan"
          ? text(row.water_heater_type)
          : text(row.equipment_name),
      manufacturer:
        row.row_type === "plan" ? null : text(row.manufacturer),
      model_number:
        row.row_type === "plan" ? null : text(row.model_number),
      quantity: number(row.quantity, 1),
    },
  ];

  if (
    text(row.additional_equipment) ||
    text(row.additional_model_number) ||
    number(row.additional_quantity) > 0
  ) {
    products.push({
      equipment_name: text(row.additional_equipment),
      manufacturer: null,
      model_number: text(row.additional_model_number),
      quantity: number(row.additional_quantity, 1),
    });
  }

  return products;
}

export function generateSubmissionDocuments(
  batch: SubmissionDocumentBatch,
  rows: SubmissionDocumentRow[],
  generatedAt = new Date().toISOString()
): SubmissionDocumentGeneration {
  const warrantyDocuments = rows.map((row, index) => {
    const issues = buildIssues(row);

    return {
      draft_reference: `${batch.batch_no}-W-${String(index + 1).padStart(4, "0")}`,
      source: {
        row_id: row.id,
        sheet_name: row.sheet_name,
        row_number: row.row_number,
        row_type: row.row_type,
      },
      generation_status: issues.length === 0 ? "ready" : "needs_review",
      issues,
      customer: {
        name: text(row.customer_name),
        name_kana: text(row.customer_name_kana),
        postal_code: text(row.postal_code),
        address: text(row.address_full),
        phone: text(row.phone),
        email: text(row.email),
      },
      warranty: {
        application_date: text(row.application_date),
        start_date: text(row.warranty_start_date),
        plan_code: text(row.plan_code),
        water_heater_type: text(row.water_heater_type),
      },
      products: buildProducts(row),
      warranty_fee_ex_tax: number(row.warranty_fee),
    } satisfies WarrantyDocumentDraft;
  });

  const invoiceItems = rows.map((row) => {
    const unitPrice = number(row.warranty_fee);
    const productName =
      text(row.equipment_name) ||
      text(row.water_heater_type) ||
      text(row.manufacturer) ||
      "保証対象機器";
    const description = [
      text(row.customer_name),
      text(row.plan_code) ? `プラン ${text(row.plan_code)}` : null,
      text(row.manufacturer),
      text(row.model_number),
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      source_row_id: row.id,
      item_name: `${productName} 保証料`,
      description,
      quantity: 1,
      unit_price: unitPrice,
      amount: unitPrice,
    };
  });

  const subtotal = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  const taxRate = 0.1;
  const taxAmount = Math.floor(subtotal * taxRate);
  const missingFeeCount = rows.filter(
    (row) => row.warranty_fee === null || !Number.isFinite(Number(row.warranty_fee))
  ).length;
  const warnings =
    missingFeeCount > 0
      ? [`保証料未設定の${missingFeeCount}件は0円で集計しています`]
      : [];
  const warrantyReadyCount = warrantyDocuments.filter(
    (document) => document.generation_status === "ready"
  ).length;

  return {
    generated_at: generatedAt,
    batch,
    summary: {
      row_count: rows.length,
      warranty_ready_count: warrantyReadyCount,
      warranty_needs_review_count: warrantyDocuments.length - warrantyReadyCount,
      invoice_item_count: invoiceItems.length,
    },
    warranty_documents: warrantyDocuments,
    invoice: {
      draft_reference: `${batch.batch_no}-I-001`,
      subject: `${batch.target_month} 保証料`,
      target_month: batch.target_month,
      bill_to: {
        partner_id: batch.partner_id,
        company_name: batch.partner_name,
      },
      items: invoiceItems,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: subtotal + taxAmount,
      warnings,
    },
  };
}
