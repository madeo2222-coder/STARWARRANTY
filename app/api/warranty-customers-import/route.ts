import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImportCustomer = {
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  postal_code?: string;
  address?: string;
  note?: string;
  row_no?: number;
};

type ImportBody = {
  customers?: ImportCustomer[];
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function clean(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/[^\d]/g, "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ImportBody;
    const customers = Array.isArray(body.customers) ? body.customers : [];

    if (customers.length === 0) {
      return NextResponse.json(
        { success: false, error: "取込対象の顧客データがありません" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data: existingRows, error: existingError } = await supabase
      .from("warranty_customers")
      .select("id, email, phone");

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingEmailSet = new Set<string>();
    const existingPhoneSet = new Set<string>();

    for (const row of existingRows || []) {
      const email = String(row.email || "").trim().toLowerCase();
      const phone = normalizePhone(row.phone);

      if (email) existingEmailSet.add(email);
      if (phone) existingPhoneSet.add(phone);
    }

    const insertRows = [];
    const errors: string[] = [];
    let skippedCount = 0;

    for (const customer of customers) {
      const rowNo = customer.row_no || "-";
      const companyName = clean(customer.company_name);
      const contactName = clean(customer.contact_name);
      const email = clean(customer.email);
      const phone = clean(customer.phone);
      const postalCode = clean(customer.postal_code);
      const address = clean(customer.address);
      const note = clean(customer.note);

      if (!companyName) {
        errors.push(`${rowNo}行目：会社名がありません`);
        continue;
      }

      const normalizedEmail = String(email || "").toLowerCase();
      const normalizedPhone = normalizePhone(phone);

      const duplicateByEmail =
        normalizedEmail && existingEmailSet.has(normalizedEmail);

      const duplicateByPhone =
        normalizedPhone && existingPhoneSet.has(normalizedPhone);

      if (duplicateByEmail || duplicateByPhone) {
        skippedCount += 1;
        continue;
      }

      if (normalizedEmail) existingEmailSet.add(normalizedEmail);
      if (normalizedPhone) existingPhoneSet.add(normalizedPhone);

      insertRows.push({
        company_name: companyName,
        contact_name: contactName,
        email,
        phone,
        postal_code: postalCode,
        address,
        note,
      });
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("warranty_customers")
        .insert(insertRows);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    return NextResponse.json({
      success: true,
      inserted_count: insertRows.length,
      skipped_count: skippedCount,
      error_count: errors.length,
      errors,
    });
  } catch (error) {
    console.error("warranty customers import error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "顧客データの一括取込に失敗しました",
      },
      { status: 500 }
    );
  }
}