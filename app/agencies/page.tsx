"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export default function AgenciesPage() {
  const [agencyName, setAgencyName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreateInvite(targetRole: "agency" | "sub_agency") {
    setLoading(true);
    setError("");
    setInviteUrl("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (!session?.access_token) {
        setError("ログイン状態が取得できません");
        return;
      }

      const res = await fetch("/api/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          target_role: targetRole,
          agency_name: agencyName,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "作成失敗");
        return;
      }

      setInviteUrl(json.invite_url);
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      alert("コピーしました");
    } catch {
      alert("コピーに失敗しました");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">代理店管理 / 招待発行</h1>

      <div className="space-y-3">
        <input
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
          placeholder="代理店名を入力"
          className="w-full rounded border p-2"
        />

        <div className="flex gap-2">
          <button
            onClick={() => handleCreateInvite("agency")}
            className="rounded bg-blue-600 px-4 py-2 text-white"
            disabled={loading}
          >
            1次代理店招待
          </button>

          <button
            onClick={() => handleCreateInvite("sub_agency")}
            className="rounded bg-green-600 px-4 py-2 text-white"
            disabled={loading}
          >
            2次代理店招待
          </button>
        </div>
      </div>

      {loading && <div>作成中...</div>}

      {error && <div className="text-red-500">{error}</div>}

      {inviteUrl && (
        <div className="space-y-2">
          <div className="text-sm">招待URL</div>
          <div className="break-all rounded border bg-gray-50 p-2">
            {inviteUrl}
          </div>
          <button
            onClick={copyUrl}
            className="rounded bg-black px-3 py-1 text-white"
          >
            コピー
          </button>
        </div>
      )}
    </div>
  );
}