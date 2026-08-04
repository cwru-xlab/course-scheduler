import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import {
  checkAccessAllowlist,
  shouldBypassAllowlist,
} from "@/lib/access-allowlist";
import { verifyToken } from "@/lib/auth";

export const config = {
  matcher: ["/((?!_next/|favicon|cwru\\.jpeg|login|api/auth/).*)"],
};

function clearAuthAndRedirect(request: NextRequest, error: string) {
  const loginUrl = new URL(`/login?error=${encodeURIComponent(error)}`, request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(siteConfig.auth.cookie.name, "", {
    httpOnly: siteConfig.auth.cookie.httpOnly,
    secure: siteConfig.auth.cookie.secure,
    sameSite: siteConfig.auth.cookie.sameSite,
    path: siteConfig.auth.cookie.path,
    maxAge: 0,
  });
  return response;
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    const path = request.nextUrl.pathname + request.nextUrl.search;
    if (path && path !== "/") loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  const user = await verifyToken(token);
  if (!user) {
    return clearAuthAndRedirect(request, "session_expired");
  }

  if (!shouldBypassAllowlist(user.authProvider)) {
    const access = await checkAccessAllowlist(user.networkId);
    if (!access.allowed) {
      return clearAuthAndRedirect(request, "access_denied");
    }
  }

  return NextResponse.next();
}
