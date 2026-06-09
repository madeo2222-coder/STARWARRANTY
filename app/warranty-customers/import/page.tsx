"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ImportCustomerRow = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  postal_code: string;
  address: string;
  note: string;
  row_no: number;
};

type ImportResult = {
  success?: boolean;
  error?: string;
  inserted_count?: number;
  skipped_count?: number;
  error_count?: number;
  errors?: string[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function pickValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

export default function WarrantyCustomersImportPage() {
  const [rows, setRows] = useState<ImportCustomerRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const validRows = useMemo(
    () => rows.filter((row) => row.company_name.trim()),
    [rows]
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setErrorMessage("");

    const file = event.target.files?.[0];

    if (!file) {
      setRows([]);
      setFileName("");
      return;
    }

    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("シートが見つかりません");
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: "",
        }
      );

      const parsedRows = jsonRows.map((row, index) => {
        return {
          row_no: index + 2,
          company_name: pickValue(row, ["会社名", "顧客名", "法人名", "company_name"]),
          contact_name: pickValue(row, ["担当者", "担当者名", "氏名", "contact_name"]),
          email: pickValue(row, ["メール", "メールアドレス", "email"]),
          phone: pickValue(row, ["電話", "電話番号", "TEL", "tel", "phone"]),
          postal_code: pickValue(row, ["郵便番号", "郵便", "postal_code"]),
          address: pickValue(row, ["住所", "所在地", "address"]),
          note: pickValue(row, ["メモ", "備考", "note"]),
        };
      });

      setRows(parsedRows);
    } catch (error) {
      console.error(error);
      setRows([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ファイルの読み込みに失敗しました"
      );
    }
  }

  async function handleImport() {
    if (validRows.length === 0) {
      alert("取込できる顧客データがありません。会社名が必要です。");
      return;
    }

    const ok = window.confirm(
      `${validRows.length}件の顧客データを取り込みます。\n電話番号またはメールが既存顧客と一致する場合はスキップします。`
    );

    if (!ok) return;

    try {
      setImporting(true);
      setResult(null);
      setErrorMessage("");

      const response = await fetch("/api/warranty-customers-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customers: validRows,
        }),
      });

      const json = (await response.json()) as ImportResult;

      if (!response.ok || !json.success) {
        throw new Error(json.error || "取込に失敗しました");
      }

      setResult(json);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "取込に失敗しました"
      );
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const sampleRows = [
      {
        会社名: "株式会社サンプル",
        担当者名: "山田 太郎",
        メールアドレス: "sample@example.com",
        電話番号: "092-000-0000",
        郵便番号: "810-0001",
        住所: "福岡県福岡市中央区天神1-1-1",
        メモ: "既存顧客データ移行",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "顧客取込");
    XLSX.writeFile(workbook, "warranty-customers-import-template.xlsx");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">STAR WARRANTY</p>
          <h1 className="text-2xl font-bold">顧客CSV/Excel取込</h1>
          <p className="mt-1 text-sm text-gray-500">
            既存顧客データをExcelまたはCSVから一括登録します。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/warranty-customers"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            顧客管理へ戻る
          </Link>

          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            テンプレートExcelをダウンロード
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">取込ファイル選択</h2>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          対応項目：会社名、担当者名、メールアドレス、電話番号、郵便番号、住所、メモ。
          <br />
          会社名は必須です。電話番号またはメールアドレスが既存顧客と一致する場合は重複としてスキップします。
        </p>

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
          className="mt-5 block w-full rounded-lg border px-3 py-2 text-sm"
        />

        {fileName ? (
          <p className="mt-3 text-sm text-gray-500">選択中：{fileName}</p>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">読み込み件数</div>
          <div className="mt-2 text-3xl font-bold">{rows.length}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">取込可能件数</div>
          <div className="mt-2 text-3xl font-bold text-green-700">
            {validRows.length}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">会社名なし</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {rows.length - validRows.length}
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">取込プレビュー</h2>
              <p className="mt-1 text-sm text-gray-500">
                内容を確認してから登録してください。
              </p>
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="rounded-lg bg-black px-5 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {importing ? "取込中..." : "この内容で取り込む"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">行</th>
                  <th className="px-4 py-3 font-medium">会社名</th>
                  <th className="px-4 py-3 font-medium">担当者</th>
                  <th className="px-4 py-3 font-medium">メール</th>
                  <th className="px-4 py-3 font-medium">電話番号</th>
                  <th className="px-4 py-3 font-medium">郵便番号</th>
                  <th className="px-4 py-3 font-medium">住所</th>
                  <th className="px-4 py-3 font-medium">メモ</th>
                </tr>
              </thead>

              <tbody>
                {rows.slice(0, 200).map((row) => (
                  <tr
                    key={`${row.row_no}-${row.company_name}-${row.phone}`}
                    className={`border-t ${
                      row.company_name ? "hover:bg-gray-50" : "bg-red-50"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.row_no}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {row.company_name || "会社名なし"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.contact_name || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.email || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.phone || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.postal_code || "-"}
                    </td>
                    <td className="min-w-[240px] px-4 py-3">
                      {row.address || "-"}
                    </td>
                    <td className="min-w-[220px] px-4 py-3">
                      {row.note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 200 ? (
            <div className="border-t px-5 py-3 text-sm text-gray-500">
              先頭200件のみ表示しています。取込対象は全件です。
            </div>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          <h2 className="text-lg font-semibold">取込完了</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div>登録：{result.inserted_count || 0}件</div>
            <div>重複スキップ：{result.skipped_count || 0}件</div>
            <div>エラー：{result.error_count || 0}件</div>
          </div>

          {result.errors && result.errors.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {result.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}