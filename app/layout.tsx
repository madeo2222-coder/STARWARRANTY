"use client";

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const metadata: Metadata = {
  title: "StarRevenue Platform",
  description: "StarRevenue Platform",
};

function NavLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        isActive
          ? "rounded bg-black px-4 py-2 text-sm font-medium text-white"
          : "rounded border border-gray-300 px-4 py-2 text-sm font-medium"
      }
    >
      {label}
    </Link>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  return (
    <html lang="ja">
      <body className="bg-white text-black">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-4">
            <NavLink href="/" label="ダッシュボード" isActive={pathname === "/"} />
            <NavLink
              href="/customers"
              label="顧客一覧"
              isActive={pathname.startsWith("/customers")}
            />
            <NavLink
              href="/contracts"
              label="契約一覧"
              isActive={pathname.startsWith("/contracts")}
            />
            <NavLink
              href="/billings"
              label="請求一覧"
              isActive={pathname.startsWith("/billings")}
            />
            <NavLink
              href="/agencies"
              label="代理店管理"
              isActive={pathname.startsWith("/agencies")}
            />
          </div>
        </header>

        <main className="mx-auto max-w-7xl">{children}</main>
      </body>
    </html>
  );
}