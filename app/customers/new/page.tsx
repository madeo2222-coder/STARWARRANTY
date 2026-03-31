"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  name: string;
};

export default function NewCustomerPage() {
  const router = useRouter();

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    fetchAgencies();
  }, []);

  async function fetchAgencies() {
    const { data, error } = await supabase
      .from("agencies")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("agency fetch error:", error);
      return;
    }

    setAgencies(data || []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload = {
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

    const { error } = await supabase.from("customers").insert([payload]);

    if (error) {
      console.error("customer insert error:", error);
      alert("顧客登録に失敗しました");
      setLoading(false);
      return;
    }

    alert("顧客を登録しました");
    router.push("/customers");
    router.refresh();
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">顧客新規登録</h1>
        <Link
          href="/customers"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          顧客一覧へ戻る
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border bg-white p-4 md:p-6 shadow-sm space-y-6"
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
            <label className="mb-1 block text-sm font-medium">店舗名</label>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
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
            <label className="mb-1 block text-sm font-medium">メール</label>
            <input
              type="email"
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
            <label className="mb-1 block text-sm font-medium">代理店</label>
            <select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="">未選択</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
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
              <option value="card">クレジットカード</option>
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
              className="w-full rounded-lg border px-3 py-2"
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50"
          >
            {loading ? "登録中..." : "登録する"}
          </button>
        </div>
      </form>
    </div>
  );
}