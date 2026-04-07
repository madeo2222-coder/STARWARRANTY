"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ContractRow = {
  id: string;
  amount: number | null;
  cost: number | null;
  commission: number | null;
};

type BillingRow = {
  amount: number | null;
};

type PaymentRegistrationRow = {
  registration_status: string | null;
};

type ProfileRow = {
  agency_id: string | null;
  role: string | null;
};

type AgencyRow = {
  id: string;
  parent_agency_id: string | null;
};

export default function AgencyDashboardPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);

  const [totalSales, setTotalSales] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [contractCount, setContractCount] = useState(0);

  const [notStartedCount, setNotStartedCount] = useState(0);
  const [customerPendingCount, setCustomerPendingCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error("ユーザー取得エラー:", userError);
          setLoading(false);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("agency_id, role")
          .eq("user_id", user.id)
          .single();

        if (profileError || !profileData) {
          console.error("プロフィール取得エラー:", profileError);
          setLoading(false);
          return;
        }

        const profile = profileData as ProfileRow;

        if (profile.role !== "agency") {
          console.error("代理店ユーザーではありません");
          setLoading(false);
          return;
        }

        if (!profile.agency_id) {
          setLoading(false);
          return;
        }

        // 👇 子代理店取得
        const { data: childAgencies } = await supabase
          .from("agencies")
          .select("id,parent_agency_id")
          .eq("parent_agency_id", profile.agency_id);

        const children = (childAgencies ?? []) as AgencyRow[];

        const visibleAgencyIds = [
          profile.agency_id,
          ...children.map((a) => a.id),
        ];

        // 👇 契約取得（ここが重要）
        const { data: contractsData, error: contractsError } = await supabase
          .from("contracts")
          .select("id, amount, cost, commission")
          .in("agency_id", visibleAgencyIds);

        if (contractsError || !contractsData) {
          console.error("contracts取得エラー:", contractsError);
          setLoading(false);
          return;
        }

        const contracts = contractsData as ContractRow[];

        let sales = 0;
        let profit = 0;

        contracts.forEach((contract) => {
          const amount = contract.amount ?? 0;
          const cost = contract.cost ?? 0;
          const commission = contract.commission ?? 0;

          sales += amount;
          profit += amount - cost - commission;
        });

        setTotalSales(sales);
        setTotalProfit(profit);
        setContractCount(contracts.length);

        const contractIds = contracts.map((c) => c.id);

        if (contractIds.length > 0) {
          const { data: billingsData } = await supabase
            .from("billings")
            .select("amount")
            .in("contract_id", contractIds)
            .eq("status", "pending");

          const billings = (billingsData ?? []) as BillingRow[];

          const pending = billings.reduce(
            (sum, b) => sum + (b.amount ?? 0),
            0
          );

          setPendingAmount(pending);

          const { data: registrationsData } = await supabase
            .from("payment_registrations")
            .select("registration_status")
            .in("contract_id", contractIds);

          const rows = (registrationsData ?? []) as PaymentRegistrationRow[];

          setNotStartedCount(
            rows.filter((r) => r.registration_status === "not_started").length
          );

          setCustomerPendingCount(
            rows.filter((r) => r.registration_status === "customer_pending")
              .length
          );

          setIncompleteCount(
            rows.filter((r) => r.registration_status === "incomplete").length
          );

          setCompletedCount(
            rows.filter((r) => r.registration_status === "completed").length
          );
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [supabase]);

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <h1 className="text-xl font-bold">代理店ダッシュボード</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded border p-4">
          <p className="text-sm">総売上</p>
          <p className="text-lg font-bold">{totalSales.toLocaleString()} 円</p>
        </div>

        <div className="rounded border p-4">
          <p className="text-sm">粗利</p>
          <p className="text-lg font-bold">{totalProfit.toLocaleString()} 円</p>
        </div>

        <div className="rounded border p-4">
          <p className="text-sm">未回収</p>
          <p className="text-lg font-bold">
            {pendingAmount.toLocaleString()} 円
          </p>
        </div>

        <div className="rounded border p-4">
          <p className="text-sm">契約数</p>
          <p className="text-lg font-bold">{contractCount} 件</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">決済登録進捗</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded border p-4">
            <p className="text-sm">未着手</p>
            <p className="text-lg font-bold">{notStartedCount} 件</p>
          </div>

          <div className="rounded border p-4">
            <p className="text-sm">顧客対応中</p>
            <p className="text-lg font-bold">{customerPendingCount} 件</p>
          </div>

          <div className="rounded border p-4">
            <p className="text-sm">不備あり</p>
            <p className="text-lg font-bold">{incompleteCount} 件</p>
          </div>

          <div className="rounded border p-4">
            <p className="text-sm">登録完了</p>
            <p className="text-lg font-bold">{completedCount} 件</p>
          </div>
        </div>
      </div>
    </div>
  );
}