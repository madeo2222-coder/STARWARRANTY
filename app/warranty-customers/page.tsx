"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WarrantyCustomer = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  created_at: string | null;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  customers?: WarrantyCustomer[];
};

export default function WarrantyCustomersPage() {
  const [customers, setCustomers] = useState<WarrantyCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [keyword, setKeyword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  async function fetchCustomers() {
    try {
      setLoading(true);

      const response = await fetch("/api/warranty-customers", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        alert(result.error || "顧客一覧取得エラー");
        return;
      }

      setCustomers(result.customers || []);
    } catch (error) {
      console.error(error);
      alert("顧客一覧取得エラー");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  function resetForm() {
    setEditingId(null);
    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setPostalCode("");
    setAddress("");
    setNote("");
  }

  async function saveCustomer() {
    if (!companyName.trim()) {
      alert("会社名を入力してください");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/warranty-customers", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId || undefined,
          company_name: companyName,
          contact_name: contactName,
          email,
          phone,
          postal_code: postalCode,
          address,
          note,
        }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        alert(result.error || "保存に失敗しました");
        return;
      }

      alert(editingId ? "顧客情報を更新しました" : "顧客を登録しました");
      resetForm();
      fetchCustomers();
    } catch (error) {
      console.error(error);
      alert("保存エラー");
    } finally {
      setSaving(false);
    }
  }

  function handleStartEdit(customer: WarrantyCustomer) {
    setEditingId(customer.id);
    setCompanyName(customer.company_name || "");
    setContactName(customer.contact_name || "");
    setEmail(customer.email || "");
    setPhone(customer.phone || "");
    setPostalCode(customer.postal_code || "");
    setAddress(customer.address || "");
    setNote(customer.note || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteCustomer(customer: WarrantyCustomer) {
    const label =
      customer.company_name || customer.contact_name || customer.email || "この顧客";

    const ok = window.confirm(
      `${label} を削除します。\nこの操作は取り消せません。本当に削除しますか？`
    );

    if (!ok) return;

    try {
      const response = await fetch("/api/warranty-customers", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: customer.id,
        }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        alert(result.error || "削除に失敗しました");
        return;
      }

      alert("顧客を削除しました");

      if (editingId === customer.id) {
        resetForm();
      }

      fetchCustomers();
    } catch (error) {
      console.error(error);
      alert("削除エラー");
    }
  }

  const filteredCustomers = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();

    if (!normalized) return customers;

    return customers.filter((customer) => {
      const text = [
        customer.company_name,
        customer.contact_name,
        customer.email,
        customer.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(normalized);
    });
  }, [customers, keyword]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">顧客管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            顧客情報の登録・検索・確認を行います。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            ホームへ
          </Link>

          <Link
            href="/warranty-customers/import"
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            CSV/Excel取込
          </Link>

          <Link
            href="/warranty-invoices"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            請求管理へ
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">
          {editingId ? "顧客情報編集" : "新規顧客登録"}
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <input type="text" placeholder="会社名" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" />
          <input type="text" placeholder="担当者名" value={contactName} onChange={(e) => setContactName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" />
          <input type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" />
          <input type="text" placeholder="電話番号" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" />
          <input type="text" placeholder="郵便番号" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" />
          <input type="text" placeholder="住所" value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" />
        </div>

        <textarea
          placeholder="メモ"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-4 min-h-[120px] w-full rounded-lg border px-3 py-2 text-sm outline-none"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveCustomer}
            disabled={saving}
            className="rounded-lg bg-black px-5 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "保存中..." : editingId ? "更新する" : "顧客登録"}
          </button>

          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="rounded-lg border px-5 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold">顧客一覧</h2>

          <input
            type="text"
            placeholder="会社名・担当者・メール・電話番号で検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="mt-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />

          <p className="mt-3 text-sm text-gray-500">
            表示件数：{filteredCustomers.length}件
          </p>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">読み込み中...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">顧客データがありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">会社名</th>
                  <th className="px-4 py-3 font-medium">担当者</th>
                  <th className="px-4 py-3 font-medium">メール</th>
                  <th className="px-4 py-3 font-medium">電話番号</th>
                  <th className="px-4 py-3 font-medium">郵便番号</th>
                  <th className="px-4 py-3 font-medium">住所</th>
                  <th className="px-4 py-3 font-medium">メモ</th>
                  <th className="px-4 py-3 font-medium">登録日</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-t hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{customer.company_name || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{customer.contact_name || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{customer.email || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{customer.phone || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{customer.postal_code || "-"}</td>
                    <td className="min-w-[240px] px-4 py-3">{customer.address || "-"}</td>
                    <td className="min-w-[220px] px-4 py-3">{customer.note || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString("ja-JP")
                        : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/warranty-customers/${customer.id}`} className="rounded-lg border px-3 py-2 text-xs hover:bg-gray-50">
                          詳細
                        </Link>

                        <button type="button" onClick={() => handleStartEdit(customer)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 hover:bg-blue-100">
                          編集
                        </button>

                        <button type="button" onClick={() => handleDeleteCustomer(customer)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100">
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}