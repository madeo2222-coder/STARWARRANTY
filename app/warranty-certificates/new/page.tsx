"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type WarrantyProduct = {
  id: string;
  product_code: string;
  product_name: string;
  category: string | null;
  warranty_years: number | null;
  sort_order: number;
};

type ProductSelection = {
  product_id: string;
  is_enabled: boolean;
};

function sanitizePostalCode(value: string) {
  return value.replace(/[^\d-]/g, "").slice(0, 8);
}

export default function NewWarrantyCertificatePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<WarrantyProduct[]>([]);
  const [certificateNo, setCertificateNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNameKana, setCustomerNameKana] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [address3, setAddress3] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [propertyRoom, setPropertyRoom] = useState("");
  const [startDate, setStartDate] = useState("");
  const [introducerName, setIntroducerName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [note, setNote] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>(
    {}
  );

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    void loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/warranty-certificates", {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "保証対象機器の取得に失敗しました");
      }

      const fetchedProducts = (json.products || []) as WarrantyProduct[];
      setProducts(fetchedProducts);

      const initialSelection: Record<string, boolean> = {};
      fetchedProducts.forEach((product) => {
        initialSelection[product.id] = false;
      });
      setSelectedProducts(initialSelection);

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      setStartDate(`${yyyy}-${mm}-${dd}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "初期表示に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleProduct(productId: string) {
    setSelectedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (!certificateNo.trim()) {
        throw new Error("保証書番号を入力してください");
      }

      if (!customerName.trim()) {
        throw new Error("施主名を入力してください");
      }

      if (!startDate) {
        throw new Error("保証開始日を入力してください");
      }

      const enabledItems: ProductSelection[] = products.map((product) => ({
        product_id: product.id,
        is_enabled: Boolean(selectedProducts[product.id]),
      }));

      const enabledCount = enabledItems.filter((item) => item.is_enabled).length;

      if (enabledCount === 0) {
        throw new Error("保証対象機器を1つ以上選択してください");
      }

      const res = await fetch("/api/warranty-certificates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          certificate_no: certificateNo.trim(),
          customer_name: customerName.trim(),
          customer_name_kana: customerNameKana.trim() || null,
          postal_code: sanitizePostalCode(postalCode.trim()) || null,
          address1: address1.trim() || null,
          address2: address2.trim() || null,
          address3: address3.trim() || null,
          property_name: propertyName.trim() || null,
          property_room: propertyRoom.trim() || null,
          start_date: startDate,
          introducer_name: introducerName.trim() || null,
          seller_name: sellerName.trim() || null,
          note: note.trim() || null,
          items: enabledItems,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "保証書の保存に失敗しました");
      }

      setSuccessMessage("保証書を登録しました。一覧へ移動します...");

      setTimeout(() => {
        router.push("/warranty-certificates");
        router.refresh();
      }, 400);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "保存に失敗しました"
      );
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">保証書新規作成</h1>
          <p className="mt-1 text-sm text-gray-500">
            保証書の基本情報と対象機器39種類のON/OFFを登録します
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/warranty-certificates"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            保証書一覧へ
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">読み込み中...</div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="text-base font-semibold">基本情報</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">保証書番号</label>
              <input
                type="text"
                value={certificateNo}
                onChange={(e) => setCertificateNo(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="保証書番号を入力"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">保証開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">施主名</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="施主名を入力"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">施主名カナ</label>
              <input
                type="text"
                value={customerNameKana}
                onChange={(e) => setCustomerNameKana(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="カナを入力"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">郵便番号</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(sanitizePostalCode(e.target.value))}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="101-0048"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">紹介者名</label>
              <input
                type="text"
                value={introducerName}
                onChange={(e) => setIntroducerName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="紹介者名を入力"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">住所1</label>
              <input
                type="text"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="住所1"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">住所2</label>
              <input
                type="text"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="住所2"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">住所3</label>
              <input
                type="text"
                value={address3}
                onChange={(e) => setAddress3(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="住所3"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">物件名</label>
              <input
                type="text"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="物件名"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">部屋番号</label>
              <input
                type="text"
                value={propertyRoom}
                onChange={(e) => setPropertyRoom(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="部屋番号"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">販売店名</label>
              <input
                type="text"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="販売店名を入力"
              />
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold">保証対象機器（39種類）</h2>
            <p className="mt-1 text-sm text-gray-500">
              保証対象にする機器をONにしてください
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <label
                key={product.id}
                className="flex items-start gap-3 rounded-xl border p-3 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selectedProducts[product.id])}
                  onChange={() => toggleProduct(product.id)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">{product.product_name}</div>
                  <div className="text-xs text-gray-500">
                    {product.category || "-"} / {product.warranty_years || "-"}年
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">備考</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[100px] w-full rounded-lg border px-3 py-2"
              placeholder="備考を入力"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
            </button>

            <Link
              href="/warranty-certificates"
              className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              戻る
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}