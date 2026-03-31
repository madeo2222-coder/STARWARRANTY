"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Agency = {
  id: string;
  name: string;
  parent_id: string | null;
};

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔥 仮ログイン（ここ変えるだけでテスト可能）
  const mockProfile = {
    role: "agency", // "headquarters" | "agency" | "sub_agency"
    agency_id: "ここに自分のagency_id入れる",
  };

  useEffect(() => {
    const fetchAgencies = async () => {
      setLoading(true);

      let query = supabase.from("agencies").select("*");

      // 🔥 権限制御
      if (mockProfile.role === "headquarters") {
        // 何もしない（全部見える）
      }

      if (mockProfile.role === "agency") {
        const { data: childAgencies } = await supabase
          .from("agencies")
          .select("id")
          .eq("parent_id", mockProfile.agency_id);

        const ids = [
          mockProfile.agency_id,
          ...(childAgencies?.map((a) => a.id) || []),
        ];

        query = query.in("id", ids);
      }

      if (mockProfile.role === "sub_agency") {
        query = query.eq("id", mockProfile.agency_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error(error);
      } else {
        setAgencies(data || []);
      }

      setLoading(false);
    };

    fetchAgencies();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>代理店一覧</h1>

      <table border={1} cellPadding={10}>
        <thead>
          <tr>
            <th>ID</th>
            <th>名前</th>
            <th>親代理店</th>
          </tr>
        </thead>
        <tbody>
          {agencies.map((agency) => (
            <tr key={agency.id}>
              <td>{agency.id}</td>
              <td>{agency.name}</td>
              <td>{agency.parent_id || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}