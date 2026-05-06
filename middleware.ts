import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("auth-token"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||

    // 👇 これ追加（超重要）
    pathname.startsWith("/repair-status");

  const isLoggedIn = hasSupabaseSessionCookie(request);

  if (!isLoggedIn && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};