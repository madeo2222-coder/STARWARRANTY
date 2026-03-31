"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const STORAGE_BUCKET = "bank-transfer-docs";

type Contract = {
  id: string;
  customer_id: string | null;
  contract_name?: string | null;
  amount?: number | null;
  cost?: number | null;
  commission?: number | null;
  profit?: number | null;
  payment_method?: string | null;
  status?: string | null;
  contract_date?: string | null;
  [key: string]: any;
};

type Customer = {
  id: string;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  company?: string | null;
  customer_name?: string | null;
  name?: string | null;
  [key: string]: any;
};

type Payment = {
  id: string;
  contract_id: string | null;
  customer_id?: string | null;
  payment_method?: string | null;
  registration_url?: string | null;
  registration_status?: string | null;
  billing_status?: string | null;
  form_document_status?: string | null;
  sent_via?: string | null;
  note?: string | null;
  created_at?: string | null;
  [key: string]: any;
};

type BankTransferDocument = {
  id: string;
  contract_id?: string | null;
  payment_id?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  created_at?: string | null;
  status?: string | null;
  [key: string]: any;
};

export default function PaymentLinkPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params.contractId as string;

  const [contract, setContract] = useState<Contract | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [documents, setDocuments] = useState<BankTransferDocument[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("card");
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("pending");
  const [billingStatus, setBillingStatus] = useState("inactive");
  const [formDocumentStatus, setFormDocumentStatus] = useState("not_required");
  const [sentVia, setSentVia] = useState("email");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!contractId) return;
    fetchData();
  }, [contractId]);

  async function fetchData() {
    try {
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { data: contractData, error: contractError } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .single();

      if (contractError || !contractData) {
        throw new Error("契約情報が見つかりません");
      }

      setContract(contractData as Contract);

      let customerData: Customer | null = null;
      if (contractData.customer_id) {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("id", contractData.customer_id)
          .single();

        if (error) {
          throw new Error(`顧客取得エラー: ${error.message}`);
        }
        customerData = data as Customer;
      }

      setCustomer(customerData);

      const { data: paymentData, error: paymentError } = await supabase
        .from("payments")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (paymentError) {
        throw new Error(`payments取得エラー: ${paymentError.message}`);
      }

      const latestPayment = (paymentData as Payment | null) || null;
      setPayment(latestPayment);

      const initialMethod =
        latestPayment?.payment_method || contractData.payment_method || "card";
      setPaymentMethod(initialMethod);
      setRegistrationUrl(latestPayment?.registration_url || "");
      setRegistrationStatus(latestPayment?.registration_status || "pending");
      setBillingStatus(latestPayment?.billing_status || "inactive");
      setSentVia(latestPayment?.sent_via || "email");
      setNote(latestPayment?.note || "");

      if (initialMethod === "bank") {
        setFormDocumentStatus(
          latestPayment?.form_document_status || "waiting_upload"
        );
      } else {
        setFormDocumentStatus(
          latestPayment?.form_document_status || "not_required"
        );
      }

      const { data: docsData, error: docsError } = await supabase
        .from("bank_transfer_documents")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });

      if (docsError) {
        throw new Error(`書類取得エラー: ${docsError.message}`);
      }

      setDocuments((docsData as BankTransferDocument[]) || []);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function getCustomerName(c: Customer | null) {
    if (!c) return "未設定";
    return (
      c.company_name ||
      c.company ||
      c.customer_name ||
      c.name ||
      "未設定"
    );
  }

  function formatYen(value?: number | null) {
    if (value == null) return "-";
    return `¥${Number(value).toLocaleString()}`;
  }

  function formatDate(value?: string | null) {
    if (!value) return "-";
    return value.replace("T", " ").slice(0, 16);
  }

  function formatFileSize(size?: number | null) {
    if (!size) return "-";
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  async function ensurePaymentRecord() {
    if (payment?.id) return payment.id;

    if (!contract) {
      throw new Error("契約情報がありません");
    }

    const insertPayload = {
      contract_id: contract.id,
      customer_id: contract.customer_id,
      payment_method: paymentMethod,
      registration_url: registrationUrl.trim(),
      registration_status: registrationStatus,
      billing_status: billingStatus,
      form_document_status:
        paymentMethod === "bank" ? formDocumentStatus : "not_required",
      sent_via: sentVia,
      note: note.trim(),
    };

    const { data, error } = await supabase
      .from("payments")
      .insert([insertPayload])
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || "payments作成に失敗しました");
    }

    setPayment(data as Payment);
    return data.id as string;
  }

  async function handleSave() {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const paymentId = await ensurePaymentRecord();

      const payload = {
        payment_method: paymentMethod,
        registration_url: registrationUrl.trim(),
        registration_status: registrationStatus,
        billing_status: billingStatus,
        form_document_status:
          paymentMethod === "bank" ? formDocumentStatus : "not_required",
        sent_via: sentVia,
        note: note.trim(),
      };

      const { data, error } = await supabase
        .from("payments")
        .update(payload)
        .eq("id", paymentId)
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || "保存に失敗しました");
      }

      setPayment(data as Payment);
      setSuccessMessage("決済管理情報を保存しました");
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const paymentId = await ensurePaymentRecord();

      if (paymentMethod !== "bank") {
        throw new Error("口座振替のみ書類アップロードできます");
      }

      const filePath = `${contractId}/${Date.now()}_${file.name.replace(
        /\s+/g,
        "_"
      )}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(`アップロード失敗: ${uploadError.message}`);
      }

      const { error: insertError } = await supabase
        .from("bank_transfer_documents")
        .insert([
          {
            contract_id: contractId,
            payment_id: paymentId,
            customer_id: customer?.id || null,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
            status: "uploaded",
          },
        ]);

      if (insertError) {
        throw new Error(`書類保存失敗: ${insertError.message}`);
      }

      const { data: updatedPayment, error: paymentUpdateError } = await supabase
        .from("payments")
        .update({
          form_document_status: "uploaded",
        })
        .eq("id", paymentId)
        .select()
        .single();

      if (paymentUpdateError || !updatedPayment) {
        throw new Error(
          paymentUpdateError?.message || "書類状態更新に失敗しました"
        );
      }

      setPayment(updatedPayment as Payment);
      setFormDocumentStatus("uploaded");
      setSuccessMessage("書類をアップロードしました");
      e.target.value = "";

      await fetchData();
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "アップロードに失敗しました");
      e.target.value = "";
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenFile(filePath?: string | null) {
    if (!filePath) return;

    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(filePath, 60 * 10);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "ファイルURL生成に失敗しました");
      }

      window.open(data.signedUrl, "_blank");
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "ファイルを開けませんでした");
    }
  }

  async function copyText(text: string, successText: string) {
    try {
      if (!text) {
        setErrorMessage("コピー対象がありません");
        return;
      }
      await navigator.clipboard.writeText(text);
      setSuccessMessage(successText);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("コピーに失敗しました");
    }
  }

  const customerName = useMemo(() => getCustomerName(customer), [customer]);

  const lineText = useMemo(() => {
    return `決済登録のご案内です。
