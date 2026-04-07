"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CurrentProfile } from "@/lib/auth/getCurrentProfile";

type ContractRow = {
  id: string;
  customer_id: string | null;
  agency_id: string | null;
  contract_name: string | null;
  amount: number | null;
  cost: number | null;
  commission: number | null;
  contract_date: string | null;
  created_at?: string | null;
  customers?: {
    id: string;
    company_name: string | null;
    agency_id: string | null;
  } | null;
  agencies?: {
    id: string;
    name: string | null;
    parent_agency_id: string | null;
  } | null;
};

type AgencyRow = {
  id: string;
  name: string | null;
  parent_agency_id: string | null;
};

type Props = {
  initialProfile: CurrentProfile | null;
};

function toContracts(value: unknown): ContractRow[] {
  if (!Array.isArray(value)) return [];
  return value as ContractRow[];
}

export default function ContractsPageClient({ initialProfile }: Props) {
  const [profile] = useState<CurrentProfile | null>(initialProfile);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [visibleAgencyIds, setVisibleAgencyIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyLoading, setAgencyLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const canLoad = useMemo(() => {
    if (!profile) return false;
    if (profile.role === "headquarters") return true;
    if (!profile.agency_id) return false;
    return true;
  }, [profile]);

  const resolveVisibleAgencyIds = useCallback(async () => {
    if (!profile) {
      setVisibleAgencyIds([]);
      setAgencyLoading(false);
      return;
    }

    if (profile.role === "headquarters") {
      setVisibleAgencyIds([]);
      setAgencyLoading(false);
      return;
    }

    if (!profile.agency_id) {
      setVisibleAgencyIds([]);
      setAgencyLoading(false);
      return;
    }

    try {
      setAgencyLoading(true);

      if (profile.role === "sub_agency") {
        setVisibleAgencyIds([profile.agency_id]);
        return;
      }

      if (profile.role === "agency") {
        const { data, error } = await supabase
          .from("agencies")
          .select("id,name,parent_agency_id")
          .eq("parent_agency_id", profile.agency_id);

        if (error) throw error;

        const children = (Array.isArray(data) ? data : []) as AgencyRow[];
        const ids = [profile.agency_id, ...children.map((row) => row.id)];
        setVisibleAgencyIds(ids);
        return;
      }

      setVisibleAgencyIds([]);
    } catch (e) {
      console.error(e);
      setError("代理店取得エラー");
    } finally {
      setAgencyLoading(false);
    }
  }, [profile]);

  const loadContracts = useCallback(async () => {
    if (!profile || !canLoad) {
      setContracts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let query = supabase
        .from("contracts")
        .select(
          `
          *,
          customers:customer_id (company_name,agency_id),
          agencies:agency_id (name,parent_agency_id)
        `
        )
        .order("contract_date", { ascending: false });

      if (profile.role !== "headquarters") {
        if (visibleAgencyIds.length === 0) {
          setContracts([]);
          return;
        }

        query = query.in("agency_id", visibleAgencyIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      setContracts(toContracts(data));
    } catch (e) {
      console.error(e);
      setError("契約取得エラー");
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [profile, canLoad, visibleAgencyIds]);

  useEffect(() => {
    void resolveVisibleAgencyIds();
  }, [resolveVisibleAgencyIds]);

  useEffect(() => {
    if (!profile) return;

    if (profile.role === "headquarters") {
      void loadContracts();
      return;
    }

    if (!agencyLoading) {
      void loadContracts();
    }
  }, [profile, agencyLoading, loadContracts]);

  const total = useMemo(() => {
    return contracts.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
  }, [contracts]);

  if (!profile) {
    return <div className="p-4">ログインエラー</div>;
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-xl font-bold mb-4">契約一覧</h1>

      <div className="mb-4">総売上: ¥{total.toLocaleString()}</div>

      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>顧客</th>
              <th>金額</th>
              <th>代理店</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td>{c.customers?.company_name}</td>
                <td>¥{Number(c.amount ?? 0).toLocaleString()}</td>
                <td>{c.agencies?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}