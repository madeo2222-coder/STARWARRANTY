import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CustomerBody = {
  id?: string;
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  postal_code?: string;
  address?: string;
  note?: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");

  return createClient(supabaseUrl, serviceRoleKey);
}

function clean(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranty_customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, customers: data || [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "顧客一覧取得エラー" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CustomerBody;

    if (!body.company_name?.trim()) {
      return NextResponse.json({ success: false, error: "会社名を入力してください" }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { error } = await supabase.from("warranty_customers").insert({
      company_name: clean(body.company_name),
      contact_name: clean(body.contact_name),
      email: clean(body.email),
      phone: clean(body.phone),
      postal_code: clean(body.postal_code),
      address: clean(body.address),
      note: clean(body.note),
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "顧客登録エラー" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as CustomerBody;

    if (!body.id) {
      return NextResponse.json({ success: false, error: "id がありません" }, { status: 400 });
    }

    if (!body.company_name?.trim()) {
      return NextResponse.json({ success: false, error: "会社名を入力してください" }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { error } = await supabase
      .from("warranty_customers")
      .update({
        company_name: clean(body.company_name),
        contact_name: clean(body.contact_name),
        email: clean(body.email),
        phone: clean(body.phone),
        postal_code: clean(body.postal_code),
        address: clean(body.address),
        note: clean(body.note),
      })
      .eq("id", body.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "顧客更新エラー" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as CustomerBody;

    if (!body.id) {
      return NextResponse.json({ success: false, error: "id がありません" }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { error } = await supabase
      .from("warranty_customers")
      .delete()
      .eq("id", body.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "顧客削除エラー" },
      { status: 500 }
    );
  }
}