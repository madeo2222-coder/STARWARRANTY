import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase環境変数が不足しています");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

type UpsertPayoutBody = {
  agency_id?: string;
  month?: string;
  amount?: number;
};

type CompletePayoutBody = {
  payout_id?: string;
};

export async function GET(request: Request) {
  try {
    const admin = getAdminClient();
    const { searchParams } = new URL(request.url);

    const month = searchParams.get("month");

    let query = admin
      .from("payouts")
      .select("id, agency_id, month, amount, status, paid_at, created_at")
      .order("created_at", { ascending: false });

    if (month) {
      query = query.eq("month", month);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payouts: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "不明なエラー",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = getAdminClient();
    const body = (await request.json()) as UpsertPayoutBody;

    const agencyId = body.agency_id?.trim();
    const month = body.month?.trim();
    const amount = Number(body.amount || 0);

    if (!agencyId || !month) {
      return NextResponse.json(
        { success: false, error: "agency_id と month は必須です" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await admin
      .from("payouts")
      .select("id, agency_id, month, amount, status, paid_at, created_at")
      .eq("agency_id", agencyId)
      .eq("month", month)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { success: false, error: existingError.message },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json({
        success: true,
        payout: existing,
      });
    }

    const { data, error } = await admin
      .from("payouts")
      .insert({
        agency_id: agencyId,
        month,
        amount,
        status: "pending",
      })
      .select("id, agency_id, month, amount, status, paid_at, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payout: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "不明なエラー",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = getAdminClient();
    const body = (await request.json()) as CompletePayoutBody;

    const payoutId = body.payout_id?.trim();

    if (!payoutId) {
      return NextResponse.json(
        { success: false, error: "payout_id は必須です" },
        { status: 400 }
      );
    }

    const paidAt = new Date().toISOString();

    const { data, error } = await admin
      .from("payouts")
      .update({
        status: "done",
        paid_at: paidAt,
      })
      .eq("id", payoutId)
      .select("id, agency_id, month, amount, status, paid_at, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payout: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "不明なエラー",
      },
      { status: 500 }
    );
  }
}