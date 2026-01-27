import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple middleware - no auth required for internal tool
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect root to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Redirect login page to dashboard (no auth needed)
  if (pathname === "/login" || pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/onboarding"],
};
