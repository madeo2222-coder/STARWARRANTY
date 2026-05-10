import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RepairRequestRow = {
  request_no: string;
  agency_name: string | null;
  customer_name: string;
  phone: string;
  product_name: string;
  symptom_category: string | null;
  status: string;
  assigned_to: string | null;
  certificate_no: string | null;
  created_at: string;
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

function statusLabel(status: string) {
  switch (status) {
    case "received":
      return "受付";
    case "checking":
      return "内容確認中";
    case "manufacturer_checking":
      return "メーカー確認中";
    case "repair_arranging":
      return "修理手配中";
    case "visit_scheduling":
      return "訪問日調整中";
    case "completed":
      return "修理完了";
    case "out_of_warranty":
      return "保証対象外";
    case "cancelled":
      return "キャンセル";
    default:
      return status;
  }
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agency = searchParams.get("agency") || "";

    const supabase = getAdminClient();

    let query = supabase
      .from("repair_requests")
      .select(
        "request_no, agency_name, customer_name, phone, product_name, symptom_category, status, assigned_to, certificate_no, created_at"
      )
      .order("created_at", { ascending: false });

    if (agency) {
      if (agency === "未設定") {
        query = query.is("agency_name", null);
      } else {
        query = query.eq("agency_name", agency);
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = (data || []) as RepairRequestRow[];

    const headers = [
      "受付番号",
      "代理店名",
      "顧客名",
      "電話番号",
      "対象機器",
      "症状区分",
      "ステータス",
      "担当者",
      "保証書番号",
      "受付日時",
    ];

    const csvRows = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) =>
        [
          row.request_no,
          row.agency_name || "未設定",
          row.customer_name,
          row.phone,
          row.product_name,
          row.symptom_category || "",
          statusLabel(row.status),
          row.assigned_to || "",
          row.certificate_no || "",
          formatDateTime(row.created_at),
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];

    const csv = "\uFEFF" + csvRows.join("\r\n");

    const fileName = agency
      ? `repair-requests-${agency}.csv`
      : "repair-requests.csv";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          fileName
        )}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "CSV出力に失敗しました";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}