顧客名：${customerName}
契約名：${contract?.contract_name || "-"}
契約金額：${formatYen(contract?.amount)}
支払方法：${paymentMethod === "bank" ? "口座振替" : "クレジットカード"}
登録URL：${registrationUrl || "未設定"}`;
  }, [customerName, contract, paymentMethod, registrationUrl]);

  const mailText = useMemo(() => {
    return `${customerName} 様

お世話になっております。
決済登録のご案内です。

■ 契約名
${contract?.contract_name || "-"}

■ 契約金額
${formatYen(contract?.amount)}

■ お支払い方法
${paymentMethod === "bank" ? "口座振替" : "クレジットカード"}

■ 登録URL
${registrationUrl || "未設定"}

お手数ですが、上記URLよりお手続きをお願いいたします。`;
  }, [customerName, contract, paymentMethod, registrationUrl]);

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">決済管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            登録リンク送付・登録状況管理・口振控え保存
          </p>
        </div>

        <button
          onClick={() => router.push("/contracts")}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          契約一覧へ戻る
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">契約情報</h2>
          <div className="grid gap-3">
            <div>
              <div className="text-xs text-gray-500">顧客名</div>
              <div className="mt-1 font-medium">{customerName}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">メール</div>
              <div className="mt-1 font-medium">{customer?.email || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">電話番号</div>
              <div className="mt-1 font-medium">{customer?.phone || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">契約名</div>
              <div className="mt-1 font-medium">
                {contract?.contract_name || "-"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">契約金額</div>
              <div className="mt-1 font-medium">{formatYen(contract?.amount)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">原価</div>
              <div className="mt-1 font-medium">{formatYen(contract?.cost)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">紹介料</div>
              <div className="mt-1 font-medium">
                {formatYen(contract?.commission)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">粗利</div>
              <div className="mt-1 font-medium">{formatYen(contract?.profit)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">契約日</div>
              <div className="mt-1 font-medium">
                {contract?.contract_date || "-"}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">決済設定</h2>

          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">決済方法</label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  const next = e.target.value;
                  setPaymentMethod(next);
                  if (next === "bank") {
                    setFormDocumentStatus((prev) =>
                      prev === "not_required" ? "waiting_upload" : prev
                    );
                  } else {
                    setFormDocumentStatus("not_required");
                  }
                }}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="card">クレジットカード</option>
                <option value="bank">口座振替</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">登録URL</label>
              <input
                type="text"
                value={registrationUrl}
                onChange={(e) => setRegistrationUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyText(registrationUrl, "URLをコピーしました")}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                URLコピー
              </button>

              {registrationUrl ? (
                <a
                  href={registrationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90"
                >
                  登録フォームを開く
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg bg-gray-300 px-3 py-2 text-sm text-white"
                >
                  URL未設定
                </button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">送信方法</label>
              <select
                value={sentVia}
                onChange={(e) => setSentVia(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="email">メール</option>
                <option value="line">LINE</option>
                <option value="manual">手動</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">登録状況</label>
              <select
                value={registrationStatus}
                onChange={(e) => setRegistrationStatus(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="pending">未完了</option>
                <option value="registered">登録完了</option>
                <option value="failed">失敗</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">課金状態</label>
              <select
                value={billingStatus}
                onChange={(e) => setBillingStatus(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="inactive">停止中</option>
                <option value="active">課金中</option>
                <option value="stopped">停止</option>
                <option value="cancelled">解約</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">書類状況</label>
              <select
                value={paymentMethod === "bank" ? formDocumentStatus : "not_required"}
                onChange={(e) => setFormDocumentStatus(e.target.value)}
                disabled={paymentMethod !== "bank"}
                className="w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
              >
                <option value="not_required">不要</option>
                <option value="waiting_upload">控え待ち</option>
                <option value="uploaded">控え保存済</option>
                <option value="original_sent">原本発送済</option>
                <option value="received">受理済</option>
                <option value="rejected">差戻し</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">備考</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">メール文面</h2>
            <button
              type="button"
              onClick={() => copyText(mailText, "メール文面をコピーしました")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs hover:bg-gray-50"
            >
              文面コピー
            </button>
          </div>
          <textarea
            readOnly
            value={mailText}
            rows={12}
            className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">LINE文面</h2>
            <button
              type="button"
              onClick={() => copyText(lineText, "LINE文面をコピーしました")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs hover:bg-gray-50"
            >
              文面コピー
            </button>
          </div>
          <textarea
            readOnly
            value={lineText}
            rows={12}
            className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold">口座振替書類</h2>

        {paymentMethod !== "bank" ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-gray-600">
            クレジットカード契約のため、口振書類アップロードは不要です。
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
              代理店控えとして写メやPDFを保存し、原本はアプラスへ送る運用です。
            </div>

            <div className="mb-4">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleUpload}
                disabled={uploading}
                className="block w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="mt-1 text-xs text-gray-500">
                画像ファイルまたはPDFをアップロードできます
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              {documents.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  まだ書類はアップロードされていません
                </div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">ファイル名</th>
                      <th className="px-4 py-3 font-medium">種類</th>
                      <th className="px-4 py-3 font-medium">サイズ</th>
                      <th className="px-4 py-3 font-medium">状態</th>
                      <th className="px-4 py-3 font-medium">登録日時</th>
                      <th className="px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="border-t">
                        <td className="px-4 py-3">{doc.file_name || "-"}</td>
                        <td className="px-4 py-3">{doc.file_type || "-"}</td>
                        <td className="px-4 py-3">
                          {formatFileSize(doc.file_size)}
                        </td>
                        <td className="px-4 py-3">{doc.status || "-"}</td>
                        <td className="px-4 py-3">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleOpenFile(doc.file_path)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs hover:bg-gray-50"
                          >
                            開く
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}