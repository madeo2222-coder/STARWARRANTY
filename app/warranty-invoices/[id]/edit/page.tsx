"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type InvoiceItem = {
  item_name: string;
  description: string;
  quantity: number;
  unit_price: number;
};

const STATUS_OPTIONS = [
  {
    value: "draft",
    label: "下書き",
  },
  {
    value: "issued",
    label: "発行済み",
  },
  {
    value: "unpaid",
    label: "未入金",
  },
  {
    value: "paid",
    label: "入金済み",
  },
  {
    value: "cancelled",
    label: "取消",
  },
];

function formatYen(value: number) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

export default function EditWarrantyInvoicePage() {
  const params = useParams();
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const invoiceId = String(params.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [invoiceNo, setInvoiceNo] = useState("");

  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [subject, setSubject] = useState("");
  const [billToCompanyName, setBillToCompanyName] = useState("");
  const [billToName, setBillToName] = useState("");
  const [billToEmail, setBillToEmail] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("draft");

  const [items, setItems] = useState<InvoiceItem[]>([]);

  const subtotal = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
    0
  );

  const taxAmount = Math.floor(subtotal * 0.1);

  const totalAmount = subtotal + taxAmount;

  useEffect(() => {
    async function fetchInvoice() {
      try {
        setLoading(true);
        setErrorMessage("");

        const { data, error } = await supabase
          .from("warranty_invoices")
          .select(
            `
              id,
              invoice_no,
              invoice_date,
              payment_due_date,
              subject,
              bill_to_company_name,
              bill_to_name,
              bill_to_email,
              note,
              status
            `
          )
          .eq("id", invoiceId)
          .single();

        if (error || !data) {
          throw new Error(error?.message || "請求書データが見つかりません");
        }

        const { data: itemData, error: itemError } = await supabase
          .from("warranty_invoice_items")
          .select(
            `
                item_name,
                description,
                quantity,
                unit_price
              `
          )
          .eq("invoice_id", invoiceId)
          .order("sort_order", {
            ascending: true,
          });

        if (itemError) {
          throw new Error(itemError.message);
        }

        setInvoiceNo(data.invoice_no || "");
        setInvoiceDate(data.invoice_date || "");
        setPaymentDueDate(data.payment_due_date || "");
        setSubject(data.subject || "");
        setBillToCompanyName(data.bill_to_company_name || "");
        setBillToName(data.bill_to_name || "");
        setBillToEmail(data.bill_to_email || "");
        setNote(data.note || "");
        setStatus(data.status || "draft");

        setItems(
          (itemData || []).map((item) => ({
            item_name: item.item_name || "",
            description: item.description || "",
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
          }))
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "請求書取得に失敗しました"
        );
      } finally {
        setLoading(false);
      }
    }

    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId, supabase]);

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

    try {
      setSaving(true);
      setErrorMessage("");

      const response = await fetch("/api/warranty-invoice-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          invoice_date: invoiceDate,
          payment_due_date: paymentDueDate,
          subject,
          bill_to_company_name: billToCompanyName,
          bill_to_name: billToName,
          bill_to_email: billToEmail,
          note,
          status,
          items,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "更新に失敗しました");
      }

      router.push(`/warranty-invoices/${invoiceId}`);

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "更新中にエラーが発生しました"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>

          <h1 className="text-2xl font-bold">請求書編集</h1>

          <p className="mt-1 text-sm text-gray-500">
            請求書情報を編集できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/warranty-invoices/${invoiceId}`}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            詳細へ戻る
          </Link>

          <Link
            href="/warranty-invoices"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            一覧へ戻る
          </Link>
        </div>
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
              <label className="text-sm font-medium">ステータス</label>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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

            <div className="space-y-2 md:col-span-2">
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
            <div className="space-y-2">
              <label className="text-sm font-medium">宛先会社名</label>

              <input
                type="text"
                value={billToCompanyName}
                onChange={(e) => setBillToCompanyName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">宛先担当者名</label>

              <input
                type="text"
                value={billToName}
                onChange={(e) => setBillToName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">
                請求先メールアドレス
              </label>

              <input
                type="email"
                value={billToEmail}
                onChange={(e) => setBillToEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 outline-none"
                placeholder="example@example.com"
              />

              <p className="text-xs text-gray-500">
                請求書送信・自動督促メール送信に使用します。
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">請求明細</h2>

              <p className="mt-1 text-sm text-gray-500">
                明細を編集できます。
              </p>
            </div>

            <button
              type="button"
              onClick={addItem}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              明細追加
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
                      <label className="text-sm font-medium">明細名</label>

                      <input
                        type="text"
                        value={item.item_name}
                        onChange={(e) =>
                          updateItem(index, "item_name", e.target.value)
                        }
                        className="w-full rounded-lg border px-3 py-2 outline-none"
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
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-5 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "保存中..." : "更新する"}
          </button>

          <Link
            href={`/warranty-invoices/${invoiceId}`}
            className="rounded-lg border px-5 py-2 text-sm hover:bg-gray-50"
          >
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}