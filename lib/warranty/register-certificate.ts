import type { SupabaseClient } from "@supabase/supabase-js";

export type WarrantyCertificateItemInput = {
  product_id: string;
  is_enabled: boolean;
};

export type CreateWarrantyCertificateInput = {
  certificate_no: string;
  customer_name: string;
  customer_name_kana?: string | null;
  postal_code?: string | null;
  address1?: string | null;
  address2?: string | null;
  address3?: string | null;
  property_name?: string | null;
  property_room?: string | null;
  start_date: string;
  introducer_name?: string | null;
  seller_name?: string | null;
  note?: string | null;
  items: WarrantyCertificateItemInput[];
};

export type CreatedWarrantyCertificate = {
  id: string;
  certificate_no: string;
};

export class WarrantyCertificateRegistrationError extends Error {
  readonly kind: "validation" | "database";

  constructor(kind: "validation" | "database", message: string) {
    super(message);
    this.name = "WarrantyCertificateRegistrationError";
    this.kind = kind;
  }
}

function clean(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export async function createWarrantyCertificate(
  supabase: SupabaseClient,
  input: CreateWarrantyCertificateInput
): Promise<CreatedWarrantyCertificate> {
  if (!input.certificate_no.trim()) {
    throw new WarrantyCertificateRegistrationError(
      "validation",
      "保証書番号がありません"
    );
  }
  if (!input.customer_name.trim()) {
    throw new WarrantyCertificateRegistrationError(
      "validation",
      "施主名がありません"
    );
  }
  if (!input.start_date) {
    throw new WarrantyCertificateRegistrationError(
      "validation",
      "保証開始日がありません"
    );
  }
  if (input.items.length === 0) {
    throw new WarrantyCertificateRegistrationError(
      "validation",
      "対象機器データがありません"
    );
  }
  if (!input.items.some((item) => item.is_enabled)) {
    throw new WarrantyCertificateRegistrationError(
      "validation",
      "保証対象機器を1つ以上選択してください"
    );
  }

  const { data: certificate, error: certificateError } = await supabase
    .from("warranty_certificates")
    .insert({
      certificate_no: input.certificate_no.trim(),
      customer_name: input.customer_name.trim(),
      customer_name_kana: clean(input.customer_name_kana),
      postal_code: clean(input.postal_code),
      address1: clean(input.address1),
      address2: clean(input.address2),
      address3: clean(input.address3),
      property_name: clean(input.property_name),
      property_room: clean(input.property_room),
      start_date: input.start_date,
      introducer_name: clean(input.introducer_name),
      seller_name: clean(input.seller_name),
      note: clean(input.note),
      status: "active",
    })
    .select("id, certificate_no")
    .single();

  if (certificateError || !certificate) {
    throw new WarrantyCertificateRegistrationError(
      "database",
      certificateError?.message || "保証書ヘッダー保存に失敗しました"
    );
  }

  const itemRows = input.items.map((item) => ({
    certificate_id: certificate.id,
    product_id: item.product_id,
    is_enabled: item.is_enabled,
  }));
  const { error: itemsError } = await supabase
    .from("warranty_certificate_items")
    .insert(itemRows);

  if (itemsError) {
    throw new WarrantyCertificateRegistrationError(
      "database",
      itemsError.message
    );
  }

  return certificate as CreatedWarrantyCertificate;
}
