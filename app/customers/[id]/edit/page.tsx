"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  name: string;
};

export default function EditCustomerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [agencyError, setAgencyError] = useState("");

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
    if (!id) return;
    init();
  }, [id]);

  async function init() {
    setLoading(true);
    await Promise.all([fetchAgencies(), fetchCustomer()]);
    setLoading(false);
  }

  async function fetchAgencies() {
    const { data, error } = await supabase
      .from("agencies")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("agency fetch error:", error);
      setAgencyError("代理店の取得に失敗しました（RLSの可能性あり）");
      return;
    }

    setAgencies(data || []);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

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

    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("customer update error:", error);
      setErrorMsg(
        "更新に失敗しました。RLSまたはデータ形式を確認してください"
      );
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
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
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
        className="rounded-xl border bg-white p-4 md:p-6 shadow-sm space-y-6"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

          <div>
            <label className="text-sm">会社名</label>
            <input value={companyName} onChange={(e)=>setCompanyName(e.target.value)} className="w-full border p-2 rounded"/>
          </div>

          <div>
            <label className="text-sm">代理店</label>
            <select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              className="w-full border p-2 rounded"
            >
              <option value="">未選択</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-black text-white px-5 py-2 rounded"
          >
            {saving ? "更新中..." : "更新する"}
          </button>
        </div>
      </form>
    </div>
  );
}