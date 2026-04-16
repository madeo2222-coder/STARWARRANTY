import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "StarRevenue Platform",
  description: "StarRevenue Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-white text-black">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-4">
            <Link
              href="/"
              className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
            >
              ダッシュボード
            </Link>

            <Link
              href="/customers"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              顧客一覧
            </Link>

            <Link
              href="/contracts"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              契約一覧
            </Link>

            <Link
              href="/billings"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              請求一覧
            </Link>

            <Link
              href="/agencies"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              代理店管理
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-7xl">{children}</main>
      </body>
    </html>
  );
}