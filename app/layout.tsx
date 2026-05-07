"use client";

import "./globals.css";
import { usePathname } from "next/navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const shouldHideNav =
    pathname === "/login" ||
    pathname.startsWith("/invite") ||
    pathname === "/repair-status" ||
    pathname.startsWith("/repair-status/");

  return (
    <html lang="ja">
      <body>
        {!shouldHideNav && (
          <div className="p-4 border-b bg-white">
            <div className="flex flex-wrap gap-2">
              <a href="/" className="btn">ホーム</a>
              <a href="/warranty-certificates" className="btn">保証書管理</a>
              <a href="/repair-requests" className="btn">修理受付管理</a>
              <a href="/warranty-invoices" className="btn">請求書管理</a>
              <a href="/headquarters" className="btn">本部管理</a>
            </div>
          </div>
        )}

        <main>{children}</main>
      </body>
    </html>
  );
}