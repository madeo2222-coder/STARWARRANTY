"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Profile = {
  id?: string;
  user_id?: string;
  agency_id: string | null;
  role: string | null;
};

type Agency = {
  id: string;
  name: string | null;
  parent_agency_id: string | null;
};

type Customer = {
  id: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  agency_id?: string | null;
  created_at?: string | null;
};

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;

  if (typeof err === "string") return err;

  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;

    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error_description === "string") {
      return anyErr.error_description;
    }
    if (typeof anyErr.details === "string") return anyErr.details;
    if (typeof anyErr.hint === "string") return anyErr.hint;

    try {
      return JSON.stringify(anyErr);
    } catch {
      return "不明なエラーが発生しました。";
    }
  }

  return "不明なエラーが発生しました。";
}

export default function CustomersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("ログイン情報を取得できませんでした。");

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, user_id, agency_id, role")
          .eq("user_id", user.id)
          .single();

        if (profileError) throw profileError;

        if (!isMounted) return;
        setProfile(profileData as Profile);

        const userRole = String(profileData?.role ?? "").toLowerCase();
        const userAgencyId = profileData?.agency_id ?? null;

        let visibleAgencyIds: string[] = [];

        if (
          userRole === "headquarters" ||
          userRole === "hq" ||
          userRole === "admin"
        ) {
          const { data: allAgencies, error: agenciesError } = await supabase
            .from("agencies")
            .select("id, name, parent_agency_id")
            .order("created_at", { ascending: true });

          if (agenciesError) throw agenciesError;

          const safeAgencies = ((allAgencies ?? []) as Agency[]).filter(
            (agency) => !!agency.id
          );

          if (!isMounted) return;
          setAgencies(safeAgencies);
          visibleAgencyIds = safeAgencies.map((agency) => agency.id);
        } else {
          if (!userAgencyId) {
            if (!isMounted) return;
            setAgencies([]);
            setCustomers([]);
            setLoading(false);
            return;
          }

          const { data: childAgencies, error: childAgenciesError } =
            await supabase
              .from("agencies")
              .select("id, name, parent_agency_id")
              .eq("parent_agency_id", userAgencyId)
              .order("created_at", { ascending: true });

          if (childAgenciesError) throw childAgenciesError;

          const childIds = ((childAgencies ?? []) as Agency[])
            .map((agency) => agency.id)
            .filter(Boolean);

          const ownAndChildren = [userAgencyId, ...childIds];

          const { data: visibleAgencies, error: visibleAgenciesError } =
            await supabase
              .from("agencies")
              .select("id, name, parent_agency_id")
              .in("id", ownAndChildren)
              .order("created_at", { ascending: true });

          if (visibleAgenciesError) throw visibleAgenciesError;

          if (!isMounted) return;
          setAgencies((visibleAgencies ?? []) as Agency[]);
          visibleAgencyIds = ownAndChildren;
        }

        let customersQuery = supabase
          .from("customers")
          .select("id, name, email, phone, agency_id, created_at")
          .order("created_at", { ascending: false });

        if (visibleAgencyIds.length > 0) {
          customersQuery = customersQuery.in("agency_id", visibleAgencyIds);
        }

        const { data: customersData, error: customersError } =
          await customersQuery;

        if (customersError) throw customersError;

        if (!isMounted) return;
        setCustomers((customersData ?? []) as Customer[]);
      } catch (err) {
        console.error("customers page load error:", err);

        if (!isMounted) return;

        setError(getErrorMessage(err));
        setCustomers([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const agencyMap = useMemo(() => {
    return new Map(
      agencies.map((agency) => [agency.id, agency.name ?? "代理店名未設定"])
    );
  }, [agencies]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return customers;

    return customers.filter((customer) => {
      const name = String(customer.name ?? "").toLowerCase();
      const email = String(customer.email ?? "").toLowerCase();
      const phone = String(customer.phone ?? "").toLowerCase();
      const agencyName = String(
        customer.agency_id ? agencyMap.get(customer.agency_id) ?? "" : ""
      ).toLowerCase();

      return (
        name.includes(keyword) ||
        email.includes(keyword) ||
        phone.includes(keyword) ||
        agencyName.includes(keyword)
      );
    });
  }, [customers, search, agencyMap]);

  return (
    <div className="p-4 pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">顧客一覧</h1>
        <p className="mt-1 text-sm text-gray-500">
          {profile?.role
            ? `ログイン中の権限: ${profile.role}`
            : "ログイン中の権限を確認しています"}
        </p>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="顧客名 / メール / 電話 / 代理店名で検索"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-black"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          読み込み中...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          顧客データがありません。
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">顧客名</th>
                  <th className="px-4 py-3 font-medium">メール</th>
                  <th className="px-4 py-3 font-medium">電話番号</th>
                  <th className="px-4 py-3 font-medium">代理店</th>
                  <th className="px-4 py-3 font-medium">登録日</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {customer.name || "未設定"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {customer.email || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {customer.phone || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {customer.agency_id
                        ? agencyMap.get(customer.agency_id) ?? "代理店未設定"
                        : "代理店未設定"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString("ja-JP")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}