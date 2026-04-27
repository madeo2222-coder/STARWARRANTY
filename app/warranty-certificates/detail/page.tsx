import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import * as QRCode from "qrcode";
export const dynamic = "force-dynamic";

type WarrantyCertificateDetail = {
  id: string;
  certificate_no: string;
  customer_name: string;
  customer_name_kana: string | null;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  property_name: string | null;
  property_room: string | null;
  start_date: string;
  end_date: string | null;
  introducer_name: string | null;
  seller_name: string | null;
  status: string;
  note: string | null;
  repair_form_token: string;
  created_at: string;
  warranty_certificate_items: {
    is_enabled: boolean;
    coverage_limit_amount: number | null;
    note: string | null;
    warranty_products: {
      product_name: string;
      category: string | null;
      warranty_years: number | null;
    } | null;
  }[];
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

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function statusLabel(status: string) {
  switch (status) {
    case "active":
      return "有効";
    case "expired":
      return "終了";
    case "cancelled":
      return "解約";
    case "invalid":
      return "無効";
    default:
      return status;
  }
}

function buildAddress(data: WarrantyCertificateDetail) {
  return [data.address1, data.address2, data.address3].filter(Boolean).join(" ");
}

export default async function WarrantyCertificateDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  if (!id) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          id が指定されていません
        </div>
      </div>
    );
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("warranty_certificates")
    .select(
      `
      id,
      certificate_no,
      customer_name,
      customer_name_kana,
      postal_code,
      address1,
      address2,
      address3,
      property_name,
      property_room,
      start_date,
      end_date,
      introducer_name,
      seller_name,
      status,
      note,
      repair_form_token,
      created_at,
      warranty_certificate_items (
        is_enabled,
        coverage_limit_amount,
        note,
        warranty_products (
          product_name,
          category,
          warranty_years
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          保証書が見つかりませんでした
        </div>
      </div>
    );
  }

  const certificate = data as unknown as WarrantyCertificateDetail;
  const enabledItems = (certificate.warranty_certificate_items || []).filter(
    (item) => item.is_enabled
  );

  const appBaseUrl = getAppBaseUrl();
  const publicRepairFormUrl = `${appBaseUrl}/repair-request-form?token=${certificate.repair_form_token}`;
  const printableWarrantyUrl = `/api/generate-warranty-pdf?id=${certificate.id}`;

  const qrCodeDataUrl = await QRCode.toDataURL(publicRepairFormUrl, {
    width: 220,
    margin: 1,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">保証書詳細</h1>
          <p className="mt-1 text-sm text-gray-500">
            登録済み保証書の内容を確認します
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={printableWarrantyUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            保証書印刷表示
          </a>
          <a
            href={publicRepairFormUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            修理受付フォーム
          </a>
          <Link
            href="/warranty-certificates"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            一覧へ戻る
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">基本情報</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm text-gray-500">保証書番号</div>
                <div className="mt-1 font-medium">{certificate.certificate_no}</div>
              </div>

              <div>
                <div className="text-sm text-gray-500">状態</div>
                <div className="mt-1 font-medium">{statusLabel(certificate.status)}</div>
              </div>

              <div>
                <div className="text-sm text-gray-500">施主名</div>
                <div className="mt-1 font-medium">{certificate.customer_name}</div>
              </div>

              <div>
                <div className="text-sm text-gray-500">施主名カナ</div>
                <div className="mt-1 font-medium">
                  {certificate.customer_name_kana || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">保証開始日</div>
                <div className="mt-1 font-medium">
                  {formatDate(certificate.start_date)}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">登録日</div>
                <div className="mt-1 font-medium">
                  {formatDate(certificate.created_at)}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">紹介者名</div>
                <div className="mt-1 font-medium">
                  {certificate.introducer_name || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">販売店名</div>
                <div className="mt-1 font-medium">
                  {certificate.seller_name || "-"}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm text-gray-500">郵便番号</div>
                <div className="mt-1 font-medium">
                  {certificate.postal_code || "-"}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm text-gray-500">住所</div>
                <div className="mt-1 font-medium">
                  {buildAddress(certificate) || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">物件名</div>
                <div className="mt-1 font-medium">
                  {certificate.property_name || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">部屋番号</div>
                <div className="mt-1 font-medium">
                  {certificate.property_room || "-"}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm text-gray-500">備考</div>
                <div className="mt-1 whitespace-pre-wrap font-medium">
                  {certificate.note || "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">保証対象機器</h2>
            <p className="mt-1 text-sm text-gray-500">
              ONになっている機器のみ表示しています
            </p>

            {enabledItems.length === 0 ? (
              <div className="mt-4 text-sm text-gray-500">
                対象機器はありません。
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {enabledItems.map((item, index) => (
                  <div
                    key={`${item.warranty_products?.product_name || "item"}-${index}`}
                    className="rounded-xl border p-4"
                  >
                    <div className="font-medium">
                      {item.warranty_products?.product_name || "-"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.warranty_products?.category || "-"} /{" "}
                      {item.warranty_products?.warranty_years || "-"}年保証
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      保証限度額:{" "}
                      {item.coverage_limit_amount
                        ? `${Number(item.coverage_limit_amount).toLocaleString("ja-JP")}円`
                        : "-"}
                    </div>
                    {item.note ? (
                      <div className="mt-2 text-xs text-gray-500">
                        備考: {item.note}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">修理受付QRコード</h2>
            <p className="mt-2 text-sm text-gray-600">
              お客様がこのQRコードを読み込むと、修理受付フォームが開きます。
            </p>

            <div className="mt-4 rounded-xl border p-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeDataUrl}
                alt="修理受付QRコード"
                className="mx-auto h-[220px] w-[220px]"
              />
              <div className="mt-3 text-sm font-medium">修理受付はこちら</div>
              <div className="mt-2 break-all text-xs text-gray-500">
                {publicRepairFormUrl}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">操作</h2>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href={publicRepairFormUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-black px-4 py-2 text-center text-sm text-white hover:opacity-90"
              >
                修理受付フォームを開く
              </a>
              <Link
                href="/repair-requests"
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                修理受付管理へ
              </Link>
              <Link
                href="/warranty-certificates"
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                保証書一覧へ戻る
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}