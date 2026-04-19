"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  agency_name?: string | null;
  name?: string | null;
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
};

type BankTransferDocumentView = BankTransferDocumentRow & {
  signed_url: string | null;
};

function getSafeExtension(fileName: string) {
  const parts = fileName.split(".");
  if (parts.length < 2) return "";
  const ext = parts.pop() || "";
  return ext.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createSafeStorageFileName(originalFileName: string) {
  const ext = getSafeExtension(originalFileName);
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now();
  return ext
    ? `${timestamp}-${randomPart}.${ext}`
    : `${timestamp}-${randomPart}`;
}

export default function EditCustomerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [documents, setDocuments] = useState<BankTransferDocumentView[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null
  );

  const [errorMsg, setErrorMsg] = useState("");
  const [agencyError, setAgencyError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [contactName, setContactName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [managementId, setManagementId] = useState("");
  const [status, setStatus] = useState<"active" | "cancelled">("active");
  const [cancelDate, setCancelDate] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [agencyId, setAgencyId] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadNote, setUploadNote] = useState("");

  useEffect(() => {
    if (!id) return;
    void init();
  }, [id]);

  async function init() {
    setLoading(true);
    await Promise.all([fetchAgencies(), fetchCustomer(), fetchDocuments()]);
    setLoading(false);
  }

  async function fetchAgencies() {
    const { data, error } = await supabase
      .from("agencies")
      .select("id, agency_name, name")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("agency fetch error:", error);
      setAgencyError("代理店の取得に失敗しました");
      return;
    }

    setAgencies((data ?? []) as Agency[]);
  }

  async function fetchCustomer() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("customer fetch error:", error);
      setErrorMsg("顧客情報の取得に失敗しました");
      return;
    }

    setCompanyName(data.company_name || "");
    setRepresentativeName(data.representative_name || "");
    setContactName(data.contact_name || "");
    setStoreName(data.store_name || "");
    setEmail(data.email || "");
    setPhone(data.phone || "");
    setPostalCode(data.postal_code || "");
    setAddress(data.address || "");
    setServiceName(data.service_name || "");
    setPaymentMethod((data.payment_method || "card") as "card" | "bank");
    setMonthlyAmount(
      data.monthly_amount !== null && data.monthly_amount !== undefined
        ? String(data.monthly_amount)
        : ""
    );
    setStartDate(data.start_date || "");
    setManagementId(data.management_id || "");
    setStatus((data.status || "active") as "active" | "cancelled");
    setCancelDate(data.cancel_date || "");
    setCancelReason(data.cancel_reason || "");
    setAgencyId(data.agency_id || "");
  }

  async function fetchDocuments() {
    const { data, error } = await supabase
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
        created_at
      `
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("document fetch error:", error);
      setUploadError("既存の口座振替用紙取得に失敗しました");
      return;
    }

    const rows = (data ?? []) as BankTransferDocumentRow[];

    const docsWithUrls = await Promise.all(
      rows.map(async (row) => {
        if (!row.file_path) {
          return { ...row, signed_url: null };
        }

        const { data: signedData, error: signedError } = await supabase.storage
          .from("bank-transfer-docs")
          .createSignedUrl(row.file_path, 60 * 60);

        if (signedError) {
          console.error("signed url create error:", signedError);
          return { ...row, signed_url: null };
        }

        return {
          ...row,
          signed_url: signedData?.signedUrl ?? null,
        };
      })
    );

    setDocuments(docsWithUrls);
  }

  const agencyOptions = useMemo(() => {
    return agencies.map((agency) => ({
      id: agency.id,
      label: agency.agency_name || agency.name || "名称未設定",
    }));
  }, [agencies]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setSelectedFiles(files);
    setUploadError("");
    setUploadSuccess("");
  }

  function formatFileSize(value: number | null) {
    if (!value || value <= 0) return "-";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleUploadDocuments() {
    setUploadError("");
    setUploadSuccess("");

    if (selectedFiles.length === 0) {
      setUploadError("アップロードするファイルを選択してください");
      return;
    }

    try {
      setUploading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setUploadError("ログイン情報の取得に失敗しました");
        return;
      }

      for (const file of selectedFiles) {
        const isPdf = file.type === "application/pdf";
        const isImage = file.type.startsWith("image/");

        if (!isPdf && !isImage) {
          setUploadError("PDF または画像ファイルのみアップロードできます");
          setUploading(false);
          return;
        }

        const safeStorageName = createSafeStorageFileName(file.name);
        const filePath = `${id}/${safeStorageName}`;

        const { error: uploadStorageError } = await supabase.storage
          .from("bank-transfer-docs")
          .upload(filePath, file, {
            upsert: false,
          });

        if (uploadStorageError) {
          console.error("storage upload error:", uploadStorageError);
          setUploadError(`Storage保存に失敗しました: ${uploadStorageError.message}`);
          setUploading(false);
          return;
        }

        const { error: insertError } = await supabase
          .from("bank_transfer_documents")
          .insert([
            {
              customer_id: id,
              file_name: file.name,
              file_path: filePath,
              file_type: file.type || null,
              file_size: file.size || null,
              uploaded_by: user.id,
              upload_source: null,
              status: "uploaded",
              note: uploadNote.trim() || null,
            },
          ]);

        if (insertError) {
          console.error("document insert error:", insertError);
          setUploadError(`ファイル記録に失敗しました: ${insertError.message}`);
          setUploading(false);
          return;
        }
      }

      setSelectedFiles([]);
      setUploadNote("");
      setUploadSuccess("口座振替用紙を保存しました");
      await fetchDocuments();
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDocument(doc: BankTransferDocumentView) {
    const confirmed = window.confirm(
      `「${doc.file_name || "このファイル"}」を削除しますか？\n\nこの操作は取り消せません。`
    );

    if (!confirmed) return;

    try {
      setDeletingDocumentId(doc.id);
      setUploadError("");
      setUploadSuccess("");

      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from("bank-transfer-docs")
          .remove([doc.file_path]);

        if (storageError) {
          setUploadError(`Storage削除に失敗しました: ${storageError.message}`);
          return;
        }
      }

      const { error: deleteError } = await supabase
        .from("bank_transfer_documents")
        .delete()
        .eq("id", doc.id);

      if (deleteError) {
        setUploadError(`ファイル記録削除に失敗しました: ${deleteError.message}`);
        return;
      }

      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
      setUploadSuccess("口座振替用紙を削除しました");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    const resolvedName =
      companyName.trim() ||
      storeName.trim() ||
      representativeName.trim() ||
      "名称未設定";

    const payload = {
      name: resolvedName,
      company_name: companyName || null,
      representative_name: representativeName || null,
      contact_name: contactName || null,
      store_name: storeName || null,
      email: email || null,
      phone: phone || null,
      postal_code: postalCode || null,
      address: address || null,
      service_name: serviceName || null,
      payment_method: paymentMethod || null,
      monthly_amount: monthlyAmount ? Number(monthlyAmount) : null,
      start_date: startDate || null,
      management_id: managementId || null,
      status,
      cancel_date: cancelDate || null,
      cancel_reason: cancelReason || null,
      agency_id: agencyId || null,
    };

    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("customer update error:", error);
      setErrorMsg("更新に失敗しました。RLSまたはデータ形式を確認してください");
      setSaving(false);
      return;
    }

    alert("顧客情報を更新しました");
    router.push(`/customers/${id}`);
    router.refresh();
  }

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">顧客編集</h1>
        <Link
          href={`/customers/${id}`}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          顧客詳細へ戻る
        </Link>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-100 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {agencyError && (
        <div className="rounded-lg bg-yellow-100 p-3 text-sm text-yellow-700">
          {agencyError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border bg-white p-4 shadow-sm md:p-6"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">会社名</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">代理店</label>
            <select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">未選択</option>
              {agencyOptions.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">代表者名</label>
            <input
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">担当者名</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">店舗名</label>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">メール</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">電話番号</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">郵便番号</label>
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">住所</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">サービス名</label>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">決済方法</label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as "card" | "bank")
              }
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="card">カード</option>
              <option value="bank">口座振替</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">月額</label>
            <input
              type="number"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">開始日</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">管理ID</label>
            <input
              value={managementId}
              onChange={(e) => setManagementId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">状態</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "active" | "cancelled")
              }
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="active">active</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">解約日</label>
            <input
              type="date"
              value={cancelDate}
              onChange={(e) => setCancelDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">解約理由</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-5 py-2 text-white"
          >
            {saving ? "更新中..." : "更新する"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border bg-white p-4 shadow-sm md:p-6">
        <h2 className="mb-2 text-lg font-bold">口座振替用紙アップロード</h2>
        <p className="mb-4 text-sm text-gray-500">
          PDF または写メを保存できます。複数選択も可能です。
        </p>

        {uploadError && (
          <div className="mb-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">
            {uploadError}
          </div>
        )}

        {uploadSuccess && (
          <div className="mb-3 rounded-lg bg-green-100 p-3 text-sm text-green-700">
            {uploadSuccess}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">ファイル選択</label>
            <input
              type="file"
              accept="application/pdf,image/*"
              multiple
              onChange={handleFileChange}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">備考</label>
            <textarea
              value={uploadNote}
              onChange={(e) => setUploadNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：初回受領分、再提出分など"
            />
          </div>

          {selectedFiles.length > 0 ? (
            <div className="rounded-lg border bg-gray-50 p-3 text-sm">
              <div className="mb-2 font-medium">アップロード予定ファイル</div>
              <div className="space-y-1">
                {selectedFiles.map((file) => (
                  <div key={`${file.name}-${file.size}`}>
                    {file.name} / {formatFileSize(file.size)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleUploadDocuments}
              disabled={uploading}
              className="rounded-lg border px-5 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? "アップロード中..." : "口座振替用紙を保存する"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-bold">保存済みファイル</h2>

        {documents.length === 0 ? (
          <div className="text-sm text-gray-500">
            まだ保存済みファイルはありません
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
                    {doc.note ? (
                      <div className="text-gray-500">備考: {doc.note}</div>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    {doc.signed_url ? (
                      <a
                        href={doc.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        開く
                      </a>
                    ) : (
                      <span className="text-sm text-gray-400">URL取得不可</span>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleDeleteDocument(doc)}
                      disabled={deletingDocumentId === doc.id}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingDocumentId === doc.id ? "削除中..." : "削除"}
                    </button>
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