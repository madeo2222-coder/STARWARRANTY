"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ContractRow = {
  id: string;
  contract_name: string | null;
  amount: number | null;
  contract_date: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ja-JP");
}

function formatNumber(value: number | null) {
  if (value == null) return "-";
  return value.toLocaleString("ja-JP");
}

export default function ContractsPageClient() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const result = await supabase
          .from("contracts")
          .select("id, contract_name, amount, contract_date")
          .order("contract_date", { ascending: false });

        if (result.error) {
          throw result.error;
        }

        if (!isMounted) return;
        setContracts((result.data ?? []) as ContractRow[]);
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "契約データ取得に失敗しました"
        );
        setContracts([]);
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDelete(contractId: string, contractName: string | null) {
    const ok = window.confirm(
      `契約「${contractName ?? "名称未設定"}」を削除しますか？`
    );
    if (!ok) return;

    setDeletingId(contractId);

    const { error } = await supabase
      .from("contracts")
      .delete()
      .eq("id", contractId);

    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      setDeletingId(null);
      return;
    }

    setContracts((prev) => prev.filter((contract) => contract.id !== contractId));
    setDeletingId(null);
    alert("削除しました");
  }

  return (
    <div className="p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-lg font-semibold">契約一覧</div>
        <Link
          href="/contracts/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          新規登録
        </Link>
      </div>

      {loading && <div className="mb-4 text-sm text-gray-600">読み込み中...</div>}

      {errorMessage && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          エラー: {errorMessage}
        </div>
      )}

      <div className="mb-4 text-sm text-gray-700">件数: {contracts.length}</div>

      <div className="overflow-x-auto rounded border">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-3 py-2 text-left">契約名</th>
              <th className="border px-3 py-2 text-right">金額</th>
              <th className="border px-3 py-2 text-left">契約日</th>
              <th className="border px-3 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={4} className="border px-3 py-8 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            ) : (
              contracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {contract.contract_name ?? "-"}
                    </Link>
                  </td>
                  <td className="border px-3 py-2 text-right">
                    {formatNumber(contract.amount)}
                  </td>
                  <td className="border px-3 py-2">
                    {formatDate(contract.contract_date)}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    <div className="flex justify-center gap-2">
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="rounded border px-3 py-1 text-xs hover:bg-gray-100"
                      >
                        詳細
                      </Link>
                      <Link
                        href={`/contracts/${contract.id}/edit`}
                        className="rounded border px-3 py-1 text-xs hover:bg-gray-100"
                      >
                        編集
                      </Link>
                      <button
                        onClick={() =>
                          handleDelete(contract.id, contract.contract_name)
                        }
                        disabled={deletingId === contract.id}
                        className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {deletingId === contract.id ? "削除中..." : "削除"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}