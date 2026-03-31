"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!email || !password) {
      setMessage("メールアドレスとパスワードを入力してください");
      setLoading(false);
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(`ログイン失敗: ${error.message}`);
        setLoading(false);
        return;
      }

      router.push("/auth-check");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(`新規登録失敗: ${error.message}`);
      setLoading(false);
      return;
    }

    setMessage("新規登録しました。Authentication の Users を確認してください。");
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-6">
      <h1 className="text-2xl font-bold">ログイン</h1>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded-lg px-4 py-2 ${
            mode === "login" ? "bg-black text-white" : "border"
          }`}
        >
          ログイン
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded-lg px-4 py-2 ${
            mode === "signup" ? "bg-black text-white" : "border"
          }`}
        >
          新規登録
        </button>
      </div>

      {message && (
        <div className="rounded-lg border bg-gray-50 p-3 text-sm">{message}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "処理中..." : mode === "login" ? "ログインする" : "新規登録する"}
        </button>
      </form>
    </div>
  );
}