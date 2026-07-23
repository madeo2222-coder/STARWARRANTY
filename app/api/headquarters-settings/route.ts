import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  isValidQualifiedInvoiceIssuerNumber,
  normalizeQualifiedInvoiceIssuerNumber,
} from "@/lib/headquarters/invoice-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HeadquartersSettings = {
  id: string;
  company_name: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  logo_url: string | null;
  invoice_number: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const HEADQUARTERS_ADMIN_EMAILS = [
  "madeo8888@gmail.com",
  "y.shimizu@st-w.jp",
  "s.hidaka@st-w.jp",
  "n.fukuda@st-w.jp",
  "t.hiraga@st-w.jp",
];

const DEFAULT_HEADQUARTERS_SETTINGS = {
  company_name: "株式会社スター・ワランティ",
  representative_name: null,
  email: null,
  phone: "0120-992-857",
  postal_code: null,
  address: null,
  note: null,
  logo_url: null,
  invoice_number: null,
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

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function sanitizePostalCode(value: string | null | undefined) {
  return String(value || "")
    .replace(/[^\d-]/g, "")
    .slice(0, 8);
}

async function requireHeadquartersAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("ログイン情報が取得できませんでした");
  }

  const supabase = getAdminClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("ログイン情報が取得できませんでした");
  }

  const email = normalizeEmail(user.email);

  if (!HEADQUARTERS_ADMIN_EMAILS.includes(email)) {
    throw new Error("本部最高権限アカウントのみ更新できます");
  }

  return {
    supabase,
    user,
    email,
  };
}

async function getOrCreateHeadquartersSettings(supabase: SupabaseClient) {
  const { data: rows, error: selectError } = await supabase
    .from("headquarters_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectError) {
    throw new Error(selectError.message);
  }

  const existingSettings = (rows?.[0] ?? null) as HeadquartersSettings | null;

  if (existingSettings?.id) {
    return existingSettings;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("headquarters_settings")
    .insert(DEFAULT_HEADQUARTERS_SETTINGS)
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(
      insertError?.message || "本部設定の初期作成に失敗しました"
    );
  }

  return inserted as HeadquartersSettings;
}

export async function GET(request: Request) {
  try {
    const { supabase, email } = await requireHeadquartersAdmin(request);
    const settings = await getOrCreateHeadquartersSettings(supabase);

    return NextResponse.json({
      success: true,
      email,
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "本部設定の取得に失敗しました",
      },
      { status: 403 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, email } = await requireHeadquartersAdmin(request);
    const settings = await getOrCreateHeadquartersSettings(supabase);

    const body = (await request.json()) as {
      company_name?: string;
      representative_name?: string | null;
      email?: string | null;
      phone?: string | null;
      postal_code?: string | null;
      address?: string | null;
      note?: string | null;
      logo_url?: string | null;
      invoice_number?: string | null;
    };

    const companyName = String(body.company_name || "").trim();

    if (!companyName) {
      throw new Error("会社名を入力してください");
    }

    const invoiceNumber = normalizeQualifiedInvoiceIssuerNumber(
      body.invoice_number
    );
    if (!isValidQualifiedInvoiceIssuerNumber(invoiceNumber)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "適格請求書発行事業者登録番号は、Tから始まる13桁の数字で入力してください。",
        },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("headquarters_settings")
      .update({
        company_name: companyName,
        representative_name:
          String(body.representative_name || "").trim() || null,
        email: String(body.email || "").trim() || null,
        phone: String(body.phone || "").trim() || null,
        postal_code: sanitizePostalCode(body.postal_code) || null,
        address: String(body.address || "").trim() || null,
        note: String(body.note || "").trim() || null,
        logo_url: String(body.logo_url || "").trim() || null,
        invoice_number: invoiceNumber || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message || "本部情報の更新に失敗しました");
    }

    return NextResponse.json({
      success: true,
      email,
      settings: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "本部情報の更新に失敗しました",
      },
      { status: 403 }
    );
  }
}
