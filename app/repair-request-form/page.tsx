"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type CertificateSummary = {
  id: string;
  certificate_no: string;
  customer_name: string;
  start_date: string;
  products: string[];
};

type SubmittedRequest = {
  request_no: string;
  photo_count: number;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP");
}

function normalizeDateForDb(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const normalized = trimmed.replace(/\//g, "-");

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split("T")[0];
}

function RepairRequestFormContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [certificate, setCertificate] = useState<CertificateSummary | null>(
    null
  );

  const [customerName, setCustomerName] = useState("");
  const [customerNameKana, setCustomerNameKana] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [productName, setProductName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNo, setModelNo] = useState("");
  const [installationPlace, setInstallationPlace] = useState("");
  const [failureDate, setFailureDate] = useState("");
  const [symptomCategory, setSymptomCategory] = useState("");
  const [symptomDetail, setSymptomDetail] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [isUsable, setIsUsable] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [errorMessage, setErrorMessage] = useState("");
  const [submittedRequest, setSubmittedRequest] =
    useState<SubmittedRequest | null>(null);

  useEffect(() => {
    async function loadCertificate() {
      if (!token) {
        setErrorMessage("token がありません");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const res = await fetch(
          `/api/repair-requests?token=${encodeURIComponent(token)}`,
          {
            cache: "no-store",
          }
        );

        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || "保証書情報の取得に失敗しました");
        }

        const cert = json.certificate as CertificateSummary;
        setCertificate(cert);
        setCustomerName(cert.customer_name || "");

        if (cert.products.length === 1) {
          setProductName(cert.products[0]);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "初期表示に失敗しました"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadCertificate();
  }, [token]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || []);

    if (selectedFiles.length > 5) {
      setErrorMessage("写真は最大5枚まで選択できます");
      e.target.value = "";
      setFiles([]);
      return;
    }

    setErrorMessage("");
    setFiles(selectedFiles);
  }

  async function uploadAttachments(requestId: string) {
    if (files.length === 0) return;

    const formData = new FormData();
    formData.append("repair_request_id", requestId);

    files.forEach((file) => {
      formData.append("files", file);
    });

    const res = await fetch("/api/repair-request-attachments", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || "写真のアップロードに失敗しました");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSubmitting(true);
    setErrorMessage("");

    try {
      if (!token) {
        throw new Error("token がありません");
      }

      if (!customerName.trim()) {
        throw new Error("お名前を入力してください");
      }

      if (!phone.trim()) {
        throw new Error("電話番号を入力してください");
      }

      if (!productName.trim()) {
        throw new Error("対象機器を入力してください");
      }

      if (!symptomDetail.trim()) {
        throw new Error("故障内容を入力してください");
      }

      if (files.length > 5) {
        throw new Error("写真は最大5枚までです");
      }

      const normalizedFailureDate = normalizeDateForDb(failureDate);

      const res = await fetch("/api/repair-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          customer_name: customerName.trim(),
          customer_name_kana: customerNameKana.trim() || null,
          phone: phone.trim(),
          email: email.trim() || null,
          postal_code: postalCode.trim() || null,
          address: address.trim() || null,
          product_name: productName.trim(),
          manufacturer: manufacturer.trim() || null,
          model_no: modelNo.trim() || null,
          installation_place: installationPlace.trim() || null,
          failure_date: normalizedFailureDate,
          symptom_category: symptomCategory.trim() || null,
          symptom_detail: symptomDetail.trim(),
          error_code: errorCode.trim() || null,
          is_usable:
            isUsable === "yes" ? true : isUsable === "no" ? false : null,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "修理受付の送信に失敗しました");
      }

      const requestId = json.request?.id as string | undefined;

      if (files.length > 0) {
        if (!requestId) {
          throw new Error(
            "修理受付は作成されましたが、写真保存用IDが取得できませんでした"
          );
        }

        await uploadAttachments(requestId);
      }

      setSubmittedRequest({
        request_no: json.request?.request_no || "-",
        photo_count: files.length,
      });

      setFiles([]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "送信に失敗しました"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (submittedRequest) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="mt-1 text-2xl font-bold">修理受付が完了しました</h1>
          <p className="mt-2 text-sm text-gray-500">
            ご入力いただいた内容を確認し、担当者より順次ご連絡いたします。
          </p>
        </div>

        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <div className="text-sm font-medium text-green-700">受付番号</div>
          <div className="mt-2 text-3xl font-bold text-green-800">
            {submittedRequest.request_no}
          </div>

          <div className="mt-5 space-y-2 text-sm text-green-800">
            <p>修理受付を送信しました。</p>
            <p>
              添付写真：
              {submittedRequest.photo_count > 0
                ? `${submittedRequest.photo_count}枚`
                : "なし"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">今後の流れ</h2>

          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="rounded-xl border p-4">
              <div className="font-medium">1. 受付内容の確認</div>
              <div className="mt-1 text-gray-500">
                担当者が故障内容・保証情報・添付写真を確認します。
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="font-medium">2. 必要に応じてご連絡</div>
              <div className="mt-1 text-gray-500">
                確認事項がある場合は、入力いただいた電話番号またはメールアドレスへご連絡します。
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="font-medium">3. 修理手配・日程調整</div>
              <div className="mt-1 text-gray-500">
                保証対象の場合、修理手配または訪問日調整へ進みます。
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4 text-xs text-gray-500">
          追加の写真や内容変更が必要な場合は、担当者からの連絡時にお伝えください。
          この画面を閉じても受付は完了しています。
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">STAR WARRANTY</p>
        <h1 className="mt-1 text-2xl font-bold">修理受付フォーム</h1>
        <p className="mt-2 text-sm text-gray-500">
          保証書に紐づく修理依頼を受け付けます。
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {certificate ? (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">保証書情報</h2>
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-gray-500">保証書番号</div>
              <div className="mt-1 font-medium">
                {certificate.certificate_no}
              </div>
            </div>
            <div>
              <div className="text-gray-500">施主名</div>
              <div className="mt-1 font-medium">
                {certificate.customer_name}
              </div>
            </div>
            <div>
              <div className="text-gray-500">保証開始日</div>
              <div className="mt-1 font-medium">
                {formatDate(certificate.start_date)}
              </div>
            </div>
            <div>
              <div className="text-gray-500">保証対象機器</div>
              <div className="mt-1 font-medium">
                {certificate.products.length > 0
                  ? certificate.products.join(" / ")
                  : "-"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold">お客様入力情報</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">お名前</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="お名前を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">お名前カナ</label>
            <input
              type="text"
              value={customerNameKana}
              onChange={(e) => setCustomerNameKana(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="カナを入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">電話番号</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="電話番号を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="メールアドレスを入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">郵便番号</label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="郵便番号を入力"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">住所</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="住所を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">対象機器</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="対象機器を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">メーカー名</label>
            <input
              type="text"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="メーカー名を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">型番</label>
            <input
              type="text"
              value={modelNo}
              onChange={(e) => setModelNo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="型番を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">設置場所</label>
            <input
              type="text"
              value={installationPlace}
              onChange={(e) => setInstallationPlace(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="設置場所を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">故障発生日</label>
            <input
              type="date"
              value={failureDate}
              onChange={(e) => setFailureDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">症状区分</label>
            <input
              type="text"
              value={symptomCategory}
              onChange={(e) => setSymptomCategory(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="症状区分を入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">エラーコード</label>
            <input
              type="text"
              value={errorCode}
              onChange={(e) => setErrorCode(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="エラーコードを入力"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">現在使用できますか</label>
            <select
              value={isUsable}
              onChange={(e) => setIsUsable(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">選択してください</option>
              <option value="yes">使える</option>
              <option value="no">使えない</option>
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">故障内容</label>
            <textarea
              value={symptomDetail}
              onChange={(e) => setSymptomDetail(e.target.value)}
              className="min-h-[120px] w-full rounded-lg border px-3 py-2"
              placeholder="故障内容を入力"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">写真添付</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="text-xs text-gray-500">
              最大5枚まで添付できます。修理箇所・エラー表示・全体写真などを添付してください。
            </p>

            {files.length > 0 ? (
              <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
                選択中: {files.length}枚
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "送信中..." : "修理受付を送信する"}
        </button>
      </form>
    </div>
  );
}

export default function RepairRequestFormPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl p-4 md:p-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            読み込み中...
          </div>
        </div>
      }
    >
      <RepairRequestFormContent />
    </Suspense>
  );
}