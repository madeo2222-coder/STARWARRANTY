import type { SupabaseClient, User } from "@supabase/supabase-js";

export const HEADQUARTERS_ADMIN_EMAILS = [
  "madeo8888@gmail.com",
  "y.shimizu@st-w.jp",
  "s.hidaka@st-w.jp",
  "n.fukuda@st-w.jp",
  "t.hiraga@st-w.jp",
] as const;

export function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function isHeadquartersEmail(value: string | null | undefined) {
  const email = normalizeEmail(value);
  return HEADQUARTERS_ADMIN_EMAILS.some((allowed) => allowed === email);
}

export class HeadquartersAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "HeadquartersAuthError";
    this.status = status;
  }
}

export function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

export async function requireHeadquartersBearer(
  request: Request,
  supabase: SupabaseClient
): Promise<{ user: User; email: string }> {
  const token = getBearerToken(request);
  if (!token) {
    throw new HeadquartersAuthError(401, "ログインが必要です");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new HeadquartersAuthError(401, "ログイン情報を確認できませんでした");
  }

  const email = normalizeEmail(user.email);
  if (!isHeadquartersEmail(email)) {
    throw new HeadquartersAuthError(403, "本部担当者のみ利用できます");
  }

  return { user, email };
}
