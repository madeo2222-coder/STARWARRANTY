"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "headquarters" | "agency" | "sub_agency";

type Profile = {
  role: AppRole;
  agency_id: string | null;
};

type Agency = {
  id: string;
  agency_name?: string | null;
  name?: string | null;
  parent_agency_id: string | null;
  created_at?: string | null;
};

type InviteRow = {
  id: string;
  token: string | null;
  agency_name: string | null;
  invite_email: string | null;
  target_role: "agency" | "sub_agency" | string | null;
  status: string | null;
  created_at: string | null;
  used_at: string | null;
  issued_by_agency_id: string | null;
};

export default function AgenciesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const [agencyName, setAgencyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  const canCreateAgencyInvite =
    profile?.role === "headquarters" || profile?.role === "agency";

  const inviteTargetRole: "agency" | "sub_agency" =
    profile?.role === "headquarters" ? "agency" : "sub_agency";

  function getAgencyLabel(agency: Agency) {
    return agency.agency_name || agency.name || "名称未設定";
  }

  async function fetchInvitesSafe(role: AppRole, agencyId: string | null) {
    if (role === "headquarters") {
      const { data, error } = await supabase
        .from("agency_invites")
        .select(
          "id, token, agency_name, invite_email, target_role, status, created_at, used_at, issued_by_agency_id"
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as InviteRow[];
    }

    if (role === "agency") {
      if (!agencyId) return [];

      const { data, error } = await supabase
        .from("agency_invites")
        .select(
          "id, token, agency_name, invite_email, target_role, status, created_at, used_at, issued_by_agency_id"
        )
        .eq("issued_by_agency_id", agencyId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as InviteRow[];
    }

    return [];
  }

  async function loadPageData() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(userError.message);
      }

      if (!user) {
        throw new Error("ログイン情報が取得できませんでした");
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role, agency_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (!profileData) {
        setProfile(null);
        setAgencies([]);
        setInvites([]);
        setErrorMessage(
          "プロフィールがまだ作成されていません。招待受け取りが完了してから再度開いてください。"
        );
        setLoading(false);
        return;
      }

      const currentProfile = profileData as Profile;
      setProfile(currentProfile);

      if (currentProfile.role === "headquarters") {
        const { data: agenciesData, error: agenciesError } = await supabase
          .from("agencies")
          .select("id, agency_name, name, parent_agency_id, created_at")
          .order("created_at", { ascending: false });

        if (agenciesError) {
          throw new Error(agenciesError.message);
        }

        const invitesData = await fetchInvitesSafe(
          currentProfile.role,
          currentProfile.agency_id
        );

        setAgencies((agenciesData ?? []) as Agency[]);
        setInvites(invitesData);
      } else if (currentProfile.role === "agency") {
        const myAgencyId = currentProfile.agency_id;

        if (!myAgencyId) {
          setAgencies([]);
          setInvites([]);
          setLoading(false);
          return;
        }

        const { data: agenciesData, error: agenciesError } = await supabase
          .from("agencies")
          .select("id, agency_name, name, parent_agency_id, created_at")
          .eq("parent_agency_id", myAgencyId)
          .order("created_at", { ascending: false });

        if (agenciesError) {
          throw new Error(agenciesError.message);
        }

        const invitesData = await fetchInvitesSafe(
          currentProfile.role,
          currentProfile.agency_id
        );

        setAgencies((agenciesData ?? []) as Agency[]);
        setInvites(invitesData);
      } else {
        setAgencies([]);
        setInvites([]);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "データ取得に失敗しました";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  async function handleCreateInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setGeneratedLink("");

    if (!canCreateAgencyInvite) {
      setErrorMessage("このロールでは招待を作成できません");
      return;
    }

    if (!agencyName.trim()) {
      setErrorMessage("代理店名を入力してください");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("認証トークンがありません");
      }

      const response = await fetch("/api/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          agency_name: agencyName.trim(),
          invite_email: inviteEmail.trim() || null,
          target_role: inviteTargetRole,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          result?.error || result?.message || "招待の作成に失敗しました";
        throw new Error(message);
      }

      const token = result?.token ?? result?.invite?.token ?? null;
      const link =
        result?.invite_url ??
        (token ? `${window.location.origin}/invite/${token}` : "");

      setSuccessMessage(
        inviteTargetRole === "agency"
          ? "一次代理店招待を作成しました"
          : "二次代理店招待を作成しました"
      );
      setGeneratedLink(link);
      setAgencyName("");
      setInviteEmail("");

      await loadPageData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "招待作成に失敗しました";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  function getInviteStatusLabel(invite: InviteRow) {
    if (invite.used_at) return "使用済み";
    if (invite.status === "used") return "使用済み";
    if (invite.status === "expired") return "期限切れ";
    if (invite.status === "revoked") return "無効";
    return "未使用";
  }

  function getInviteLink(invite: InviteRow) {
    if (!invite.token) return "";
    return `${window.location.origin}/invite/${invite.token}`;
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">代理店管理</h1>
        <p className="mt-1 text-sm text-gray-600">
          代理店一覧と招待発行をこの画面で管理します
        </p>
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
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          読み込み中...
        </div>
      ) : (
        <>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">招待発行</h2>
              <p className="mt-1 text-sm text-gray-600">
                {profile?.role === "headquarters"
                  ? "一次代理店の招待を発行します"
                  : profile?.role === "agency"
                  ? "二次代理店の招待を発行します"
                  : "このロールでは招待作成はできません"}
              </p>
            </div>

            {canCreateAgencyInvite ? (
              <form onSubmit={handleCreateInvite} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    代理店名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="例：テスト代理店"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    メールアドレス（任意）
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="例：test@example.com"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "作成中..." : "招待を発行する"}
                </button>
              </form>
            ) : (
              <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
                このロールでは招待作成はできません
              </div>
            )}

            {generatedLink ? (
              <div className="mt-4 rounded-xl border p-4">
                <p className="mb-2 text-sm font-medium text-gray-700">発行済みリンク</p>
                <p className="break-all text-sm text-gray-700">{generatedLink}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">代理店一覧</h2>
              <p className="mt-1 text-sm text-gray-600">
                {profile?.role === "headquarters"
                  ? "全代理店を表示"
                  : profile?.role === "agency"
                  ? "自社配下の二次代理店を表示"
                  : "閲覧権限がありません"}
              </p>
            </div>

            {agencies.length === 0 ? (
              <p className="text-sm text-gray-500">代理店データはありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="px-3 py-2">代理店名</th>
                      <th className="px-3 py-2">親代理店ID</th>
                      <th className="px-3 py-2">作成日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencies.map((agency) => (
                      <tr key={agency.id} className="border-b last:border-0">
                        <td className="px-3 py-3">{getAgencyLabel(agency)}</td>
                        <td className="px-3 py-3 text-gray-600">
                          {agency.parent_agency_id || "-"}
                        </td>
                        <td className="px-3 py-3 text-gray-600">
                          {agency.created_at
                            ? new Date(agency.created_at).toLocaleString("ja-JP")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">招待一覧</h2>
              <p className="mt-1 text-sm text-gray-600">
                発行済みリンクと利用状況を確認できます
              </p>
            </div>

            {invites.length === 0 ? (
              <p className="text-sm text-gray-500">招待データはありません</p>
            ) : (
              <div className="space-y-3">
                {invites.map((invite) => (
                  <div key={invite.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {invite.agency_name || "名称未設定"}
                      </div>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                        {getInviteStatusLabel(invite)}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <p>対象ロール: {invite.target_role || "-"}</p>
                      <p>招待先メール: {invite.invite_email || "-"}</p>
                      <p>
                        作成日:{" "}
                        {invite.created_at
                          ? new Date(invite.created_at).toLocaleString("ja-JP")
                          : "-"}
                      </p>
                      <p>
                        使用日:{" "}
                        {invite.used_at
                          ? new Date(invite.used_at).toLocaleString("ja-JP")
                          : "-"}
                      </p>
                    </div>

                    {getInviteLink(invite) ? (
                      <div className="mt-3 break-all rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                        {getInviteLink(invite)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}