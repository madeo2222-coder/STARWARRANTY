import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("auth-token"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isRepairPublicPath =
    pathname.startsWith("/repair-request-form") ||
    pathname.startsWith("/api/repair-requests") ||
    pathname.startsWith("/api/repair-request-attachments");

  const isAiSupportPublicPath =
    pathname === "/support-chat" ||
    pathname.startsWith("/support-chat/") ||
    pathname.startsWith("/api/ai-support-inquiries");

  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/repair-status") ||
    isRepairPublicPath ||
    isAiSupportPublicPath ||
    pathname.startsWith("/api/generate-warranty-pdf");

  const isLoggedIn = hasSupabaseSessionCookie(request);

  if (!isLoggedIn && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();

  if (isRepairPublicPath || isAiSupportPublicPath) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};