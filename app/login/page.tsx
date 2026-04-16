"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const nextPath = useMemo(() => {
    const raw = searchParams.get("next");
    if (!raw) return "/";
    if (!raw.startsWith("/")) return "/";
    return raw;
  }, [searchParams]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (!email || !password) {
        setMessage("メールアドレスとパスワードを入力してください");
        setLoading(false);
        return;
      }

      const supabase = createClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          setMessage(`ログイン失敗: ${error.message}`);
          setLoading(false);
          return;
        }

        router.push(nextPath);
        router.refresh();
        return;
      }

      setMessage(
        "新規登録は招待URLから行ってください。本部または発行者から受け取った招待URLを開いて登録してください。"
      );
      setLoading(false);
    } catch (error) {
      console.error(error);
      setMessage("画面初期化または認証処理でエラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">StarRevenue ログイン</h1>
          <p className="mt-2 text-sm text-gray-500">本部・代理店向け管理画面</p>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
            className={`rounded-lg px-4 py-2 text-sm ${
              mode === "login" ? "bg-black text-white" : "border bg-white"
            }`}
          >
            ログイン
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setMessage(
                "新規登録は招待URLから行ってください。本部または発行者から受け取った招待URLを開いて登録してください。"
              );
            }}
            className={`rounded-lg px-4 py-2 text-sm ${
              mode === "signup" ? "bg-black text-white" : "border bg-white"
            }`}
          >
            新規登録
          </button>
        </div>

        {message ? (
          <div className="mb-4 rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
            {message}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="example@starrevenue.jp"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none"
              placeholder="********"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading
              ? "処理中..."
              : mode === "login"
              ? "ログインする"
              : "招待URLから登録してください"}
          </button>
        </form>
      </div>
    </div>
  );
}