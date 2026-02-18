import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;

  // No secret configured → auth disabled (local dev mode)
  if (!secret) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Check Authorization header (for programmatic / external API access)
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return NextResponse.next();

  // Check cookie (for browser sessions)
  const cookie = request.cookies.get("auth_token");
  if (cookie?.value === secret) return NextResponse.next();

  // Unauthorized
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Redirect pages to login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
