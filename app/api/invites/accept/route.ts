import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "headquarters" | "agency" | "sub_agency";
type TargetRole = "agency" | "sub_agency";

type AcceptInviteRequestBody = {
  token?: string | null;
};

type InviteRow = {
  token: string;
  target_role: TargetRole;
  invite_email: string | null;
  agency_name: string | null;
  status: string | null;
  expires_at: string | null;
  parent_agency_id: string | null;
  used_at: string | null;
};

type ProfileRow = {
  id: string;
  user_id: string;
  role: Role | null;
  agency_id: string | null;
};

type AgencyRow = {
  id: string;
  agency_name: string | null;
};

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return NextResponse.json(
        { success: false, error: "Supabase環境変数が不足しています" },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "認証トークンがありません" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "ログインユーザーの取得に失敗しました" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as AcceptInviteRequestBody;
    const token = body.token?.trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: "token は必須です" },
        { status: 400 }
      );
    }

    const { data: invite, error: inviteError } = await adminClient
      .from("agency_invites")
      .select(
        "token, target_role, invite_email, agency_name, status, expires_at, parent_agency_id, used_at"
      )
      .eq("token", token)
      .maybeSingle<InviteRow>();

    if (inviteError) {
      return NextResponse.json(
        {
          success: false,
          error: "招待情報の取得に失敗しました",
          details: inviteError.message,
        },
        { status: 500 }
      );
    }

    if (!invite) {
      return NextResponse.json(
        { success: false, error: "招待URLが見つかりません" },
        { status: 404 }
      );
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "この招待URLはすでに使用済みです" },
        { status: 400 }
      );
    }

    if (invite.expires_at) {
      const expiresAtMs = new Date(invite.expires_at).getTime();
      if (!Number.isNaN(expiresAtMs) && Date.now() > expiresAtMs) {
        return NextResponse.json(
          { success: false, error: "この招待URLは有効期限切れです" },
          { status: 400 }
        );
      }
    }

    if (invite.target_role !== "agency" && invite.target_role !== "sub_agency") {
      return NextResponse.json(
        { success: false, error: "target_role が不正です" },
        { status: 400 }
      );
    }

    if (!invite.agency_name) {
      return NextResponse.json(
        { success: false, error: "agency_name が招待データにありません" },
        { status: 400 }
      );
    }

    if (invite.target_role === "sub_agency" && !invite.parent_agency_id) {
      return NextResponse.json(
        {
          success: false,
          error: "sub_agency 招待に必要な parent_agency_id がありません",
        },
        { status: 400 }
      );
    }

    if (invite.invite_email) {
      const inviteEmail = invite.invite_email.trim().toLowerCase();
      const userEmail = (user.email || "").trim().toLowerCase();

      if (!userEmail || inviteEmail !== userEmail) {
        return NextResponse.json(
          {
            success: false,
            error: "招待されたメールアドレスとログイン中メールアドレスが一致しません",
          },
          { status: 403 }
        );
      }
    }

    const { data: existingProfile, error: existingProfileError } =
      await adminClient
        .from("profiles")
        .select("id, user_id, role, agency_id")
        .eq("user_id", user.id)
        .maybeSingle<ProfileRow>();

    if (existingProfileError) {
      return NextResponse.json(
        {
          success: false,
          error: "既存プロフィールの確認に失敗しました",
          details: existingProfileError.message,
        },
        { status: 500 }
      );
    }

    if (existingProfile?.role === "headquarters") {
      return NextResponse.json(
        {
          success: false,
          error: "本部アカウントは代理店招待を受け取れません",
        },
        { status: 403 }
      );
    }

    if (existingProfile?.agency_id) {
      return NextResponse.json(
        {
          success: false,
          error: "このユーザーはすでに代理店に紐づいています",
        },
        { status: 400 }
      );
    }

    let createdAgency: AgencyRow | null = null;

    if (invite.target_role === "agency") {
      const { data, error } = await adminClient
        .from("agencies")
        .insert({
          agency_name: invite.agency_name,
          status: "active",
        })
        .select("id, agency_name")
        .single<AgencyRow>();

      if (error || !data) {
        return NextResponse.json(
          {
            success: false,
            error: "代理店の作成に失敗しました",
            details: error?.message,
          },
          { status: 500 }
        );
      }

      createdAgency = data;
    }

    if (invite.target_role === "sub_agency") {
      const { data, error } = await adminClient
        .from("agencies")
        .insert({
          agency_name: invite.agency_name,
          parent_agency_id: invite.parent_agency_id,
          status: "active",
        })
        .select("id, agency_name")
        .single<AgencyRow>();

      if (error || !data) {
        return NextResponse.json(
          {
            success: false,
            error: "子代理店の作成に失敗しました",
            details: error?.message,
          },
          { status: 500 }
        );
      }

      createdAgency = data;
    }

    if (!createdAgency) {
      return NextResponse.json(
        { success: false, error: "代理店作成結果が取得できませんでした" },
        { status: 500 }
      );
    }

    const newRole: TargetRole = invite.target_role;

    let profileWriteError: { message: string } | null = null;

    if (existingProfile) {
      const { error } = await adminClient
        .from("profiles")
        .update({
          role: newRole,
          agency_id: createdAgency.id,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      profileWriteError = error;
    } else {
      const { error } = await adminClient.from("profiles").insert({
        user_id: user.id,
        role: newRole,
        agency_id: createdAgency.id,
      });

      profileWriteError = error;
    }

    if (profileWriteError) {
      return NextResponse.json(
        {
          success: false,
          error: "プロフィール更新に失敗しました",
          details: profileWriteError.message,
        },
        { status: 500 }
      );
    }

    const usedAt = new Date().toISOString();

    const { error: inviteUpdateError } = await adminClient
      .from("agency_invites")
      .update({
        status: "used",
        used_at: usedAt,
      })
      .eq("token", token);

    if (inviteUpdateError) {
      return NextResponse.json(
        {
          success: false,
          error: "招待消化の更新に失敗しました",
          details: inviteUpdateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      agency_id: createdAgency.id,
      agency_name: createdAgency.agency_name,
      role: newRole,
      used_at: usedAt,
      parent_agency_id: invite.parent_agency_id ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";

    return NextResponse.json(
      {
        success: false,
        error: "招待受け取り処理中にエラーが発生しました",
        details: message,
      },
      { status: 500 }
    );
  }
}