"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type CustomerDetail = {
  id: string;
  company_name: string | null;
  representative_name: string | null;
  contact_name: string | null;
  store_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  service_name: string | null;
  payment_method: string | null;
  monthly_amount: number | null;
  start_date: string | null;
  management_id: string | null;
  status: string | null;
  cancel_date: string | null;
  cancel_reason: string | null;
  agency_id: string | null;
  agencies:
    | {
        id: string;
        agency_name?: string | null;
        name?: string | null;
      }
    | null;
};

type BankTransferDocumentRow = {
  id: string;
  customer_id: string | null;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  upload_source: string | null;
  status: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type BankTransferDocumentView = BankTransferDocumentRow & {
  signed_url: string | null;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [documents, setDocuments] = useState<BankTransferDocumentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingCustomer, setDeletingCustomer] = useState(false);

  useEffect(() => {
    if (!id) return;
    void fetchPageData();
  }, [id]);

  async function fetchPageData() {
    setLoading(true);

    try {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select(
          `
          id,
          company_name,
          representative_name,
          contact_name,
          store_name,
          email,
          phone,
          postal_code,
          address,
          service_name,
          payment_method,
          monthly_amount,
          start_date,
          management_id,
          status,
          cancel_date,
          cancel_reason,
          agency_id,
          agencies (
            id,
            agency_name,
            name
          )
        `
        )
        .eq("id", id)
        .single();

      if (customerError) {
        console.error("customer detail fetch error:", customerError);
        alert("顧客詳細の取得に失敗しました");
        return;
      }

      setCustomer((customerData ?? null) as CustomerDetail | null);

      const { data: docsData, error: docsError } = await supabase
        .from("bank_transfer_documents")
        .select(
          `
          id,
          customer_id,
          file_name,
          file_path,
          file_type,
          file_size,
          uploaded_by,
          upload_source,
          status,
          note,
          created_at,
          updated_at
        `
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: false });

      if (docsError) {
        console.error("bank transfer documents fetch error:", docsError);
        alert("口座振替用紙の取得に失敗しました");
        return;
      }

      const rows = (docsData ?? []) as BankTransferDocumentRow[];

      const docsWithUrls = await Promise.all(
        rows.map(async (row) => {
          if (!row.file_path) {
            return {
              ...row,
              signed_url: null,
            };
          }

          const { data: signedData, error: signedError } = await supabase.storage
            .from("bank-transfer-docs")
            .createSignedUrl(row.file_path, 60 * 60);

          if (signedError) {
            console.error("signed url create error:", signedError);
            return {
              ...row,
              signed_url: null,
            };
          }

          return {
            ...row,
            signed_url: signedData?.signedUrl ?? null,
          };
        })
      );

      setDocuments(docsWithUrls);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCustomer() {
    if (!customer) return;

    const customerLabel =
      customer.company_name ||
      customer.store_name ||
      customer.representative_name ||
      "名称未設定";

    const confirmed = window.confirm(
      `「${customerLabel}」を削除しますか？\n\n請求・契約・口座振替用紙がある顧客は削除できません。`
    );

    if (!confirmed) return;

    try {
      setDeletingCustomer(true);

      const { data: billingRows, error: billingError } = await supabase
        .from("billings")
        .select("id")
        .eq("customer_id", customer.id)
        .limit(1);

      if (billingError) {
        alert(`請求確認に失敗しました: ${billingError.message}`);
        return;
      }

      if (billingRows && billingRows.length > 0) {
        alert("この顧客には請求データが紐づいているため削除できません");
        return;
      }

      const { data: contractRows, error: contractError } = await supabase
        .from("contracts")
        .select("id")
        .eq("customer_id", customer.id)
        .limit(1);

      if (contractError) {
        alert(`契約確認に失敗しました: ${contractError.message}`);
        return;
      }

      if (contractRows && contractRows.length > 0) {
        alert("この顧客には契約データが紐づいているため削除できません");
        return;
      }

      const { data: documentRows, error: documentError } = await supabase
        .from("bank_transfer_documents")
        .select("id")
        .eq("customer_id", customer.id)
        .limit(1);

      if (documentError) {
        alert(`口振ファイル確認に失敗しました: ${documentError.message}`);
        return;
      }

      if (documentRows && documentRows.length > 0) {
        alert("この顧客には口座振替用紙が紐づいているため削除できません");
        return;
      }

      const { error: deleteError } = await supabase
        .from("customers")
        .delete()
        .eq("id", customer.id);

      if (deleteError) {
        alert(`顧客削除に失敗しました: ${deleteError.message}`);
        return;
      }

      alert("顧客を削除しました");
      router.push("/customers");
      router.refresh();
    } finally {
      setDeletingCustomer(false);
    }
  }

  function formatMoney(value: number | null) {
    return `¥${Number(value || 0).toLocaleString()}`;
  }

  function formatFileSize(value: number | null) {
    if (!value || value <= 0) return "-";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getPaymentLabel(paymentMethod: string | null) {
    if (paymentMethod === "card") return "クレジットカード";
    if (paymentMethod === "bank") return "口座振替";
    return "-";
  }

  function getStatusLabel(status: string | null) {
    if (status === "active") return "稼働中";
    if (status === "cancelled") return "解約";
    return "-";
  }

  function getAgencyLabel() {
    return customer?.agencies?.agency_name || customer?.agencies?.name || "-";
  }

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (!customer) {
    return <div className="p-6">顧客情報が見つかりません</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">顧客詳細</h1>

        <div className="flex gap-2">
          <Link
            href="/customers"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            顧客一覧へ戻る
          </Link>
          <Link
            href={`/customers/${customer.id}/edit`}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
          >
            編集する
          </Link>
          <button
            type="button"
            onClick={() => void handleDeleteCustomer()}
            disabled={deletingCustomer}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deletingCustomer ? "削除中..." : "顧客削除"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm md:p-6">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <Info label="会社名" value={customer.company_name} />
          <Info label="店舗名" value={customer.store_name} />
          <Info label="代表者名" value={customer.representative_name} />
          <Info label="担当者名" value={customer.contact_name} />
          <Info label="メール" value={customer.email} />
          <Info label="電話番号" value={customer.phone} />
          <Info label="郵便番号" value={customer.postal_code} />
          <Info label="住所" value={customer.address} />
          <Info label="サービス名" value={customer.service_name} />
          <Info label="代理店" value={getAgencyLabel()} />
          <Info label="決済方法" value={getPaymentLabel(customer.payment_method)} />
          <Info label="月額" value={formatMoney(customer.monthly_amount)} />
          <Info label="開始日" value={customer.start_date} />
          <Info label="管理ID" value={customer.management_id} />
          <Info label="状態" value={getStatusLabel(customer.status)} />
          <Info label="解約日" value={customer.cancel_date} />
          <div className="md:col-span-2">
            <Info label="解約理由" value={customer.cancel_reason} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">口座振替用紙</h2>
            <p className="text-sm text-gray-500">
              PDF または写メを顧客ごとに保存しています
            </p>
          </div>

          <Link
            href={`/customers/${customer.id}/edit`}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            ファイルを追加する
          </Link>
        </div>

        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
            まだ口座振替用紙は登録されていません
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">
                      {doc.file_name || "ファイル名未設定"}
                    </div>
                    <div className="text-gray-500">
                      種別: {doc.file_type || "-"} / サイズ: {formatFileSize(doc.file_size)}
                    </div>
                    <div className="text-gray-500">
                      登録日時: {doc.created_at || "-"}
                    </div>
                    <div className="text-gray-500">
                      ステータス: {doc.status || "-"}
                    </div>
                    {doc.note ? (
                      <div className="text-gray-500">備考: {doc.note}</div>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    {doc.signed_url ? (
                      <>
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          開く
                        </a>
                        <a
                          href={doc.signed_url}
                          download={doc.file_name || undefined}
                          className="rounded-lg bg-black px-4 py-2 text-sm text-white"
                        >
                          ダウンロード
                        </a>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">
                        ファイルURL取得不可
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div>
      <p className="mb-1 text-sm text-gray-500">{label}</p>
      <div className="flex min-h-[44px] items-center rounded-lg border px-3 py-2">
        {value || "-"}
      </div>
    </div>
  );
}