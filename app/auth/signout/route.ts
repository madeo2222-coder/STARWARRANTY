import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function shouldDeleteAuthCookie(cookieName: string) {
  return (
    cookieName.includes("auth-token") ||
    cookieName.startsWith("sb-") ||
    cookieName.toLowerCase().includes("supabase")
  );
}

export async function GET(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(loginUrl);

  const cookies = request.cookies.getAll();

  for (const cookie of cookies) {
    if (shouldDeleteAuthCookie(cookie.name)) {
      response.cookies.set(cookie.name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }
  }

  return response;
}

export async function POST(request: NextRequest) {
  return GET(request);
}