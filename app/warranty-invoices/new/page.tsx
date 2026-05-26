"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type InvoiceItem = {
  item_name: string;
  description: string;
  quantity: number;
  unit_price: number;
};

type WarrantyCustomer = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  created_at: string | null;
};

function buildInvoiceNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return `INV-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function today() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatYen(value: number) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

export default function NewWarrantyInvoicePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [customers, setCustomers] = useState<WarrantyCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [invoiceNo] = useState(buildInvoiceNo());
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [subject, setSubject] = useState("保証関連費用のご請求");
  const [billToCompanyName, setBillToCompanyName] = useState("");
  const [billToName, setBillToName] = useState("");
  const [billToEmail, setBillToEmail] = useState("");
  const [billToPostalCode, setBillToPostalCode] = useState("");
  const [billToAddress, setBillToAddress] = useState("");
  const [note, setNote] = useState("");

  const [items, setItems] = useState<InvoiceItem[]>([
    {
      item_name: "保証関連費用",
      description: "",
      quantity: 1,
      unit_price: 0,
    },
  ]);

  useEffect(() => {
    async function fetchCustomers() {
      const { data, error } = await supabase
        .from("warranty_customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("warranty_customers fetch error:", error);
        return;
      }

      setCustomers((data || []) as WarrantyCustomer[]);
    }

    fetchCustomers();
  }, [supabase]);

  const subtotal = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
    0
  );
  const taxRate = 0.1;
  const taxAmount = Math.floor(subtotal * taxRate);
  const totalAmount = subtotal + taxAmount;

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);

    const customer = customers.find((item) => item.id === customerId);

    if (!customer) return;

    setBillToCompanyName(customer.company_name || "");
    setBillToName(customer.contact_name || "");
    setBillToEmail(customer.email || "");
    setBillToPostalCode(customer.postal_code || "");
    setBillToAddress(customer.address || "");
  }

  function updateItem(
    index: number,
    field: keyof InvoiceItem,
    value: string | number
  ) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]:
                field === "quantity" || field === "unit_price"
                  ? Number(value || 0)
                  : value,
            }
          : item
      )
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        item_name: "",
        description: "",
        quantity: 1,
        unit_price: 0,
      },
    ]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setErrorMessage("");

    try {
      if (!billToCompanyName.trim() && !billToName.trim()) {
        throw new Error("宛先会社名または宛先名を入力してください");
      }

      if (!billToEmail.trim()) {
        throw new Error("請求先メールアドレスは必須です");
      }

      if (items.length === 0) {
        throw new Error("明細を1行以上入力してください");
      }

      const hasBlankItemName = items.some((item) => !item.item_name.trim());

      if (hasBlankItemName) {
        throw new Error("明細名が未入力の行があります");
      }

      const itemRows = items.map((item, index) => ({
        item_name: item.item_name.trim(),
        description: item.description.trim() || null,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        amount: Number(item.quantity || 0) * Number(item.unit_price || 0),
        sort_order: index,
      }));

      const realSubtotal = itemRows.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );
      const realTaxAmount = Math.floor(realSubtotal * taxRate);
      const realTotalAmount = realSubtotal + realTaxAmount;

      const { data: invoice, error: invoiceError } = await supabase
        .from("warranty_invoices")
        .insert({
          invoice_no: invoiceNo,
          invoice_date: invoiceDate || null,
          payment_due_date: paymentDueDate || null,
          subject: subject.trim() || null,
          bill_to_company_name: billToCompanyName.trim() || null,
          bill_to_name: billToName.trim() || null,
          bill_to_email: billToEmail.trim(),
          subtotal: realSubtotal,
          tax_rate: taxRate,
          tax_amount: realTaxAmount,
          total_amount: realTotalAmount,
          status: "draft",
          note: note.trim() || null,
        })
        .select("id")
        .single();

      if (invoiceError || !invoice) {
        throw new Error(invoiceError?.message || "請求書の作成に失敗しました");
      }

      const insertItemRows = itemRows.map((item) => ({
        ...item,
        invoice_id: invoice.id,
      }));

      const { error: itemsError } = await supabase
        .from("warranty_invoice_items")
        .insert(insertItemRows);

      if (itemsError) {
        throw new Error(itemsError.message);
      }

      router.push("/warranty-invoices");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "請求書の作成に失敗しました";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">新規請求書作成</h1>
          <p className="mt-1 text-sm text-gray-500">
            宛先・件名・明細を入力して請求書を作成します。
          </p>
        </div>

        <Link
          href="/warranty-invoices"
          className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
        >
          請求書一覧へ戻る
        </Link>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">請求書情報</h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">請求書番号</label>
              <input
                type="text"
                value={invoiceNo}
                readOnly
                className="w-full rounded-lg border bg-gray-50 px-3 py-2 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">請求日</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">支払期限</label>
              <input
                type="date"
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">件名</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">宛先情報</h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">顧客選択</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
              >
                <option value="">手入力する / 顧客を選択しない</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company_name ||
                      customer.contact_name ||
                      customer.email ||
                      "名称未設定"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                顧客を選択すると、会社名・担当者名・メール・住所が自動入力されます。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">宛先会社名</label>
              <input
                type="text"
                value={billToCompanyName}
                onChange={(e) => setBillToCompanyName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="株式会社〇〇"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">宛先担当者名</label>
              <input
                type="text"
                value={billToName}
                onChange={(e) => setBillToName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="山田 太郎"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                請求先メールアドレス <span className="text-red-600">*</span>
              </label>
              <input
                type="email"
                value={billToEmail}
                onChange={(e) => setBillToEmail(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="example@example.com"
              />
              <p className="text-xs text-gray-500">
                請求書送信・督促メール送信・自動督促に使用します。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">郵便番号</label>
              <input
                type="text"
                value={billToPostalCode}
                onChange={(e) => setBillToPostalCode(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="000-0000"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">住所</label>
              <input
                type="text"
                value={billToAddress}
                onChange={(e) => setBillToAddress(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="住所を入力"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">請求明細</h2>
              <p className="mt-1 text-sm text-gray-500">
                明細名・数量・単価から自動計算します。
              </p>
            </div>

            <button
              type="button"
              onClick={addItem}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              明細を追加
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {items.map((item, index) => {
              const amount =
                Number(item.quantity || 0) * Number(item.unit_price || 0);

              return (
                <div key={index} className="rounded-xl border p-4">
                  <div className="grid gap-4 md:grid-cols-[1.5fr_1fr_100px_140px_140px_auto]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        明細名 <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.item_name}
                        onChange={(e) =>
                          updateItem(index, "item_name", e.target.value)
                        }
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        placeholder="保証関連費用"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">説明</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(index, "description", e.target.value)
                        }
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        placeholder="任意"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">数量</label>
                      <input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, "quantity", e.target.value)
                        }
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">単価</label>
                      <input
                        type="number"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(index, "unit_price", e.target.value)
                        }
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">金額</label>
                      <div className="rounded-lg border bg-gray-50 px-3 py-2 font-semibold">
                        {formatYen(amount)}
                      </div>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                        className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex justify-end">
            <div className="w-full max-w-sm space-y-2 rounded-xl border bg-gray-50 p-4">
              <div className="flex justify-between text-sm">
                <span>小計</span>
                <span>{formatYen(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>消費税 10%</span>
                <span>{formatYen(taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg font-bold">
                <span>合計</span>
                <span>{formatYen(totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">備考</h2>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-4 min-h-[120px] w-full rounded-lg border px-3 py-2 outline-none"
            placeholder="備考を入力"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-5 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "保存中..." : "請求書を作成"}
          </button>

          <Link
            href="/warranty-invoices"
            className="rounded-lg border px-5 py-2 text-sm hover:bg-gray-50"
          >
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}