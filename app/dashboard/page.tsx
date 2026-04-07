"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ContractRow = {
  id: string;
  customer_id: string | null;
  agency_id: string | null;
  amount: number | null;
  cost: number | null;
  commission: number | null;
  contract_date: string | null;
  payment_registrations:
    | {
        payment_method: string | null;
        registration_status: string | null;
        issue_note: string | null;
      }[]
    | null;
};

type ProfileRow = {
  role: "headquarters" | "agency" | "sub_agency";
  agency_id: string | null;
};

type AgencyRow = {
  id: string;
  name: string | null;
  parent_agency_id: string | null;
};

function toContracts(value: unknown): ContractRow[] {
  if (!Array.isArray(value)) return [];
  return value as ContractRow[];
}

function formatPaymentMethod(value: string | null | undefined) {
  switch (value) {
    case "credit":
      return "クレカ";
    case "bank_transfer":
      return "口座振替";
    default:
      return "未設定";
  }
}

function formatRegistrationStatus(value: string | null | undefined) {
  switch (value) {
    case "not_started":
      return "未着手";
    case "sent":
      return "案内送信済み";
    case "customer_pending":
      return "顧客対応中";
    case "documents_collected":
      return "書類回収済み";
    case "submitted":
      return "送付済み";
    case "incomplete":
      return "不備あり";
    case "retrying":
      return "再対応中";
    case "completed":
      return "登録完了";
    case "cancelled":
      return "キャンセル";
    default:
      return "未設定";
  }
}

export default function ContractsPage() {
  const supabase = createClient();

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const fetchContracts = async () => {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("ユーザー取得エラー:", userError);
        setContracts([]);
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role, agency_id")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profileData) {
        console.error("プロフィール取得エラー:", profileError);
        setContracts([]);
        setLoading(false);
        return;
      }

      const profile = profileData as ProfileRow;

      let visibleAgencyIds: string[] | null = null;

      if (profile.role === "sub_agency") {
        visibleAgencyIds = profile.agency_id ? [profile.agency_id] : [];
      } else if (profile.role === "agency") {
        if (!profile.agency_id) {
          visibleAgencyIds = [];
        } else {
          const { data: childAgencies, error: childAgenciesError } =
            await supabase
              .from("agencies")
              .select("id,name,parent_agency_id")
              .eq("parent_agency_id", profile.agency_id);

          if (childAgenciesError) {
            console.error("子代理店取得エラー:", childAgenciesError);
            setContracts([]);
            setLoading(false);
            return;
          }

          const children = (Array.isArray(childAgencies)
            ? childAgencies
            : []) as AgencyRow[];

          visibleAgencyIds = [
            profile.agency_id,
            ...children.map((agency) => agency.id),
          ];
        }
      }

      let query = supabase
        .from("contracts")
        .select(
          `
          id,
          customer_id,
          agency_id,
          amount,
          cost,
          commission,
          contract_date,
          payment_registrations (
            payment_method,
            registration_status,
            issue_note
          )
        `
        )
        .order("contract_date", { ascending: false });

      if (visibleAgencyIds !== null) {
        if (visibleAgencyIds.length === 0) {
          setContracts([]);
          setLoading(false);
          return;
        }

        query = query.in("agency_id", visibleAgencyIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error("契約取得エラー:", error);
        setContracts([]);
        setLoading(false);
        return;
      }

      setContracts(toContracts(data));
      setLoading(false);
    };

    void fetchContracts();
  }, [supabase]);

  const filteredContracts = useMemo(() => {
    if (statusFilter === "all") {
      return contracts;
    }

    return contracts.filter((contract) => {
      const registration = contract.payment_registrations?.[0] ?? null;
      const status = registration?.registration_status ?? "unset";

      if (statusFilter === "unset") {
        return !registration?.registration_status;
      }

      return status === statusFilter;
    });
  }, [contracts, statusFilter]);

  const downloadCsv = () => {
    if (filteredContracts.length === 0) {
      alert("出力するデータがありません");
      return;
    }

    const headers = [
      "id",
      "customer_id",
      "agency_id",
      "amount",
      "cost",
      "commission",
      "contract_date",
      "payment_method",
      "registration_status",
      "issue_note",
    ];

    const rows = filteredContracts.map((contract) => {
      const registration = contract.payment_registrations?.[0] ?? null;

      return [
        contract.id ?? "",
        contract.customer_id ?? "",
        contract.agency_id ?? "",
        contract.amount ?? 0,
        contract.cost ?? 0,
        contract.commission ?? 0,
        contract.contract_date ?? "",
        registration?.payment_method ?? "",
        registration?.registration_status ?? "",
        registration?.issue_note ?? "",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `contracts_${today}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">契約一覧</h1>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="all">すべて</option>
            <option value="unset">未設定</option>
            <option value="not_started">未着手</option>
            <option value="sent">案内送信済み</option>
            <option value="customer_pending">顧客対応中</option>
            <option value="documents_collected">書類回収済み</option>
            <option value="submitted">送付済み</option>
            <option value="incomplete">不備あり</option>
            <option value="retrying">再対応中</option>
            <option value="completed">登録完了</option>
            <option value="cancelled">キャンセル</option>
          </select>

          <button
            onClick={downloadCsv}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            CSV出力
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        表示件数: {filteredContracts.length} 件
      </p>

      {filteredContracts.length === 0 ? (
        <p>該当するデータがありません</p>
      ) : (
        <div className="space-y-3">
          {filteredContracts.map((contract) => {
            const registration = contract.payment_registrations?.[0] ?? null;
            const profit =
              (contract.amount ?? 0) -
              (contract.cost ?? 0) -
              (contract.commission ?? 0);

            return (
              <div key={contract.id} className="rounded border p-4">
                <div className="space-y-1">
                  <p className="font-semibold">契約ID: {contract.id}</p>
                  <p>顧客ID: {contract.customer_id ?? "-"}</p>
                  <p>代理店ID: {contract.agency_id ?? "-"}</p>
                  <p>契約日: {contract.contract_date ?? "-"}</p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <p>金額: {(contract.amount ?? 0).toLocaleString()} 円</p>
                  <p>原価: {(contract.cost ?? 0).toLocaleString()} 円</p>
                  <p>手数料: {(contract.commission ?? 0).toLocaleString()} 円</p>
                  <p>粗利: {profit.toLocaleString()} 円</p>
                </div>

                <div className="mt-3 rounded bg-gray-50 p-3">
                  <p className="font-medium">決済登録進捗</p>
                  <p>決済手段: {formatPaymentMethod(registration?.payment_method)}</p>
                  <p>
                    登録進捗:{" "}
                    {formatRegistrationStatus(registration?.registration_status)}
                  </p>
                  <p>不備メモ: {registration?.issue_note?.trim() || "なし"}</p>
                </div>

                <div className="mt-3">
                  <Link
                    href={`/contracts/${contract.id}/payment-registration`}
                    className="inline-block rounded border px-3 py-2 text-sm"
                  >
                    進捗を登録・更新
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}