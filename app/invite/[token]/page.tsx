"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AcceptResponse = {
  success?: boolean;
  error?: string;
  details?: string;
  agency_id?: string;
  agency_name?: string;
  role?: string;
  used_at?: string;
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = useMemo(() => {
    const raw = params?.token;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return typeof raw === "string" ? raw : "";
  }, [params]);

  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  const acceptStartedRef = useRef(false);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !token) return "";
    return `${window.location.origin}/invite/${token}`;
  }, [token]);

  const loginUrl = useMemo(() => {
    if (!token) return "/login";
    return `/login?next=${encodeURIComponent(`/invite/${token}`)}`;
  }, [token]);

  const confirmedFlag = searchParams.get("confirmed");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  async function acceptInviteWithAccessToken(accessToken: string) {
    const acceptResponse = await fetch("/api/invites/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });

    const acceptData = (await acceptResponse.json()) as AcceptResponse;

    if (!acceptResponse.ok || !acceptData.success) {
      throw new Error(
        acceptData.error ||
          acceptData.details ||
          "招待受け取り処理に失敗しました。"
      );
    }

    setIsCompleted(true);
    setNeedsEmailConfirmation(false);
    setErrorMessage("");
    setMessage(
      `招待受け取りが完了しました。代理店「${acceptData.agency_name ?? ""}」で利用開始できます。`
    );

    setTimeout(() => {
      router.push("/agencies");
      router.refresh();
    }, 800);
  }

  async function tryAcceptWithCurrentSession() {
    if (!token || isCompleted) return false;
    if (acceptStartedRef.current) return false;

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    if (!session?.access_token) {
      return false;
    }

    acceptStartedRef.current = true;

    try {
      await acceptInviteWithAccessToken(session.access_token);
      return true;
    } finally {
      acceptStartedRef.current = false;
    }
  }

  useEffect(() => {
    if (errorCode) {
      setErrorMessage(
        errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
          : "認証リンクが無効または期限切れです。もう一度招待登録をやり直してください。"
      );
    }
  }, [errorCode, errorDescription]);

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        if (confirmedFlag === "1") {
          setMessage(
            "メール確認が完了しました。ログイン済みなら自動で招待受け取りを試します。"
          );
        }

        const accepted = await tryAcceptWithCurrentSession();
        if (!active) return;

        if (accepted) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session && confirmedFlag === "1") {
          setMessage(
            "メール確認は完了しています。まだログイン状態が取れていない場合は、下の『ログイン画面へ』からログイン後、このページで招待受け取りを実行してください。"
          );
        }
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "不明なエラーが発生しました";
        setErrorMessage(message);
      }
    }

    void boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (!active) return;

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        try {
          await tryAcceptWithCurrentSession();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "不明なエラーが発生しました";
          setErrorMessage(message);
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [token, isCompleted, confirmedFlag, supabase]);

  async function handleAcceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");
    setNeedsEmailConfirmation(false);

    if (!token) {
      setErrorMessage("招待トークンが見つかりません。URLを確認してください。");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("メールアドレスを入力してください。");
      return;
    }

    if (!password) {
      setErrorMessage("パスワードを入力してください。");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("パスワードは6文字以上で入力してください。");
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage("確認用パスワードが一致しません。");
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const signUpResult = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: inviteUrl
            ? `${inviteUrl}?confirmed=1`
            : undefined,
        },
      });

      if (signUpResult.error) {
        throw new Error(signUpResult.error.message);
      }

      const session =
        signUpResult.data.session ||
        (await supabase.auth.getSession()).data.session;

      if (!session?.access_token) {
        setNeedsEmailConfirmation(true);
        setMessage(
          "確認メールを送信しました。メール内リンクを開いたあと、この招待ページに戻ります。戻った時点で自動受け取りを試します。うまくいかない場合はログイン後に『ログイン済みユーザーとして招待を受け取る』を押してください。"
        );
        return;
      }

      await acceptInviteWithAccessToken(session.access_token);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "不明なエラーが発生しました";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckLoggedInUser() {
    setCheckingSession(true);
    setMessage("");
    setErrorMessage("");

    try {
      if (!token) {
        throw new Error("招待トークンが見つかりません。URLを確認してください。");
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      if (!session?.access_token) {
        throw new Error(
          "現在ログインしていません。ログイン後にこの招待URLへ戻って再度お試しください。"
        );
      }

      await acceptInviteWithAccessToken(session.access_token);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "不明なエラーが発生しました";
      setErrorMessage(message);
    } finally {
      setCheckingSession(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold">1次代理店 招待登録</h1>
      <p className="mt-2 break-all text-sm text-gray-600">
        招待トークン: {token || "なし"}
      </p>

      <div className="mt-6 rounded-lg border p-4">
        <p className="text-sm text-gray-700">
          すでにログイン済みの方は、下のボタンで招待受け取りだけ実行できます。
        </p>
        <button
          type="button"
          onClick={handleCheckLoggedInUser}
          disabled={checkingSession || loading || isCompleted}
          className="mt-3 w-full rounded bg-gray-800 px-4 py-2 text-white disabled:opacity-50"
        >
          {checkingSession ? "確認中..." : "ログイン済みユーザーとして招待を受け取る"}
        </button>
      </div>

      <form onSubmit={handleAcceptInvite} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="example@example.com"
            disabled={loading || isCompleted}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="6文字以上"
            disabled={loading || isCompleted}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            パスワード（確認）
          </label>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="確認用"
            disabled={loading || isCompleted}
          />
        </div>

        <button
          type="submit"
          disabled={loading || checkingSession || isCompleted}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "登録中..." : "代理店アカウントを登録する"}
        </button>
      </form>

      {message ? (
        <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      ) : null}

      {needsEmailConfirmation ? (
        <div className="mt-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          メール認証が完了するまでは、招待はまだ消化されません。認証メールのリンクからこの招待ページに戻ったあと、必要ならログインして招待受け取りを実行してください。
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 text-sm">
        <Link href={loginUrl} className="text-blue-600 underline">
          ログイン画面へ
        </Link>
      </div>
    </div>
  );
}