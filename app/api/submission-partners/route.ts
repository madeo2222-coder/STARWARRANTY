import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADQUARTERS_ADMIN_EMAILS = [
  "madeo8888@gmail.com",
  "y.shimizu@st-w.jp",
  "s.hidaka@st-w.jp",
  "n.fukuda@st-w.jp",
  "t.hiraga@st-w.jp",
];

type PartnerRow = {
  id: string;
  partner_code: string | null;
  partner_type: string;
  company_name: string;
  representative_name: string | null;
  contact_name: string | null;
  status: string;
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

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
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
    throw new Error("本部最高権限アカウントのみ利用できます");
  }

  return {
    supabase,
    user,
    email,
  };
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireHeadquartersAdmin(request);

    const { data, error } = await supabase
      .from("partners")
      .select(
        `
          id,
          partner_code,
          partner_type,
          company_name,
          representative_name,
          contact_name,
          status
        `
      )
      .eq("status", "active")
      .order("company_name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      partners: (data || []) as PartnerRow[],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "提出元一覧の取得に失敗しました",
      },
      { status: 403 }
    );
  }
}