import type { SupabaseClient } from "@supabase/supabase-js";

export type WarrantyInvoiceItemInput = {
  item_name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
};

export type CreateWarrantyInvoiceInput = {
  invoice_no: string;
  invoice_date?: string | null;
  payment_due_date?: string | null;
  subject?: string | null;
  bill_to_company_name?: string | null;
  bill_to_name?: string | null;
  bill_to_email: string;
  note?: string | null;
  items: WarrantyInvoiceItemInput[];
};

export type CreatedWarrantyInvoice = {
  id: string;
  invoice_no: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
};

export class WarrantyInvoiceRegistrationError extends Error {
  readonly kind: "validation" | "database";

  constructor(kind: "validation" | "database", message: string) {
    super(message);
    this.name = "WarrantyInvoiceRegistrationError";
    this.kind = kind;
  }
}

function clean(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export async function createWarrantyInvoice(
  supabase: SupabaseClient,
  input: CreateWarrantyInvoiceInput
): Promise<CreatedWarrantyInvoice> {
  if (!clean(input.bill_to_company_name) && !clean(input.bill_to_name)) {
    throw new WarrantyInvoiceRegistrationError(
      "validation",
      "宛先会社名または宛先名を入力してください"
    );
  }
  if (!input.bill_to_email.trim()) {
    throw new WarrantyInvoiceRegistrationError(
      "validation",
      "請求先メールアドレスは必須です"
    );
  }
  if (input.items.length === 0) {
    throw new WarrantyInvoiceRegistrationError(
      "validation",
      "明細を1行以上入力してください"
    );
  }
  if (input.items.some((item) => !item.item_name.trim())) {
    throw new WarrantyInvoiceRegistrationError(
      "validation",
      "明細名が未入力の行があります"
    );
  }

  const itemRows = input.items.map((item, index) => ({
    item_name: item.item_name.trim(),
    description: clean(item.description),
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    amount: Number(item.quantity || 0) * Number(item.unit_price || 0),
    sort_order: index,
  }));
  const subtotal = itemRows.reduce((sum, item) => sum + item.amount, 0);
  const taxRate = 0.1;
  const taxAmount = Math.floor(subtotal * taxRate);
  const totalAmount = subtotal + taxAmount;

  const { data: invoice, error: invoiceError } = await supabase
    .from("warranty_invoices")
    .insert({
      invoice_no: input.invoice_no.trim(),
      invoice_date: input.invoice_date || null,
      payment_due_date: input.payment_due_date || null,
      subject: clean(input.subject),
      bill_to_company_name: clean(input.bill_to_company_name),
      bill_to_name: clean(input.bill_to_name),
      bill_to_email: input.bill_to_email.trim(),
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      status: "draft",
      note: clean(input.note),
    })
    .select("id, invoice_no")
    .single();

  if (invoiceError || !invoice) {
    throw new WarrantyInvoiceRegistrationError(
      "database",
      invoiceError?.message || "請求書の作成に失敗しました"
    );
  }

  const insertItemRows = itemRows.map((item) => ({
    ...item,
    invoice_id: invoice.id,
  }));
  const { error: itemsError } = await supabase
    .from("warranty_invoice_items")
    .insert(insertItemRows);

  if (itemsError) {
    throw new WarrantyInvoiceRegistrationError("database", itemsError.message);
  }

  return {
    id: invoice.id,
    invoice_no: invoice.invoice_no,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
  };
}
