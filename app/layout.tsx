"use client";

import "./globals.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isHeadquartersEmail } from "@/lib/auth/headquarters";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isHeadquarters, setIsHeadquarters] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (active) {
        setIsHeadquarters(isHeadquartersEmail(data.user?.email));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const shouldHideNav =
    pathname === "/login" ||
    pathname.startsWith("/invite") ||
    pathname === "/repair-status" ||
    pathname.startsWith("/repair-status/") ||
    pathname === "/repair-request-form" ||
    pathname.startsWith("/repair-request-form/") ||
    pathname === "/support-chat" ||
    pathname.startsWith("/support-chat/");

  return (
    <html lang="ja">
      <body>
        {!shouldHideNav && (
          <div className="p-4 border-b bg-white">
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="btn">
                ホーム
              </Link>
              {isHeadquarters ? (
                <Link href="/warranty-certificates" className="btn">
                  保証書管理
                </Link>
              ) : null}
              <Link href="/repair-requests" className="btn">
                修理受付管理
              </Link>
              <Link href="/warranty-invoices" className="btn">
                請求書管理
              </Link>
              <Link href="/ai-support-inquiries" className="btn">
                AI一次受付
              </Link>
              <Link href="/ai-support-faqs" className="btn">
                FAQ住宅設備
              </Link>
              <Link href="/ai-support-faqs/appliance" className="btn">
                FAQ家電
              </Link>
              <Link href="/ai-support-faqs/solar" className="btn">
                FAQ太陽光
              </Link>
              <Link href="/headquarters" className="btn">
                本部管理
              </Link>
            </div>
          </div>
        )}

        <main>{children}</main>
      </body>
    </html>
  );
}
