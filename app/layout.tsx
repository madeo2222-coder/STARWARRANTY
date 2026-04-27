import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "STAR WARRANTY",
  description: "STAR WARRANTY",
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
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              ホーム
            </Link>

            <Link
              href="/warranty-certificates"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              保証書管理
            </Link>

            <Link
              href="/repair-requests"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              修理受付管理
            </Link>

            <Link
              href="/warranty-invoices"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              請求書管理
            </Link>

            <Link
              href="/headquarters"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              本部管理
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-7xl">{children}</main>
      </body>
    </html>
  );
}