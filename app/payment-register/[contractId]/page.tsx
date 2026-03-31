"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Contract = {
  id: string;
  customer_id: string | null;
  contract_name?: string | null;
  plan_name?: string | null;
  monthly_fee?: number | null;
  payment_method?: string | null;
  status?: string | null;
  start_date?: string | null;
};

type Customer = {
  id: string;
  company_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ExistingPayment = {
  id: string;
  payment_method: string;
  registration_status: string;
  billing_status: string;
  masked_card_number?: string | null;
};

export default function PaymentRegisterPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params?.contractId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [contract, setContract] = useState<Contract | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [existingPayment, setExistingPayment] = useState<ExistingPayment | null>(
    null
  );

  const [cardHolderName, setCardHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvc, setCvc] = useState("");

  useEffect(() => {
    if (!contractId) return;
    fetchPageData();
  }, [contractId]);

  async function fetchPageData() {
    try {
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const contractRes = await supabase
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .single();

      if (contractRes.error || !contractRes.data) {
        throw new Error("契約情報が見つかりません");
      }

      const foundContract = contractRes.data as Contract;
      setContract(foundContract);

      if (!foundContract.customer_id) {
        throw new Error("契約に customer_id が設定されていません");
      }

      const [customerRes, paymentRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, company_name, name, email, phone")
          .eq("id", foundContract.customer_id)
          .single(),
        supabase
          .from("payments")
          .select("id, payment_method, registration_status, billing_status, masked_card_number")
          .eq("contract_id", foundContract.id)
          .eq("payment_method", "card")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (customerRes.error || !customerRes.data) {
        throw new Error("顧客情報の取得に失敗しました");
      }

      setCustomer(customerRes.data as Customer);

      if (paymentRes.data) {
        setExistingPayment(paymentRes.data as ExistingPayment);
      } else {
        setExistingPayment(null);
      }
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "ページの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function formatYen(value?: number | null) {
    if (value == null) return "-";
    return `¥${Number(value).toLocaleString()}`;
  }

  function getCustomerName() {
    if (!customer) return "-";
    return customer.company_name || customer.name || "顧客名未設定";
  }

  function maskCardNumber(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 4) return "****";
    return `**** **** **** ${digits.slice(-4)}`;
  }

  function validateForm() {
    const digits = cardNumber.replace(/\D/g, "");

    if (!cardHolderName.trim()) {
      return "カード名義を入力してください";
    }

    if (digits.length < 12 || digits.length > 19) {
      return "カード番号を正しく入力してください";
    }

    if (!expiryMonth || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) {
      return "有効期限（月）を正しく入力してください";
    }

    if (!expiryYear || expiryYear.length !== 2) {
      return "有効期限（年）は2桁で入力してください";
    }

    if (!cvc || cvc.length < 3 || cvc.length > 4) {
      return "セキュリティコードを正しく入力してください";
    }

    return "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!contract || !customer) {
      setErrorMessage("契約または顧客情報が取得できていません");
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      setSuccessMessage("");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const maskedCard = maskCardNumber(cardNumber);

      if (existingPayment?.id) {
        const updateRes = await supabase
          .from("payments")
          .update({
            customer_id: customer.id,
            contract_id: contract.id,
            payment_method: "card",
            registration_status: "registered",
            billing_status: "active",
            account_holder_name: cardHolderName.trim(),
            masked_card_number: maskedCard,
            note: `expiry:${expiryMonth}/${expiryYear}`,
          })
          .eq("id", existingPayment.id);

        if (updateRes.error) {
          throw new Error(updateRes.error.message);
        }
      } else {
        const insertRes = await supabase.from("payments").insert([
          {
            customer_id: customer.id,
            contract_id: contract.id,
            payment_method: "card",
            registration_status: "registered",
            billing_status: "active",
            account_holder_name: cardHolderName.trim(),
            masked_card_number: maskedCard,
            note: `expiry:${expiryMonth}/${expiryYear}`,
          },
        ]);

        if (insertRes.error) {
          throw new Error(insertRes.error.message);
        }
      }

      setSuccessMessage("クレジットカード登録を保存しました");
      setCardHolderName("");
      setCardNumber("");
      setExpiryMonth("");
      setExpiryYear("");
      setCvc("");

      await fetchPageData();
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || "保存に失敗しました");
      setSuccessMessage("");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (errorMessage && !contract) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {errorMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">クレジットカード登録</h1>
        <p className="mt-1 text-sm text-gray-500">
          契約ごとのカード情報登録ページです
        </p>
      </div>

      <div className="mb-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">契約情報</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs text-gray-500">顧客名</div>
            <div className="mt-1 font-medium">{getCustomerName()}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">メール</div>
            <div className="mt-1 font-medium">{customer?.email || "-"}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">契約名</div>
            <div className="mt-1 font-medium">
              {contract?.contract_name || "-"}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500">プラン名</div>
            <div className="mt-1 font-medium">{contract?.plan_name || "-"}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">月額料金</div>
            <div className="mt-1 font-medium">
              {formatYen(contract?.monthly_fee)}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500">契約開始日</div>
            <div className="mt-1 font-medium">{contract?.start_date || "-"}</div>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">現在の登録状況</h2>

        {existingPayment ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-gray-500">決済方法</div>
              <div className="mt-1 font-medium">{existingPayment.payment_method}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">登録状態</div>
              <div className="mt-1 font-medium">
                {existingPayment.registration_status}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">課金状態</div>
              <div className="mt-1 font-medium">
                {existingPayment.billing_status}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">登録カード</div>
              <div className="mt-1 font-medium">
                {existingPayment.masked_card_number || "-"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            まだクレジットカード登録はありません
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold">カード情報入力</h2>

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">カード名義</label>
            <input
              type="text"
              value={cardHolderName}
              onChange={(e) => setCardHolderName(e.target.value)}
              placeholder="TARO YAMADA"
              className="w-full rounded-lg border px-3 py-2 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">カード番号</label>
            <input
              type="text"
              inputMode="numeric"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4111111111111111"
              className="w-full rounded-lg border px-3 py-2 outline-none focus:border-black"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                有効期限（月）
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value)}
                placeholder="12"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                有効期限（年）
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value)}
                placeholder="27"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                セキュリティコード
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={cvc}
                onChange={(e) => setCvc(e.target.value)}
                placeholder="123"
                className="w-full rounded-lg border px-3 py-2 outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
            今回は開発用の仮登録です。実際の決済代行API連携はまだ未接続です。
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中..." : "カード情報を保存"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/contracts")}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50"
            >
              契約一覧へ戻る
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}