import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RepairRequestStatusRow = {
  id: string;
  request_no: string;
  customer_name: string;
  phone: string;
  product_name: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
};

type RepairRequestHistoryRow = {
  id: string;
  action_type: string;
  title: string;
  detail: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  received: "受付",
  checking: "内容確認中",
  manufacturer_checking: "メーカー確認中",
  repair_arranging: "修理手配中",
  visit_scheduling: "訪問日調整中",
  completed: "修理完了",
  out_of_warranty: "",
  cancelled: "キャンセル",
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

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestNo = String(searchParams.get("request_no") || "").trim();
    const phone = String(searchParams.get("phone") || "").trim();

    if (!requestNo) {
      return NextResponse.json(
        { success: false, error: "受付番号を入力してください" },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "電話番号を入力してください" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("repair_requests")
      .select(
        "id, request_no, customer_name, phone, product_name, status, assigned_to, created_at"
      )
      .eq("request_no", requestNo)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: "該当する受付情報が見つかりません" },
        { status: 404 }
      );
    }

    const repairRequest = data as RepairRequestStatusRow;

    if (normalizePhone(repairRequest.phone) !== normalizePhone(phone)) {
      return NextResponse.json(
        { success: false, error: "受付番号または電話番号が一致しません" },
        { status: 403 }
      );
    }

    const { data: historiesData } = await supabase
      .from("repair_request_histories")
      .select("id, action_type, title, detail, created_at")
      .eq("repair_request_id", repairRequest.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const histories = (historiesData || []) as RepairRequestHistoryRow[];

    return NextResponse.json({
      success: true,
      request: {
        request_no: repairRequest.request_no,
        customer_name: repairRequest.customer_name,
        product_name: repairRequest.product_name,
        status: repairRequest.status,
        status_label: STATUS_LABELS[repairRequest.status] || repairRequest.status,
        assigned_to: repairRequest.assigned_to,
        created_at: repairRequest.created_at,
      },
      histories: histories.map((history) => ({
        id: history.id,
        action_type: history.action_type,
        title: history.title,
        detail: history.detail,
        created_at: history.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "受付状況の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}