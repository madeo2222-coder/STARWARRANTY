"use client";

import { useState } from "react";

type SubmitResult = {
  inquiry_no: string;
  ai_response: string;
  requires_staff: boolean;
  urgency_level: string;
};

const productCategories = [
  "",
  "給湯器",
  "エコキュート",
  "エアコン",
  "コンロ",
  "換気扇",
  "インターホン",
  "温水洗浄便座",
  "システムバス",
  "システムキッチン",
  "食器洗い乾燥機",
  "浴室換気乾燥機",
  "床暖房",
  "電子錠",
  "照明",
  "その他",
];

export default function SupportChatPage() {
  const [submitting, setSubmitting] = useState(false);

  const [contactType, setContactType] = useState("customer");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [certificateNo, setCertificateNo] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNo, setModelNo] = useState("");
  const [symptomCategory, setSymptomCategory] = useState("");
  const [symptomDetail, setSymptomDetail] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [isUsable, setIsUsable] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setResult(null);

    try {
      if (!symptomDetail.trim()) {
        throw new Error("症状・問い合わせ内容を入力してください");
      }

      const res = await fetch("/api/ai-support-inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_type: "web",
          contact_type: contactType,
          customer_name: customerName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          certificate_no: certificateNo.trim() || null,
          product_category: productCategory.trim() || null,
          manufacturer: manufacturer.trim() || null,
          model_no: modelNo.trim() || null,
          symptom_category: symptomCategory.trim() || null,
          symptom_detail: symptomDetail.trim(),
          error_code: errorCode.trim() || null,
          is_usable:
            isUsable === "yes" ? true : isUsable === "no" ? false : null,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "送信に失敗しました");
      }

      setResult({
        inquiry_no: json.inquiry?.inquiry_no || "-",
        ai_response: json.ai_response || "",
        requires_staff: Boolean(json.requires_staff),
        urgency_level: json.urgency_level || "normal",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "送信に失敗しました"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="mt-1 text-2xl font-bold">故障かな？AI一次受付</h1>
          <p className="mt-2 text-sm text-gray-500">
            お問い合わせ内容を受け付けました。
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <div className="text-sm font-medium text-blue-700">受付番号</div>
          <div className="mt-2 text-3xl font-bold text-blue-900">
            {result.inquiry_no}
          </div>
        </div>

        {result.requires_staff ? (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-7 text-orange-800">
            内容確認のため、スタッフ対応が必要な可能性があります。
            担当者が内容を確認します。
          </div>
        ) : null}

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">一次回答</h2>
          <div className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-800">
            {result.ai_response}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">次の流れ</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="rounded-xl border p-4">
              <div className="font-medium">1. まず案内内容をご確認ください</div>
              <div className="mt-1 text-gray-500">
                安全に確認できる範囲で、電源・エラーコード・写真などをご確認ください。
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="font-medium">2. 復旧しない場合</div>
              <div className="mt-1 text-gray-500">
                保証書QRの修理受付フォーム、またはスタッフからの案内に従って修理受付へ進んでください。
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="font-medium">3. 危険がある場合</div>
              <div className="mt-1 text-gray-500">
                水漏れ・焦げ臭い・煙・漏電・ガス臭い等がある場合は、無理に使用を続けないでください。
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setSymptomDetail("");
            setErrorCode("");
            setSymptomCategory("");
          }}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white"
        >
          別の問い合わせをする
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">STAR WARRANTY</p>
        <h1 className="mt-1 text-2xl font-bold">故障かな？AI一次受付</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          故障かもしれない症状について、まず安全に確認できる内容をご案内します。
          内容によってはスタッフ確認に引き継ぎます。
        </p>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-7 text-yellow-800">
        水漏れ・焦げ臭い・煙・漏電・ガス臭い・ブレーカーが何度も落ちる等がある場合は、
        無理に使用を続けず、症状欄にその内容を入力してください。
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold">問い合わせ内容</h2>
          <p className="mt-1 text-xs text-gray-500">
            分かる範囲で入力してください。未入力でも送信できます。
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">問い合わせ元</label>
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="customer">お客様</option>
              <option value="builder">工務店</option>
              <option value="seller">販売店</option>
              <option value="agency">代理店</option>
              <option value="other">その他</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">お名前・会社名</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="お名前または会社名"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">電話番号</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="電話番号"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="メールアドレス"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">保証書番号</label>
            <input
              type="text"
              value={certificateNo}
              onChange={(e) => setCertificateNo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="分かる場合のみ"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">対象機器</label>
            <select
              value={productCategory}
              onChange={(e) => setProductCategory(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">選択してください</option>
              {productCategories
                .filter((category) => category)
                .map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">メーカー名</label>
            <input
              type="text"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="メーカー名"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">型番</label>
            <input
              type="text"
              value={modelNo}
              onChange={(e) => setModelNo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="型番"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">症状区分</label>
            <input
              type="text"
              value={symptomCategory}
              onChange={(e) => setSymptomCategory(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="例：電源が入らない / お湯が出ない"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">エラーコード</label>
            <input
              type="text"
              value={errorCode}
              onChange={(e) => setErrorCode(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="表示されている場合のみ"
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
            <label className="text-sm font-medium">
              症状・問い合わせ内容
            </label>
            <textarea
              value={symptomDetail}
              onChange={(e) => setSymptomDetail(e.target.value)}
              className="min-h-[140px] w-full rounded-lg border px-3 py-2"
              placeholder="例：エコキュートのお湯が出ません。リモコンにエラーが表示されています。"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "送信中..." : "一次受付に送信する"}
        </button>
      </form>
    </div>
  );
}