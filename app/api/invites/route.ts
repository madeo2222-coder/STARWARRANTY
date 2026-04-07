import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "headquarters" | "agency" | "sub_agency";
type TargetRole = "agency" | "sub_agency";

type InviteRequestBody = {
  target_role: TargetRole;
  invite_email?: string | null;
  agency_name?: string | null;
  expires_in_days?: number | null;
};

type ProfileRow = {
  user_id: string;
  role: Role;
  agency_id: string | null;
};

function generateToken(length = 48) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  return "http://localhost:3001";
}

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

    const body = (await request.json()) as InviteRequestBody;
    const targetRole = body.target_role;
    const inviteEmail = body.invite_email?.trim() || null;
    const agencyName = body.agency_name?.trim() || null;
    const expiresInDays =
      typeof body.expires_in_days === "number" && body.expires_in_days > 0
        ? body.expires_in_days
        : 7;

    console.log("Invite POST request", {
      target_role: targetRole,
      invite_email: inviteEmail,
      agency_name: agencyName,
      expires_in_days: expiresInDays,
    });

    if (targetRole !== "agency" && targetRole !== "sub_agency") {
      return NextResponse.json(
        { success: false, error: "target_role が不正です" },
        { status: 400 }
      );
    }

    if (!agencyName) {
      return NextResponse.json(
        { success: false, error: "agency_name は必須です" },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("user_id, role, agency_id")
      .eq("user_id", user.id)
      .single<ProfileRow>();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "プロフィール取得に失敗しました" },
        { status: 403 }
      );
    }

    const issuerRole = profile.role;
    const issuerAgencyId = profile.agency_id;

    const canIssueAgencyInvite =
      issuerRole === "headquarters" && targetRole === "agency";
    const canIssueSubAgencyInvite =
      issuerRole === "agency" && targetRole === "sub_agency";

    if (!canIssueAgencyInvite && !canIssueSubAgencyInvite) {
      return NextResponse.json(
        { success: false, error: "この権限ではその招待URLを発行できません" },
        { status: 403 }
      );
    }

    if (targetRole === "sub_agency" && !issuerAgencyId) {
      return NextResponse.json(
        { success: false, error: "代理店ユーザーの agency_id が未設定です" },
        { status: 400 }
      );
    }

    const token = generateToken(48);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + expiresInDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const insertPayload = {
      token,
      issued_by_user_id: user.id,
      issued_by_agency_id:
        issuerRole === "agency" ? issuerAgencyId : null,
      target_role: targetRole,
      parent_agency_id: targetRole === "sub_agency" ? issuerAgencyId : null,
      invite_email: inviteEmail,
      agency_name: agencyName,
      status: "pending",
      expires_at: expiresAt,
    };

    const { error: insertError } = await adminClient
      .from("agency_invites")
      .insert(insertPayload);

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: "招待URLの保存に失敗しました",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    const inviteUrl = `${getBaseUrl()}/invite/${token}`;

    return NextResponse.json({
      success: true,
      token,
      invite_url: inviteUrl,
      target_role: targetRole,
      agency_name: agencyName,
      expires_at: expiresAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";

    return NextResponse.json(
      {
        success: false,
        error: "招待URL発行中にエラーが発生しました",
        details: message,
      },
      { status: 500 }
    );
  }
}